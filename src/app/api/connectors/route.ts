import { NextResponse } from "next/server";
import { z } from "zod";
import { connectorView as view, updateUser, viewer, type StoredConnector, type User } from "@/lib/accounts";
import { HEADER_NAME, listTools } from "@/lib/mcp";
import { isPublicHttps, overLimit } from "@/lib/net";
import { seal } from "@/lib/secrets";
import { newId } from "@/lib/spec";

// Connectors (MCP): remote servers the agent may read from. Per account, so they follow the person across projects.
// Secrets are sealed and never come back; only the last four characters do.

const Post = z.object({
  name: z.string().trim().min(1).max(40),
  url: z.string().trim().max(400).refine(isPublicHttps, "Use a public https address."),
  header: z.string().trim().max(40).regex(HEADER_NAME, "That header name isn't valid.").optional().or(z.literal("")),
  secret: z.string().trim().max(600).optional(),
});

const list = (u: User) => (u.connectors ?? []).map(view);

export async function GET() {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ connectors: list(user) });
}

export async function POST(req: Request) {
  const limited = overLimit(req, "connectors", 30);
  if (limited) return limited;
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const b = parsed.data;
  if ((user.connectors ?? []).length >= 8) return NextResponse.json({ error: "You can connect up to 8. Remove one first." }, { status: 409 });
  let tools;
  try { tools = await listTools({ url: b.url, header: b.header || undefined, secret: b.secret || undefined }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't connect." }, { status: 422 }); }
  const c: StoredConnector = {
    id: newId(8), name: b.name, url: b.url, ...(b.header ? { header: b.header } : {}),
    ...(b.secret ? { enc: seal(b.secret), last4: b.secret.slice(-4) } : {}), tools, at: Date.now(), checkedAt: Date.now(),
  };
  const u = await updateUser(user.id, (x) => { x.connectors = [...(x.connectors ?? []), c].slice(0, 8); });
  return NextResponse.json({ connectors: u ? list(u) : [], added: view(c) });
}

export async function DELETE(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const u = await updateUser(user.id, (x) => { x.connectors = (x.connectors ?? []).filter((c) => c.id !== id); });
  return NextResponse.json({ connectors: u ? list(u) : [] });
}
