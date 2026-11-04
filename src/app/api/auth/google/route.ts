import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { putChallenge } from "@/lib/accounts";
import { callbackUrl, googleOn, safeNext, STATE_COOKIE } from "@/lib/google";
import { overLimit } from "@/lib/net";
import { token } from "@/lib/secrets";

// Starts Google sign-in: a full-page hop to Google, back to /api/auth/google/callback. ?next= is where to land after.
export async function GET(req: NextRequest) {
  if (!googleOn()) return NextResponse.json({ error: "Google sign-in isn't set up on this server yet." }, { status: 503 });
  const limited = overLimit(req, "google", 30);
  if (limited) return limited;
  const state = token(18), verifier = token(32), nonce = token(18);
  await putChallenge(`google-${state}`, { verifier, nonce, next: safeNext(req.nextUrl.searchParams.get("next")) }, 10 * 60_000);
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(req), response_type: "code", scope: "openid email profile",
    state, nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(u.toString(), 302);
  // Ties the answer to this browser, so nobody can sign you into their account with their own link.
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
  return res;
}
