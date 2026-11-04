import { NextResponse } from "next/server";
import { z } from "zod";
import { keyOf, publicUser, saveKey, updateUser, viewer } from "@/lib/accounts";
import { KEY_IDS } from "@/lib/keyscope";
import { verifyKey } from "@/lib/apikeys";
import { overLimit } from "@/lib/net";

// Bring your own keys. A key is checked with its provider, sealed (AES-256-GCM) and stored; only its last four
// characters (and an RPC's host) ever come back.

const Post = z.object({ id: z.enum(KEY_IDS), key: z.string().trim().max(400).optional(), save: z.boolean().optional() });
const Patch = z.object({ id: z.enum(KEY_IDS), use: z.boolean() });

export async function POST(req: Request) {
  const limited = overLimit(req, "keys", 60);
  if (limited) return limited;
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { id, save } = parsed.data;
  // No key sent: re-check the saved one.
  const key = parsed.data.key || keyOf(user, id);
  if (!key) return NextResponse.json({ ok: false, reason: "Paste a key first." }, { status: 400 });
  const r = await verifyKey(id, key);
  if (!r.ok) return NextResponse.json(r);
  let u = user;
  if (save && parsed.data.key) u = (await saveKey(user.id, id, key, id.startsWith("rpc:") ? new URL(key).host : undefined)) ?? user;
  else if (!parsed.data.key) u = (await updateUser(user.id, (x) => { const k = x.keys[id]; if (k) k.verifiedAt = Date.now(); })) ?? user;
  return NextResponse.json({ ok: true, user: publicUser(u) });
}

export async function PATCH(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const u = await updateUser(user.id, (x) => { const k = x.keys[parsed.data.id]; if (k) k.use = parsed.data.use; });
  return NextResponse.json({ user: u ? publicUser(u) : null });
}

export async function DELETE(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = z.enum(KEY_IDS).safeParse(new URL(req.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const u = await updateUser(user.id, (x) => { delete x.keys[id.data]; });
  return NextResponse.json({ user: u ? publicUser(u) : null });
}
