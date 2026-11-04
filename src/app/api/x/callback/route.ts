import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** X sends the person back here: swap the code for a token, read the handle, keep only the handle. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const jar = await cookies();
  const [state, verifier] = (jar.get("ss_x_oauth")?.value ?? "").split(".");
  const back = (q: string) => {
    const res = NextResponse.redirect(`${u.origin}/?x=${q}#start`);
    res.cookies.delete({ name: "ss_x_oauth", path: "/api/x" });
    return res;
  };
  if (!state || u.searchParams.get("state") !== state || !u.searchParams.get("code")) return back("denied");
  const clientId = process.env.X_CLIENT_ID ?? "";
  const secret = process.env.X_CLIENT_SECRET;
  const body = new URLSearchParams({
    code: u.searchParams.get("code")!, grant_type: "authorization_code", client_id: clientId,
    redirect_uri: process.env.X_REDIRECT_URI || `${u.origin}/api/x/callback`, code_verifier: verifier,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (secret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
  try {
    const tok = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) }).then((r) => r.json() as Promise<{ access_token?: string }>);
    if (!tok.access_token) return back("failed");
    const me = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,name", { headers: { authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10_000) }).then((r) => r.json() as Promise<{ data?: { username?: string; name?: string; profile_image_url?: string } }>);
    if (!me.data?.username) return back("failed");
    const res = back("connected");
    res.cookies.set("ss_x", JSON.stringify({ handle: me.data.username, name: me.data.name ?? me.data.username, avatar: me.data.profile_image_url?.replace("_normal.", "_400x400.") ?? null }), { httpOnly: true, sameSite: "lax", secure: u.protocol === "https:", maxAge: 30 * 86400, path: "/" });
    return res;
  } catch {
    return back("failed");
  }
}
