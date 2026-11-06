"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, LogIn, RefreshCw, Trash2, Unplug } from "lucide-react";
import { openSignIn, useSession } from "@/components/account/session";
import type { PublicProject } from "@/lib/public";

// Connectors (MCP): remote servers the agent may read from while it plans, answers and edits. They belong to the
// account and follow it across projects; each project can switch them off. Tools that change things are never run.

interface Tool { name: string; description: string; readOnly: boolean }
interface Conn { id: string; name: string; host: string; header: string | null; last4: string | null; checkedAt: number; error: string | null; tools: Tool[] }

/** Sources the builder already reads on its own, found in the code (lib/chain.ts, lib/research.ts, lib/treasury.ts). */
const BUILT_IN = [
  { name: "DexScreener", what: "Pairs, price, volume and market cap for a contract address on every chain." },
  { name: "GeckoTerminal", what: "Pool data, trades and price history where DexScreener has gaps." },
  { name: "CoinGecko", what: "A token's website, X and Telegram links, read by contract address." },
];

const post = (url: string, body?: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export function Connectors({ project, onSaved, onClose }: { project: PublicProject; onSaved: (p: PublicProject) => void; onClose: () => void }) {
  const { user } = useSession();
  const [list, setList] = useState<Conn[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", header: "", secret: "" });
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; tools?: Tool[] } | null>(null);
  const off = new Set(project.connectorsOff ?? []);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/connectors").then((r) => r.json()).then((j: { connectors?: Conn[] }) => setList(j.connectors ?? [])).catch(() => setList([]));
  }, [user]);

  async function add() {
    setAdding(true);
    setResult(null);
    const r = await post("/api/connectors", { name: form.name, url: form.url, header: form.header, secret: form.secret || undefined }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { error?: string; connectors?: Conn[]; added?: Conn }) : { error: "Couldn't reach sitesmith." };
    setAdding(false);
    if (r?.ok && j.connectors) {
      setList(j.connectors);
      setForm({ name: "", url: "", header: "", secret: "" });
      setResult({ ok: true, text: `Connected to ${j.added?.host ?? "the server"}.`, tools: j.added?.tools });
    } else setResult({ ok: false, text: j.error ?? "Couldn't connect." });
  }

  async function refresh(id: string) {
    setBusy(id);
    const r = await post(`/api/connectors/test?id=${id}`).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { connectors?: Conn[] }) : {};
    if (j.connectors) setList(j.connectors);
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(id);
    const j = (await fetch(`/api/connectors?id=${id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => ({}))) as { connectors?: Conn[] };
    if (j.connectors) setList(j.connectors);
    setBusy(null);
  }

  async function toggle(id: string, on: boolean) {
    const next = on ? [...off].filter((x) => x !== id) : [...off, id];
    const r = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectorsOff: next }) });
    if (r.ok) onSaved((await r.json()) as PublicProject);
  }

  return (
    <div className="min-w-0 animate-rise">
      <div className="text-[15px] font-semibold text-white">Connectors (MCP)</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">The agent can read from these while it plans, answers and edits. It never runs tools that change things.</p>

      {!user ? (
        <div className="mt-4 space-y-3 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
          <p className="text-[13px] text-zinc-400">Sign in to connect your own MCP servers. They stay on your account and work in all your projects.</p>
          <button type="button" className="btn btn-primary" onClick={() => { onClose(); openSignIn(); }}><LogIn size={15} /> Sign in</button>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {list === null && <div className="flex items-center gap-2 text-[12.5px] text-zinc-500"><Loader2 size={14} className="animate-spin" /> Loading</div>}
            {list?.length === 0 && <p className="text-[12.5px] text-zinc-500">No connectors yet.</p>}
            {list?.map((c) => {
              const reads = c.tools.filter((t) => t.readOnly), writes = c.tools.length - reads.length;
              const on = !off.has(c.id);
              return (
                <div key={c.id} className="min-w-0 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{c.name}</div>
                      <div className="truncate text-[12px] text-zinc-500">{c.host}{c.last4 ? ` · key ending ${c.last4}` : ""}</div>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-zinc-300">
                      <input type="checkbox" checked={on} onChange={() => void toggle(c.id, !on)} /> On for this project
                    </label>
                  </div>
                  {c.error
                    ? <div className="mt-2 flex items-start gap-2 text-[12px] text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{c.error}</span></div>
                    : <p className="mt-2 text-[12px] text-zinc-400">{reads.length} read {reads.length === 1 ? "tool" : "tools"}{writes ? `, ${writes} not used (writes)` : ""}</p>}
                  {reads.length > 0 && <p className="mt-1 break-words text-[11.5px] text-zinc-500">{reads.slice(0, 8).map((t) => t.name).join(", ")}{reads.length > 8 ? ` and ${reads.length - 8} more` : ""}</p>}
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-outline h-8" disabled={busy === c.id} onClick={() => void refresh(c.id)}>{busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>
                    <button type="button" className="btn btn-ghost h-8" disabled={busy === c.id} onClick={() => void remove(c.id)}><Trash2 size={14} /> Remove</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 min-w-0 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
            <div className="text-[12.5px] font-medium text-zinc-300">Add a connector</div>
            <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
              <input className="field min-w-0 text-[13px]" aria-label="Name" placeholder="Name" maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="field min-w-0 text-[13px] sm:col-span-2" aria-label="Server URL" placeholder="https://example.com/mcp" spellCheck={false} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <input className="field min-w-0 text-[13px]" aria-label="Header name" placeholder="Header (default Authorization)" spellCheck={false} value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })} />
              <input className="field min-w-0 text-[13px]" aria-label="API key or token" type="password" autoComplete="off" placeholder="API key or token (optional)" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
            </div>
            <p className="mt-2 text-[11.5px] text-zinc-500">Needs a public https server that speaks MCP over HTTP. The key is encrypted and never shown again.</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={adding || !form.name.trim() || !form.url.trim()} onClick={() => void add()}>
                {adding ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />} Connect
              </button>
            </div>
            {result && (
              <div className={`mt-2.5 min-w-0 text-[12.5px] ${result.ok ? "text-lime" : "text-amber-300"}`}>
                <div className="flex items-start gap-2">{result.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}<span className="min-w-0 break-words">{result.text}</span></div>
                {result.tools && (
                  <ul className="mt-1.5 space-y-0.5 pl-6 text-[12px] text-zinc-400">
                    {result.tools.slice(0, 12).map((t) => <li key={t.name} className="break-words">{t.name}{t.readOnly ? "" : " (not used, writes)"}</li>)}
                    {result.tools.length > 12 && <li>and {result.tools.length - 12} more</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-5">
        <div className="text-[12.5px] font-medium text-zinc-300">Built in, no setup</div>
        <ul className="mt-2 space-y-2">
          {BUILT_IN.map((b) => (
            <li key={b.name} className="flex min-w-0 gap-2.5 text-[12.5px] leading-snug text-zinc-400"><Check size={14} className="mt-0.5 shrink-0 text-lime" /><span className="min-w-0"><span className="text-zinc-200">{b.name}</span>. {b.what}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
