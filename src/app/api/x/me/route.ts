import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** The X account this browser connected, if any. */
export async function GET() {
  const raw = (await cookies()).get("ss_x")?.value;
  let me: { handle: string; name: string; avatar: string | null } | null = null;
  try { me = raw ? JSON.parse(raw) : null; } catch { me = null; }
  return NextResponse.json({ oauth: !!process.env.X_CLIENT_ID, me });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("ss_x");
  return res;
}
