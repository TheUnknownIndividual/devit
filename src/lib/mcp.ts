import { isPublicHttps } from "./net";

// A minimal MCP client over Streamable HTTP (JSON-RPC 2.0 POSTs). Replies come back as JSON or as an event stream;
// both are read. Every call opens its own short session: initialize, notifications/initialized, then the request.
// Only public https servers are reached, with short timeouts and a size cap. Only read-only tools are ever called.

export interface McpTarget { url: string; header?: string; secret?: string }
export interface McpTool { name: string; description: string; readOnly: boolean }

const PROTOCOL = "2025-06-18";
const TIMEOUT = 10_000;
const MAX_BYTES = 200_000;
const READ_NAME = /^(get|list|search|read|fetch|find|query|lookup|describe)[_-]?/i;

export const HEADER_NAME = /^[A-Za-z0-9-]{1,40}$/;

/** Read-only by the server's own hint, or by a read-style name that isn't marked destructive. */
export function isReadOnlyTool(t: { name?: unknown; annotations?: { readOnlyHint?: unknown; destructiveHint?: unknown } }): boolean {
  const a = t.annotations ?? {};
  if (a.readOnlyHint === true) return true;
  return typeof t.name === "string" && READ_NAME.test(t.name) && a.destructiveHint !== true;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > MAX_BYTES) { await reader.cancel().catch(() => undefined); throw new Error("The server's reply was too large."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The JSON-RPC message answering `id`, from a JSON body or from the data: lines of an event stream. */
function pick(body: string, type: string, id: number): { result?: unknown; error?: { message?: string } } | null {
  const msgs: unknown[] = [];
  if (type.includes("text/event-stream")) {
    for (const ev of body.split(/\r?\n\r?\n/)) {
      const data = ev.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data) continue;
      try { msgs.push(JSON.parse(data)); } catch { /* skip */ }
    }
  } else {
    try { const j = JSON.parse(body); msgs.push(...(Array.isArray(j) ? j : [j])); } catch { return null; }
  }
  return (msgs.find((m) => (m as { id?: number })?.id === id) as { result?: unknown; error?: { message?: string } } | undefined) ?? null;
}

class Session {
  private sid: string | null = null;
  private n = 0;
  constructor(private t: McpTarget) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };
    if (this.sid) h["mcp-session-id"] = this.sid;
    if (this.t.secret) {
      const name = this.t.header?.trim() || "Authorization";
      h[name] = name.toLowerCase() === "authorization" && !/^(bearer|basic|token)\s/i.test(this.t.secret) ? `Bearer ${this.t.secret}` : this.t.secret;
    }
    return h;
  }

  private async post(payload: object, id?: number) {
    const res = await fetch(this.t.url, { method: "POST", headers: this.headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT), redirect: "error", cache: "no-store" });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sid = sid;
    if (id === undefined) { await res.body?.cancel().catch(() => undefined); return null; }
    if (res.status === 401 || res.status === 403) throw new Error("The server refused the key (needs a valid API key or token).");
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    const msg = pick(await readCapped(res), res.headers.get("content-type") ?? "", id);
    if (!msg) throw new Error("The server didn't answer like an MCP server.");
    if (msg.error) throw new Error(String(msg.error.message ?? "The server returned an error.").slice(0, 200));
    return msg.result;
  }

  async request(method: string, params?: object) {
    const id = ++this.n;
    return this.post({ jsonrpc: "2.0", id, method, params }, id);
  }

  async open() {
    await this.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "sitesmith", version: "1" } });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => undefined);
  }
}

function check(t: McpTarget) {
  if (!isPublicHttps(t.url)) throw new Error("Use a public https address.");
  if (t.header && !HEADER_NAME.test(t.header)) throw new Error("That header name isn't valid.");
}

function wrap<T>(f: () => Promise<T>): Promise<T> {
  return f().catch((e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    if (/aborted|timeout/i.test(m) || (e as { name?: string })?.name === "TimeoutError") throw new Error("The server took too long to answer.");
    if (m.startsWith("The server") || m.startsWith("Use a") || m.startsWith("That header")) throw e;
    throw new Error("Couldn't reach that server.");
  });
}

/** Connects and lists the server's tools, each marked read-only or not. */
export function listTools(t: McpTarget): Promise<McpTool[]> {
  return wrap(async () => {
    check(t);
    const s = new Session(t);
    await s.open();
    const out: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const r = (await s.request("tools/list", cursor ? { cursor } : {})) as { tools?: Array<{ name?: unknown; description?: unknown; annotations?: { readOnlyHint?: unknown; destructiveHint?: unknown } }>; nextCursor?: string } | undefined;
      for (const x of r?.tools ?? []) {
        if (typeof x.name !== "string" || !x.name) continue;
        out.push({ name: x.name.slice(0, 80), description: typeof x.description === "string" ? x.description.slice(0, 300) : "", readOnly: isReadOnlyTool(x) });
      }
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return out.slice(0, 60);
  });
}

/** Calls one tool and returns its text. The caller must have checked the tool is read-only; this checks again. */
export function callTool(t: McpTarget, tool: McpTool, args: Record<string, unknown>): Promise<string> {
  return wrap(async () => {
    check(t);
    if (!tool.readOnly) throw new Error("That tool changes things, so it is never called.");
    const s = new Session(t);
    await s.open();
    const r = (await s.request("tools/call", { name: tool.name, arguments: args })) as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown; isError?: boolean } | undefined;
    const text = (r?.content ?? []).filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n") || (r?.structuredContent ? JSON.stringify(r.structuredContent) : "");
    if (r?.isError) throw new Error(text.slice(0, 200) || "The tool reported an error.");
    return text;
  });
}
