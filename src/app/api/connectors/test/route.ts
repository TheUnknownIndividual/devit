import { NextResponse } from "next/server";
import { connectorView as view, updateUser, viewer } from "@/lib/accounts";
import { listTools } from "@/lib/mcp";
import { overLimit } from "@/lib/net";
import { unseal } from "@/lib/secrets";

/** Connects again and refreshes the tool list of one saved connector. */
export async function POST(req: Request) {
  const limited = overLimit(req, "connectors", 30);
  if (limited) return limited;
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const c = (user.connectors ?? []).find((x) => x.id === id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  let tools: Awaited<ReturnType<typeof listTools>> | null = null;
  let error: string | undefined;
  try { tools = await listTools({ url: c.url, header: c.header, secret: c.enc ? unseal(c.enc) ?? undefined : undefined }); }
  catch (e) { error = e instanceof Error ? e.message : "Couldn't connect."; }
  const u = await updateUser(user.id, (x) => {
    const t = (x.connectors ?? []).find((k) => k.id === id);
    if (!t) return;
    t.checkedAt = Date.now();
    if (tools) { t.tools = tools; delete t.error; } else t.error = error;
  });
  return NextResponse.json({ connectors: (u?.connectors ?? []).map(view), error: error ?? null });
}
