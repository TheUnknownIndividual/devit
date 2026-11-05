import { readAvatar } from "@/lib/avatars";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await readAvatar(id);
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.bytes), { headers: { "content-type": a.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
