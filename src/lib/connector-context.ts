import { z } from "zod";
import { getUser, type StoredConnector } from "./accounts";
import { askJson, llmAvailable } from "./llm";
import { callTool, type McpTool } from "./mcp";
import { unseal } from "./secrets";
import type { Project } from "./spec";

// The agent's read access to the owner's connectors. One extra model step picks up to two read-only tool calls,
// they run, and the results go into the main prompt as "Context from your connectors". No connectors: nothing runs.

const TOTAL = 4000;
const Calls = z.object({ calls: z.array(z.object({ connector: z.string().max(60), tool: z.string().max(80), args: z.record(z.string(), z.unknown()).optional() })).max(2) });

export interface ConnectorContext { text: string; used: string[] }

/** The owner's connectors that are on for this project and have at least one read tool. */
export async function activeConnectors(p: Pick<Project, "ownerId" | "connectorsOff">): Promise<StoredConnector[]> {
  if (!p.ownerId) return [];
  const u = await getUser(p.ownerId);
  const off = new Set(p.connectorsOff ?? []);
  return (u?.connectors ?? []).filter((c) => !off.has(c.id) && !c.error && c.tools?.some((t) => t.readOnly));
}

export async function connectorContext(p: Project, request: string): Promise<ConnectorContext> {
  const none: ConnectorContext = { text: "", used: [] };
  if (!llmAvailable()) return none;
  const conns = await activeConnectors(p);
  if (!conns.length) return none;
  try {
    const menu = conns.map((c) => ({ connector: c.name, tools: (c.tools ?? []).filter((t) => t.readOnly).slice(0, 25).map((t) => ({ tool: t.name, about: t.description.slice(0, 160) })) }));
    const res = await askJson(
      "The team connected outside data sources. Which of these read-only tools, if any, would help answer this? Reply {calls:[{connector, tool, args}]}, at most 2, with args as the tool needs them (only values the request gives or that are plain). Reply {calls:[]} if none help; most requests need none.",
      JSON.stringify({ request: request.slice(0, 1200), connectors: menu }),
      (v) => { const r = Calls.safeParse(v); return r.success ? r.data : null; }, "light", "edit");
    if (!res?.value.calls.length) return none;
    const parts: string[] = [];
    const used: string[] = [];
    for (const call of res.value.calls.slice(0, 2)) {
      const c = conns.find((x) => x.name === call.connector);
      const tool: McpTool | undefined = c?.tools?.find((t) => t.name === call.tool && t.readOnly);
      if (!c || !tool) continue;
      const secret = c.enc ? unseal(c.enc) ?? undefined : undefined;
      try {
        const out = await callTool({ url: c.url, header: c.header, secret }, tool, call.args ?? {});
        if (out.trim()) { parts.push(`${c.name} · ${tool.name}:\n${out.trim()}`); used.push(c.name); }
      } catch { /* a failing connector never blocks the answer */ }
    }
    if (!parts.length) return none;
    const each = Math.floor(TOTAL / parts.length);
    return { text: parts.map((x) => x.slice(0, each)).join("\n\n").slice(0, TOTAL), used: [...new Set(used)] };
  } catch {
    return none;
  }
}
