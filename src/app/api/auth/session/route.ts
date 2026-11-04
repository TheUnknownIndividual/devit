import { NextResponse } from "next/server";
import { endSession, publicUser, viewer } from "@/lib/accounts";

export async function GET() {
  const { user } = await viewer();
  return NextResponse.json({ user: user ? publicUser(user) : null }, { headers: { "cache-control": "no-store" } });
}

/** Sign out. */
export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
