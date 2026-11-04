import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

// "Connect your X": OAuth 2.0 with PKCE. We only read who you are (users.read); the token is dropped after that.
export async function GET(req: Request) {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "X sign-in isn't set up on this server. Type your handle instead." }, { status: 404 });
  const origin = new URL(req.url).origin;
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: process.env.X_REDIRECT_URI || `${origin}/api/x/callback`,
    scope: "users.read tweet.read", state, code_challenge: challenge, code_challenge_method: "S256",
  });
  const res = NextResponse.redirect(`https://x.com/i/oauth2/authorize?${q}`);
  res.cookies.set("ss_x_oauth", `${state}.${verifier}`, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), maxAge: 600, path: "/api/x" });
  return res;
}
