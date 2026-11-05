import { NextResponse } from "next/server";
import { z } from "zod";
import { publicUser, removeMethod, viewer } from "@/lib/accounts";

const Body = z.object({ kind: z.enum(["passkey", "email", "google", "apple", "github", "solana", "evm", "near"]), id: z.string().max(400) });

/** Unlinks one sign-in method. The last one stays, so nobody locks themselves out. */
export async function DELETE(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!user.methods.some((m) => m.kind === parsed.data.kind && m.id === parsed.data.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const u = await removeMethod(user.id, parsed.data.kind, parsed.data.id);
  if (u === "last") return NextResponse.json({ error: "That's your only way to sign in. Add another first." }, { status: 409 });
  return NextResponse.json({ user: u ? publicUser(u) : null });
}
