import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { AuthService } from "./service.js";

export type OAuthProvider = "google" | "github";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");

export class OAuthService {
  constructor(private readonly auth = new AuthService()) {}

  isConfigured(provider: OAuthProvider): boolean {
    return provider === "google"
      ? Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI)
      : Boolean(config.GITHUB_OAUTH_CLIENT_ID && config.GITHUB_OAUTH_CLIENT_SECRET && config.GITHUB_OAUTH_REDIRECT_URI);
  }

  redirectUri(provider: OAuthProvider): string {
    return provider === "google" ? config.GOOGLE_REDIRECT_URI! : config.GITHUB_OAUTH_REDIRECT_URI!;
  }

  async createState(provider: OAuthProvider): Promise<string> {
    const state = random();
    await pool.query(
      "INSERT INTO oauth_states (state_hash, provider, redirect_uri, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')",
      [hash(state), provider, this.redirectUri(provider)]
    );
    return state;
  }

  async consumeState(provider: OAuthProvider, state: string): Promise<string> {
    if (!state || typeof state !== "string" || state.length > 256) throw new Error("Invalid or expired OAuth state.");
    const result = await pool.query<{ redirect_uri: string }>(
      "DELETE FROM oauth_states WHERE state_hash = $1 AND provider = $2 AND expires_at > NOW() RETURNING redirect_uri",
      [hash(state), provider]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Invalid or expired OAuth state.");
    return row.redirect_uri;
  }

  async signInWithIdentity(provider: OAuthProvider, subject: string, email: string): Promise<string> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedSubject = subject.trim();
    if (!normalizedEmail || !normalizedSubject || normalizedSubject.length > 512) {
      throw new Error("OAuth provider returned an invalid identity.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ user_id: string }>(
        "SELECT user_id FROM user_auth_identities WHERE provider = $1 AND provider_subject = $2",
        [provider, normalizedSubject]
      );
      let userId = existing.rows[0]?.user_id;

      if (!userId) {
        const byEmail = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
        userId = byEmail.rows[0]?.id;
        if (!userId) {
          const created = await client.query<{ id: string }>(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
            [normalizedEmail, this.auth.createUnusablePasswordHash()]
          );
          userId = created.rows[0]!.id;
        }
      }

      await client.query(
        "INSERT INTO user_auth_identities (user_id, provider, provider_subject, provider_email) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, provider_subject) DO UPDATE SET provider_email = EXCLUDED.provider_email, updated_at = NOW()",
        [userId, provider, normalizedSubject, normalizedEmail]
      );
      await client.query("COMMIT");
      return userId!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createExchangeCode(userId: string): Promise<string> {
    const code = random();
    await pool.query(
      "INSERT INTO oauth_codes (code_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '2 minutes')",
      [hash(code), userId]
    );
    return code;
  }

  async exchangeCode(code: string): Promise<{ token: string; user: { id: string; email: string } }> {
    if (!code || typeof code !== "string" || code.length > 256) throw new Error("Invalid or expired OAuth code.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ user_id: string }>(
        "UPDATE oauth_codes SET consumed_at = NOW() WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > NOW() RETURNING user_id",
        [hash(code)]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Invalid or expired OAuth code.");

      const userResult = await client.query<{ id: string; email: string }>(
        "SELECT id, email FROM users WHERE id = $1",
        [row.user_id]
      );
      const user = userResult.rows[0];
      if (!user) throw new Error("OAuth account no longer exists.");

      const token = random();
      await client.query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 day'))",
        [user.id, hash(token), config.AUTH_SESSION_DAYS]
      );
      await client.query("COMMIT");
      return { token, user };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
