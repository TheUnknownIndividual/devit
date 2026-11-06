"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Copy, Database, Download, Loader2, Lock, RefreshCw, Sparkles, Unplug } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { BRANDS, BrandIcon } from "@/components/brand";
import type { PublicProject } from "@/lib/public";

type Row = { site: string; kind: string; email?: string | null; wallet?: string | null; name?: string | null; message?: string | null; created_at?: string };
type View = {
  database: NonNullable<PublicProject["database"]> | null;
  claimUrl: string | null;
  sql: string | null;
  sqlUrl: string | null;
  rows: Row[];
  count: number;
  held: number;
  error: string | null;
};
type Choice = "instant" | "neon" | "supabase";

const PROVIDER = { neon: "Neon Postgres", supabase: "Supabase" } as const;

function hoursLeft(at: number | null): string {
  if (!at) return "";
  const h = Math.max(0, Math.round((at - Date.now()) / 3_600_000));
  return h >= 1 ? `${h} h` : "under an hour";
}

export function DatabaseDialog({ open, onClose, project, hasForm }: { open: boolean; onClose: () => void; project: PublicProject; hasForm: boolean }) {
  const [v, setV] = useState<View | null>(null);
  const [pick, setPick] = useState<Choice>("instant");
  const [cs, setCs] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "check" | "remove">(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/api/projects/${project.id}/database`;

  const load = useCallback(async () => {
    const r = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setV((await r.json()) as View);
  }, [base]);

  useEffect(() => { if (open) { setErr(null); void load(); } }, [open, load]);

  async function send(method: "POST" | "DELETE", body?: unknown, what: "connect" | "check" | "remove" = "connect") {
    setBusy(what); setErr(null);
    const r = await fetch(base, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (View & { error?: string }) | null;
    setBusy(null);
    if (!r?.ok) { setErr(j?.error ?? "Something went wrong. Try again."); return; }
    setV(j);
    setCs(""); setKey("");
  }

  const connect = () => send("POST", pick === "instant" ? { action: "instant" } : pick === "neon" ? { action: "neon", connectionString: cs } : { action: "supabase", url, key });
  const db = v?.database ?? null;
  const canConnect = pick === "instant" || (pick === "neon" ? !!cs.trim() : !!url.trim() && !!key.trim());

  return (
    <Dialog open={open} onClose={onClose} title="Database" icon={<Database size={15} />} width={640}>
      <div className="space-y-4 p-5">
        <p className="text-[13px] leading-relaxed text-zinc-400">
          Signup forms on your site save entries here. Connect a hosted Postgres and they go straight into your own database, ready for production. Nothing to run yourself.
        </p>

        {!v && <div className="flex items-center gap-2 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin" /> Loading</div>}

        {v && db && (
          <div className="rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06]"><BrandIcon icon={BRANDS[db.provider]} size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-white">{PROVIDER[db.provider]}{db.instant && " · free instant database"}</div>
                <div className="truncate font-mono text-[12px] text-zinc-500">{db.host}</div>
              </div>
              <button type="button" className="btn btn-ghost h-8 text-[12.5px]" disabled={!!busy} onClick={() => void send("DELETE", undefined, "remove")} title="Disconnect (the database itself is kept)">
                {busy === "remove" ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />} Disconnect
              </button>
            </div>
            {db.ready && <div className="mt-3 flex items-center gap-2 text-[12.5px] text-lime"><CheckCircle2 size={15} /> Connected. New entries are written to the {`sitesmith_signups`} table.</div>}
            {db.instant && v.claimUrl && !db.expired && (
              <div className="mt-3 rounded-[10px] border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[12.5px] text-amber-200">
                <div className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Claim it into your Neon account within {hoursLeft(db.expiresAt)} to keep it. Unclaimed instant databases are deleted after 72 hours.</div>
                <a className="btn btn-outline mt-2.5 h-8 text-[12.5px]" href={v.claimUrl} target="_blank" rel="noreferrer"><BrandIcon icon={BRANDS.neon} size={13} /> Claim on Neon <ArrowUpRight size={13} /></a>
              </div>
            )}
            {db.expired && <div className="mt-3 flex items-start gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> This instant database expired before it was claimed. New entries are held here; connect another database below.</div>}
            {db.provider === "supabase" && !db.ready && v.sql && (
              <div className="mt-3 space-y-2.5">
                <div className="text-[12.5px] text-zinc-300">One step left: run this once in Supabase&apos;s SQL editor to make the table, then check again.</div>
                <pre className="max-h-40 overflow-auto rounded-[10px] bg-black/40 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-300">{v.sql}</pre>
                <div className="flex flex-wrap gap-2">
                  {v.sqlUrl && <a className="btn btn-primary h-8 text-[12.5px]" href={v.sqlUrl} target="_blank" rel="noreferrer">Open SQL editor <ArrowUpRight size={13} /></a>}
                  <button type="button" className="btn btn-outline h-8 text-[12.5px]" onClick={() => { void navigator.clipboard?.writeText(v.sql!); setCopied(true); setTimeout(() => setCopied(false), 1400); }}><Copy size={13} /> {copied ? "Copied" : "Copy SQL"}</button>
                  <button type="button" className="btn btn-outline h-8 text-[12.5px]" disabled={!!busy} onClick={() => void send("POST", { action: "check" }, "check")}>{busy === "check" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Check again</button>
                </div>
              </div>
            )}
          </div>
        )}

        {v && (!db || db.expired) && (
          <div className="space-y-2.5">
            {([
              ["instant", "Create a free database", "A Postgres on Neon in one click. Claim it into your Neon account to keep it.", true, "neon"],
              ["neon", "Use my Neon database", "Paste a connection string from the Neon console.", false, "neon"],
              ["supabase", "Use my Supabase project", "Paste the project URL and service_role key.", false, "supabase"],
            ] as const).map(([id, title, body, rec, brand]) => (
              <button key={id} type="button" onClick={() => setPick(id)} className={`flex w-full items-center gap-3 rounded-[12px] border p-3.5 text-left ${pick === id ? "border-sel/60 bg-sel/[0.06]" : "border-white/[0.08] bg-ink-850 hover:border-white/15"}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05]"><BrandIcon icon={BRANDS[brand]} size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-white">{title}{rec && <span className="ml-2 text-[12px] font-normal text-zinc-500">recommended</span>}</span>
                  <span className="mt-0.5 block text-[12.5px] text-zinc-400">{body}</span>
                </span>
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${pick === id ? "border-sel bg-sel" : "border-white/25"}`}>{pick === id && <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />}</span>
              </button>
            ))}
            {pick === "neon" && (
              <div className="animate-rise space-y-2 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
                <input className="field font-mono text-[12.5px]" placeholder="postgresql://user:password@ep-….neon.tech/neondb?sslmode=require" value={cs} spellCheck={false} onChange={(e) => setCs(e.target.value)} aria-label="Neon connection string" />
                <a className="chip h-7 text-[12px]" href="https://console.neon.tech" target="_blank" rel="noreferrer"><BrandIcon icon={BRANDS.neon} size={12} /> Neon console <ArrowUpRight size={12} /></a>
              </div>
            )}
            {pick === "supabase" && (
              <div className="animate-rise space-y-2 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
                <input className="field font-mono text-[12.5px]" placeholder="https://abcd1234.supabase.co" value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} aria-label="Supabase project URL" />
                <input className="field font-mono text-[12.5px]" type="password" placeholder="service_role key" value={key} spellCheck={false} autoComplete="off" onChange={(e) => setKey(e.target.value)} aria-label="Supabase service_role key" />
                <div className="text-[12px] text-zinc-500">Both are under Project Settings → API. Row-level security stays on, so the table can&apos;t be read from the browser.</div>
                <a className="chip h-7 text-[12px]" href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer"><BrandIcon icon={BRANDS.supabase} size={12} /> Supabase dashboard <ArrowUpRight size={12} /></a>
              </div>
            )}
            <div className="flex items-start gap-2 text-[12px] text-zinc-500"><Lock size={13} className="mt-0.5 shrink-0" /> Credentials are encrypted on our server and never reach your site&apos;s visitors.</div>
            <button type="button" className="btn btn-primary w-full" disabled={!canConnect || !!busy} onClick={() => void connect()}>
              {busy === "connect" ? <Loader2 size={15} className="animate-spin" /> : pick === "instant" ? <Sparkles size={15} /> : <Database size={15} />}
              {pick === "instant" ? "Create database" : "Connect"}
            </button>
          </div>
        )}

        {err && <div className="flex items-start gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {err}</div>}

        {v && (
          <div className="border-t border-white/[0.07] pt-4">
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-[13.5px] font-semibold text-white">Entries</h3>
              <span className="text-[12.5px] text-zinc-500">{v.count.toLocaleString("en-US")}</span>
              {v.held > 0 && <span className="text-[12px] text-zinc-500">· {v.held} held here until a database is connected</span>}
              <a className={`btn btn-outline ml-auto h-8 text-[12.5px] ${v.count ? "" : "pointer-events-none opacity-40"}`} href={`${base}/export`}><Download size={13} /> CSV</a>
            </div>
            {v.error && <div className="mb-2 text-[12px] text-amber-300">Couldn&apos;t read the database: {v.error}</div>}
            {!v.rows.length ? (
              <div className="rounded-[12px] border border-dashed border-white/10 p-4 text-[12.5px] text-zinc-500">
                {hasForm ? "No entries yet. They appear here when visitors use the form on your published site." : "Your site has no signup form yet. Comment on any section with “add a waitlist” (or “collect wallets for the whitelist”) and the agent adds one."}
              </div>
            ) : (
              <div className="max-h-64 overflow-auto rounded-[12px] border border-white/[0.08]">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="sticky top-0 bg-ink-850 text-zinc-500"><tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Wallet</th><th className="px-3 py-2 font-medium">List</th></tr></thead>
                  <tbody>
                    {v.rows.map((r, i) => (
                      <tr key={i} className="border-t border-white/[0.05] text-zinc-300">
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                        <td className="max-w-[200px] truncate px-3 py-2">{r.email ?? ""}</td>
                        <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[12px]">{r.wallet ?? ""}</td>
                        <td className="px-3 py-2 text-zinc-500">{r.kind}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
