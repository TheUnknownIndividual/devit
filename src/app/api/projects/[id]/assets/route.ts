import { NextResponse } from "next/server";
import { updateProject } from "@/lib/store";
import { newId, type Asset } from "@/lib/spec";
import { MAX_BYTES, MAX_PER_PROJECT, saveUpload, sniff } from "@/lib/uploads";
import { overLimit } from "@/lib/net";
import { editable } from "@/lib/access";

const dim = (v: string | null) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 20_000 ? Math.round(n) : 0; };

/** One picture as the raw request body; its name and size in headers. Answers the stored asset. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = overLimit(req, "upload", 40);
  if (limited) return limited;
  const { id } = await ctx.params;
  const g = await editable(id);
  if (g instanceof Response) return g;
  const { p } = g;
  if ((p.assets?.length ?? 0) >= MAX_PER_PROJECT) return NextResponse.json({ error: `This project already has ${MAX_PER_PROJECT} pictures.` }, { status: 409 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (512 KB at most)." }, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return NextResponse.json({ error: "That picture is too big (512 KB at most)." }, { status: 413 });
  const ext = sniff(bytes);
  if (!ext) return NextResponse.json({ error: "Only PNG, JPEG, WebP or GIF pictures." }, { status: 415 });
  const assetId = newId(12);
  const file = `${assetId}.${ext}`;
  await saveUpload(id, file, bytes);
  const name = (req.headers.get("x-name") ?? "picture").replace(/[^\w .-]/g, "").slice(0, 60) || "picture";
  const asset: Asset = { id: assetId, url: `/api/assets/${id}/${file}`, name, w: dim(req.headers.get("x-w")), h: dim(req.headers.get("x-h")), bytes: bytes.length, at: Date.now() };
  await updateProject(id, (q) => { q.assets = [...(q.assets ?? []), asset]; });
  return NextResponse.json({ asset });
}
