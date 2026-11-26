import type { OAuthProvider } from "../oauth.js";
import { config } from "../../config.js";

export const githubProvider: OAuthProvider = "github";

export function githubAuthorizationUrl(state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.GITHUB_OAUTH_CLIENT_ID!);
  url.searchParams.set("redirect_uri", config.GITHUB_OAUTH_REDIRECT_URI!);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(code: string): Promise<{ subject: string; email: string }> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.GITHUB_OAUTH_CLIENT_ID,
      client_secret: config.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: config.GITHUB_OAUTH_REDIRECT_URI
    }),
    signal: AbortSignal.timeout(15000)
  });
  const token = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !token.access_token) throw new Error("GitHub OAuth token exchange failed.");

  const headers = {
    Authorization: "Bearer " + token.access_token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Friday-Agent/0.1"
  };
  const userResponse = await fetch("https://api.github.com/user", {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  const user = await userResponse.json() as { id?: number; email?: string | null };
  if (!userResponse.ok || !user.id) throw new Error("GitHub user lookup failed.");

  let email = user.email || "";
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers,
      signal: AbortSignal.timeout(15000)
    });
    const emails = await emailsResponse.json() as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
    if (!emailsResponse.ok) throw new Error("GitHub email lookup failed.");
    email = emails.find(item => item.primary && item.verified)?.email || emails.find(item => item.verified)?.email || "";
  }
  if (!email) throw new Error("GitHub did not return a verified email address.");
  return { subject: String(user.id), email };
}
