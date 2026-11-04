"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Crown, Globe, KeyRound, Link2, Loader2, Lock, RefreshCw, Trash2 } from "lucide-react";

// The Pro parts of the Publish dialog: who can open the site, and a custom domain. Both read their own endpoint;
// a 402 from it (Free plan) becomes the upgrade line.

type Upgrade = { error: string; upgrade: string };
type Load<T> = { kind: "loading" } | { kind: "plan"; up: Upgrade } | { kind: "ok"; v: T } | { kind: "error"; error: string };

function useEndpoint<T>(url: string, open: boolean) {
  const [s, set] = useState<Load<T>>({ kind: "loading" });
  const apply = useCallback(async (r: Response | null) => {
    const j = r ? await r.json().catch(() => null) : null;
    if (r?.status === 402) set({ kind: "plan", up: j as Upgrade });
    else if (r?.ok) set({ kind: "ok", v: j as T });
    else return (j?.error as string) ?? "Something went wrong.";
    return null;
  }, []);
  useEffect(() => {
    if (!open) return;
    void fetch(url, { cache: "no-store" }).catch(() => null).then(async (r) => { const e = await apply(r); if (e) set({ kind: "error", error: e }); });
  }, [url, open, apply]);
  return [s, apply] as const;
}

const absolute = (u: string) => (u.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${u}` : u);

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-icon h-7 w-7 shrink-0" aria-label={label ?? "Copy"} onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }}>
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function UpgradeLine({ up, what }: { up: Upgrade; what: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
      <Crown size={15} className="shrink-0 text-amber-300" />
      <div className="flex-1 text-[12.5px] text-zinc-400"><span className="font-medium text-zinc-200">{what}</span> {up.error}</div>
      <a href="/pricing" className="btn btn-outline">See plans</a>
    </div>
  );
}

const Head = ({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) => (
  <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-300">{icon}{title}{hint && <span className="ml-auto text-[11px] font-normal text-zinc-500">{hint}</span>}</div>
);

// ---------- visibility ----------

type Access = { mode: "public" | "link" | "password"; link: string | null; hasPassword: boolean; published: boolean; entitled: boolean };
const MODES: { id: Access["mode"]; label: string; icon: typeof Globe }[] = [
  { id: "public", label: "Public", icon: Globe },
  { id: "link", label: "Private link", icon: Link2 },
  { id: "password", label: "Password", icon: KeyRound },
];

export function VisibilitySection({ projectId, open }: { projectId: string; open: boolean }) {
  const url = `/api/projects/${projectId}/access`;
  const [s, apply] = useEndpoint<Access>(url, open);
  const [pick, setPick] = useState<Access["mode"] | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setErr(await apply(r));
    setBusy(false);
    if (r?.ok) { setPick(null); setPw(""); }
  }

  if (s.kind === "loading") return null;
  if (s.kind === "error") return <div><Head icon={<Lock size={13} />} title="Who can open it" /><p className="mt-2 text-[12px] text-amber-300">{s.error}</p></div>;
  if (s.kind === "plan") return <div><Head icon={<Lock size={13} />} title="Who can open it" /><UpgradeLine up={s.up} what="Private sites." /></div>;
  const a = s.v;
  const mode = pick ?? a.mode;
  return (
    <div>
      <Head icon={<Lock size={13} />} title="Who can open it" hint={a.mode === "public" ? "Anyone with the address" : "Hidden from search engines"} />
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-[11px] border border-white/[0.07] bg-ink-900 p-0.5" role="radiogroup" aria-label="Who can open it">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} disabled={busy || (!a.entitled && id !== "public")}
            onClick={() => { setErr(null); if (id === "password" && !a.hasPassword) setPick(id); else if (id !== a.mode) void save({ mode: id }); else setPick(null); }}
            className={`btn h-8 ${mode === id ? "bg-white/[0.09] text-white" : "btn-ghost"}`}><Icon size={14} /> {label}</button>
        ))}
      </div>
      {mode === "link" && a.mode === "link" && (
        a.link ? (
          <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.04] py-1 pl-3 pr-1">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-300">{absolute(a.link)}</span>
            <CopyBtn text={absolute(a.link)} label="Copy private link" />
            <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" disabled={busy} onClick={() => void save({ mode: "link", rotate: true })}><RefreshCw size={13} /> New link</button>
          </div>
        ) : <p className="mt-2 text-[12px] text-zinc-500">Publish to get the private link.</p>
      )}
      {mode === "link" && <p className="mt-2 text-[12px] text-zinc-500">Only people with this link can open the site. A new link signs out everyone who used the old one.</p>}
      {mode === "password" && (
        <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save({ mode: "password", password: pw }); }}>
          <input type="password" className="h-9 min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white outline-none focus:border-sel/60" placeholder={a.hasPassword ? "New password" : "Password (6+ characters)"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="Site password" />
          <button type="submit" className="btn btn-outline" disabled={busy || pw.length < 6}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} {a.hasPassword && a.mode === "password" ? "Change" : "Set password"}</button>
          {pick === "password" && a.mode !== "password" && <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>Cancel</button>}
        </form>
      )}
      {mode === "password" && a.mode === "password" && <p className="mt-2 text-[12px] text-zinc-500">Visitors type the password once per browser. Changing it signs everyone out.</p>}
      {!a.entitled && a.mode !== "public" && <p className="mt-2 text-[12px] text-zinc-500">Your plan no longer includes private sites. It stays private until you make it public.</p>}
      {err && <p className="mt-2 text-[12px] text-amber-300">{err}</p>}
    </div>
  );
}

// ---------- custom domain ----------

type Rec = { type: string; name: string; value: string; note?: string };
type Found = { name: string; expected: string; found: string[]; ok: boolean };
type DomainState = {
  entitled: boolean; target: string | null; cloudflare: boolean; published: boolean;
  domain: { host: string; status: "pending" | "verified" | "live"; apex: boolean; checkedAt: number | null; cf: { status: string; ssl: string; error: string | null } | null } | null;
  records: Rec[];
  check?: { resolved: boolean; txt: Found; route: Found };
};

const STATUS: Record<"pending" | "verified" | "live", { label: string; cls: string }> = {
  pending: { label: "Waiting for DNS", cls: "border-white/10 text-zinc-400" },
  verified: { label: "Verified", cls: "border-sel/40 text-sel" },
  live: { label: "Live", cls: "border-lime/40 text-lime" },
};

function FoundRow({ label, f, bad }: { label: string; f: Found; bad: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      {f.ok ? <CheckCircle2 size={14} className="mt-px shrink-0 text-lime" /> : <AlertTriangle size={14} className="mt-px shrink-0 text-amber-300" />}
      <div className="min-w-0">
        <span className={f.ok ? "text-zinc-200" : "text-amber-300"}>{label}: {f.ok ? "found" : bad}</span>
        {!f.ok && <div className="mt-0.5 break-all font-mono text-[11px] text-zinc-500">expected {f.expected}<br />found {f.found.length ? f.found.join(", ") : "nothing"}</div>}
      </div>
    </div>
  );
}

export function DomainSection({ projectId, open }: { projectId: string; open: boolean }) {
  const url = `/api/projects/${projectId}/domain`;
  const [s, apply] = useEndpoint<DomainState>(url, open);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"add" | "check" | "remove" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(kind: "add" | "check" | "remove") {
    setBusy(kind);
    setErr(null);
    const r = await fetch(kind === "check" ? `${url}/check` : url, {
      method: kind === "remove" ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: kind === "add" ? JSON.stringify({ domain: input }) : undefined,
    }).catch(() => null);
    setErr(await apply(r));
    setBusy(null);
    if (r?.ok && kind !== "check") { setEditing(false); setInput(""); }
  }

  if (s.kind === "loading") return null;
  if (s.kind === "error") return <div><Head icon={<Globe size={13} />} title="Custom domain" /><p className="mt-2 text-[12px] text-amber-300">{s.error}</p></div>;
  if (s.kind === "plan") return <div><Head icon={<Globe size={13} />} title="Custom domain" /><UpgradeLine up={s.up} what="Your own domain." /></div>;
  const v = s.v;
  const d = v.domain;
  const st = d ? STATUS[d.status] : null;
  return (
    <div>
      <Head icon={<Globe size={13} />} title="Custom domain" hint={d ? undefined : "Apex (example.com) or subdomain (app.example.com)"} />
      {(!d || editing) && (
        <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void call("add"); }}>
          <input className="h-9 min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 font-mono text-[13px] text-white outline-none focus:border-sel/60" placeholder="example.com" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} aria-label="Domain" disabled={!v.entitled || !v.target} />
          <button type="submit" className="btn btn-outline" disabled={!input.trim() || !!busy || !v.entitled || !v.target}>{busy === "add" ? <Loader2 size={14} className="animate-spin" /> : null} {d ? "Replace" : "Connect"}</button>
          {editing && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
        </form>
      )}
      {!v.target && <p className="mt-2 text-[12px] text-zinc-500">Custom domains switch on once this server has a sites domain (SITES_DOMAIN or CUSTOM_DOMAIN_TARGET).</p>}
      {d && st && (
        <div className="mt-2 rounded-[12px] border border-white/[0.08] bg-ink-850">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-white">{d.host}</span>
            <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
            {!editing && <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => { setEditing(true); setInput(d.host); }}>Change</button>}
            <button type="button" className="btn btn-ghost btn-icon h-7 w-7" aria-label="Remove domain" disabled={!!busy} onClick={() => void call("remove")}>{busy === "remove" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>
          </div>
          <div className="space-y-2 p-3.5">
            <p className="text-[12px] text-zinc-400">Add these records where the domain&rsquo;s DNS is managed{d.apex ? " (this is the root of the domain)" : ""}:</p>
            <div className="overflow-hidden rounded-[10px] border border-white/[0.07]">
              {v.records.map((r, i) => (
                <div key={i} className="grid grid-cols-[52px_1fr] gap-x-3 gap-y-0.5 border-t border-white/[0.06] px-3 py-2 first:border-t-0">
                  <span className="font-mono text-[11.5px] font-medium text-zinc-300">{r.type}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1"><span className="w-12 shrink-0 text-[11px] text-zinc-500">Name</span><span className="min-w-0 flex-1 break-all font-mono text-[12px] text-zinc-200">{r.name}</span><CopyBtn text={r.name} label={`Copy ${r.type} name`} /></div>
                    <div className="flex items-center gap-1"><span className="w-12 shrink-0 text-[11px] text-zinc-500">Value</span><span className="min-w-0 flex-1 break-all font-mono text-[12px] text-zinc-200">{r.value}</span><CopyBtn text={r.value} label={`Copy ${r.type} value`} /></div>
                    {r.note && <div className="mt-0.5 text-[11px] text-zinc-500">{r.note}</div>}
                  </div>
                </div>
              ))}
            </div>
            {v.check && (
              <div className="space-y-1.5 pt-1">
                {!v.check.resolved && <p className="text-[12px] text-amber-300">The DNS resolvers didn&rsquo;t answer. Try again in a moment.</p>}
                <FoundRow label="Ownership TXT" f={v.check.txt} bad="not found yet" />
                <FoundRow label={d.apex ? "Root record" : "CNAME"} f={v.check.route} bad="not pointing at us yet" />
              </div>
            )}
            {d.cf && <p className="text-[12px] text-zinc-400">Certificate: <span className={d.cf.ssl === "active" ? "text-lime" : "text-zinc-200"}>{d.cf.ssl.replace(/_/g, " ")}</span>{d.cf.error && <span className="text-amber-300"> ({d.cf.error})</span>}</p>}
            {!v.cloudflare && d.status !== "pending" && <p className="text-[12px] text-zinc-500">Certificates aren&rsquo;t automatic on this server yet: its admin adds {d.host} under Cloudflare Custom Hostnames.</p>}
            {!v.published && <p className="text-[12px] text-zinc-500">Publish the site and the domain serves it.</p>}
            <div className="flex items-center gap-2 pt-1">
              <button type="button" className="btn btn-outline" disabled={!!busy || !v.entitled} onClick={() => void call("check")}>{busy === "check" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check DNS</button>
              <span className="text-[11px] text-zinc-500">{d.checkedAt ? `Last checked ${new Date(d.checkedAt).toLocaleTimeString()}` : "DNS changes can take a few minutes to show."}</span>
            </div>
          </div>
        </div>
      )}
      {!v.entitled && d && <p className="mt-2 text-[12px] text-zinc-500">Your plan no longer includes custom domains, so this one doesn&rsquo;t serve the site. You can still remove it.</p>}
      {err && <p className="mt-2 text-[12px] text-amber-300">{err}</p>}
    </div>
  );
}
