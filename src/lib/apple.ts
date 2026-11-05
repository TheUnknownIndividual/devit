import { createPrivateKey, sign } from "node:crypto";
import type { NextRequest } from "next/server";
import { publicOrigin } from "./google";

// Sign in with Apple: the web code flow, no SDK. Apple POSTs the answer back (form_post, needed to get the name and email),
// so the state cookie is SameSite=None. The ID token comes straight from Apple's token endpoint over TLS, so its claims are
// checked (issuer, audience, expiry, nonce) without fetching Apple's keys, as with Google.
// Turn it on with APPLE_CLIENT_ID (the Services ID), APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8, \n escaped is fine).

export const appleOn = () => !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
export const APPLE_STATE_COOKIE = "ss_apple";
export const appleCallbackUrl = (req: NextRequest) => `${publicOrigin(req)}/api/auth/apple/callback`;

/** Apple wants the client secret as a short-lived ES256 JWT signed with the team's key. */
function clientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: process.env.APPLE_KEY_ID });
  const body = b64({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: process.env.APPLE_CLIENT_ID });
  const key = createPrivateKey(process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

export interface AppleUser { sub: string; email: string | null; privateEmail: boolean }

export async function appleExchange(code: string, redirectUri: string, nonce: string): Promise<AppleUser> {
  const r = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID!, client_secret: clientSecret(), code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!r.ok || !j.id_token) throw new Error(j.error === "invalid_client" ? "Apple didn't accept this server's keys." : "Apple didn't confirm the sign-in.");
  let c: Record<string, unknown>;
  try { c = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString("utf8")); } catch { throw new Error("Apple sent an unreadable answer."); }
  const ok = c.iss === "https://appleid.apple.com" && c.aud === process.env.APPLE_CLIENT_ID && typeof c.exp === "number" && c.exp * 1000 > Date.now() && c.nonce === nonce;
  if (!ok || typeof c.sub !== "string") throw new Error("Apple's answer didn't check out.");
  const verified = c.email_verified === true || c.email_verified === "true";
  return {
    sub: c.sub,
    email: verified && typeof c.email === "string" ? c.email.toLowerCase() : null,
    privateEmail: c.is_private_email === true || c.is_private_email === "true",
  };
}
