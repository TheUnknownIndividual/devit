import type { NextRequest } from "next/server";

// Google sign-in: the OAuth code flow with PKCE, no SDK. The ID token comes straight from Google's token endpoint over
// TLS, so its claims are checked (issuer, audience, expiry, nonce, verified email) without fetching Google's keys.
// Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a "Web application" OAuth client) to turn it on.

export const googleOn = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const STATE_COOKIE = "ss_google";

/** This server's public origin: APP_URL when set, else the host the visitor reached (the tunnel or the Worker's). */
export function publicOrigin(req: NextRequest): string {
  const fixed = process.env.APP_URL?.trim();
  if (fixed) return new URL(fixed).origin;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const callbackUrl = (req: NextRequest) => `${publicOrigin(req)}/api/auth/google/callback`;

/** Only paths on this site, never another host. */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n.slice(0, 300) : "/");

export interface GoogleUser { sub: string; email: string; name: string | null; picture: string | null }

export async function exchange(code: string, verifier: string, redirectUri: string, nonce: string): Promise<GoogleUser> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!r.ok || !j.id_token) throw new Error(j.error === "redirect_uri_mismatch" ? "This address isn't listed in the Google client's redirect URIs." : "Google didn't confirm the sign-in.");
  let c: Record<string, unknown>;
  try { c = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString("utf8")); } catch { throw new Error("Google sent an unreadable answer."); }
  const ok = (c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com") && c.aud === process.env.GOOGLE_CLIENT_ID && typeof c.exp === "number" && c.exp * 1000 > Date.now() && c.nonce === nonce;
  if (!ok || typeof c.sub !== "string") throw new Error("Google's answer didn't check out.");
  if (c.email_verified !== true || typeof c.email !== "string") throw new Error("That Google account has no verified email.");
  return { sub: c.sub, email: c.email.toLowerCase(), name: typeof c.name === "string" ? c.name.slice(0, 80) : null, picture: typeof c.picture === "string" && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(c.picture) ? c.picture.slice(0, 500) : null };
}
