import { FILE_RE, TYPES, readUpload, type Ext } from "@/lib/uploads";

/** A team's uploaded picture. Its type comes from the name the server gave it, and nosniff keeps browsers to it. */
export async function GET(_req: Request, ctx: { params: Promise<{ project: string; file: string }> }) {
  const { project, file } = await ctx.params;
  if (!/^[a-z0-9]{6,24}$/.test(project) || !FILE_RE.test(file)) return new Response("Not found", { status: 404 });
  const bytes = await readUpload(project, file);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": TYPES[file.split(".").pop() as Ext],
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
