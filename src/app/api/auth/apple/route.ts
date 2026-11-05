import { NextResponse, type NextRequest } from "next/server";
import { putChallenge } from "@/lib/accounts";
import { APPLE_STATE_COOKIE, appleCallbackUrl, appleOn } from "@/lib/apple";
import { safeNext } from "@/lib/google";
import { overLimit } from "@/lib/net";
import { token } from "@/lib/secrets";

// Starts Sign in with Apple: a full-page hop to Apple, which POSTs back to /api/auth/apple/callback. ?next= is where to land.
export async function GET(req: NextRequest) {
  if (!appleOn()) return NextResponse.json({ error: "Apple sign-in isn't set up on this server yet." }, { status: 503 });
  const limited = overLimit(req, "apple", 30);
  if (limited) return limited;
  const state = token(18), nonce = token(18);
  await putChallenge(`apple-${state}`, { nonce, next: safeNext(req.nextUrl.searchParams.get("next")) }, 10 * 60_000);
  const u = new URL("https://appleid.apple.com/auth/authorize");
  u.search = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!, redirect_uri: appleCallbackUrl(req), response_type: "code", response_mode: "form_post",
    scope: "name email", state, nonce,
  }).toString();
  const res = NextResponse.redirect(u.toString(), 302);
  // Apple's answer is a cross-site POST, which only carries a SameSite=None cookie.
  res.cookies.set(APPLE_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "none", path: "/api/auth/apple", maxAge: 600 });
  return res;
}
