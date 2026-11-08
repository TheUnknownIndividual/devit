import { promises as fs } from "node:fs";
import path from "node:path";
import { learnedShot } from "@/lib/design/learned";

// First-screen screenshots of the reference sites a build drew on (design-refs/, and devit's own learned sites), so
// the builder's board can show what the art director is borrowing from.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9.-]{1,60}$/i.test(id) || id.includes("..")) return new Response("not found", { status: 404 });
  const file = id.startsWith("devit-") ? learnedShot(id) : path.join(process.cwd(), "design-refs", `${id}.jpg`);
  try {
    const data = await fs.readFile(file);
    return new Response(new Uint8Array(data), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
