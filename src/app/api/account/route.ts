import { NextResponse } from "next/server";
import { z } from "zod";
import { publicUser, updateUser, viewer } from "@/lib/accounts";

const Patch = z.object({ name: z.string().trim().max(60) });

export async function GET() {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ user: publicUser(user) }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Names are 60 characters at most." }, { status: 400 });
  const u = await updateUser(user.id, (u) => { u.name = parsed.data.name || null; });
  return NextResponse.json({ user: u ? publicUser(u) : null });
}
