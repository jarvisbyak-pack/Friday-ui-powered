import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { pool } from "../db/pool.js";
import { config } from "../config.js";

type UserRow = { id: string; email: string; password_hash: string; created_at: Date };

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, n, r, p, saltEncoded, hashEncoded] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltEncoded || !hashEncoded) return false;
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = scryptSync(password, Buffer.from(saltEncoded, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  createUnusablePasswordHash(): string {
    return hashPassword(randomBytes(48).toString("base64url"));
  }
  async register(email: string, password: string): Promise<{ id: string; email: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");

    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash, created_at`,
      [normalizedEmail, hashPassword(password)]
    );
    return { id: rows[0]!.id, email: rows[0]!.email };
  }

  async login(email: string, password: string): Promise<{ token: string; user: { id: string; email: string } }> {
    const normalizedEmail = email.trim().toLowerCase();
    const { rows } = await pool.query<UserRow>(
      `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
      [normalizedEmail]
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid email or password.");
    }

    const token = randomBytes(32).toString("base64url");
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 day'))`,
      [user.id, hashToken(token), config.AUTH_SESSION_DAYS]
    );

    return { token, user: { id: user.id, email: user.email } };
  }

  async authenticate(token: string): Promise<{ id: string; email: string } | undefined> {
    const { rows } = await pool.query<{ id: string; email: string }>(
      `SELECT u.id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()`,
      [hashToken(token)]
    );
    return rows[0];
  }

  async revoke(token: string): Promise<void> {
    await pool.query(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)]
    );
  }
}
