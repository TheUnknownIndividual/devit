import { NextResponse } from "next/server";
import { updateUser, viewer } from "@/lib/accounts";

/** Disconnect GitHub for code export (the sign-in method, if any, stays until removed in Settings). */
export async function DELETE() {
  const v = await viewer();
  if (!v.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await updateUser(v.user.id, (u) => { u.github = undefined; });
  return NextResponse.json({ ok: true });
}
