import type { OAuthProvider } from "../oauth.js";
import { config } from "../../config.js";

export const googleProvider: OAuthProvider = "google";

export function googleAuthorizationUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<{ subject: string; email: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      redirect_uri: config.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code"
    }),
    signal: AbortSignal.timeout(15000)
  });
  const token = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !token.access_token) throw new Error("Google OAuth token exchange failed.");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: "Bearer " + token.access_token },
    signal: AbortSignal.timeout(15000)
  });
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean };
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google did not return a verified email address.");
  }
  return { subject: profile.sub, email: profile.email };
}
