import { NextResponse } from "next/server";
import { z } from "zod";
import { publicUser, viewer } from "@/lib/accounts";
import { findUser, grantPlan, isAdmin } from "@/lib/billing";

// Support and testing: an admin (env ADMINS) sets any account's plan by hand. Same as `pnpm grant-plan`.
const Body = z.object({ user: z.string().trim().min(3).max(120), plan: z.enum(["free", "pro", "team"]), days: z.number().int().min(1).max(3650).nullable().optional() });

export async function POST(req: Request) {
  const { user: me } = await viewer();
  if (!isAdmin(me)) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give an account id or email, a plan and days." }, { status: 400 });
  const target = await findUser(parsed.data.user);
  if (!target) return NextResponse.json({ error: "No account with that id or email." }, { status: 404 });
  const u = await grantPlan(target.id, parsed.data.plan, parsed.data.days ?? null, me!.id);
  if (!u) return NextResponse.json({ error: "No account with that id or email." }, { status: 404 });
  return NextResponse.json({ ok: true, id: u.id, plan: publicUser(u).plan, planUntil: u.planUntil ?? null, self: u.id === me!.id ? publicUser(u) : undefined });
}
