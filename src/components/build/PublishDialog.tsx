"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, BarChart3, Check, CheckCircle2, ChevronDown, Copy, Crown, Globe, Info, Loader2, Rocket, ShieldAlert, ShieldCheck } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { BrandIcon, BRANDS } from "@/components/brand";
import type { PublicProject } from "@/lib/public";
import { DomainSection, VisibilitySection } from "./PublishPro";
import { ShareSection } from "./BuilderExtras";

/** The owner opening their own site from here isn't counted as a visit (app/s/[slug]/page.tsx). */
const ownVisit = (url: string) => `${url}${url.includes("?") ? "&" : "?"}from=builder`;

const suggest = (p: PublicProject) => (p.published?.slug || p.spec?.ticker || p.spec?.name || "my-site").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-site";

export function PublishDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const [slug, setSlug] = useState(suggest(project));
  const [avail, setAvail] = useState<"checking" | "yes" | "no" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (open) setSlug(suggest(project)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open || !slug) { setAvail(null); return; }
    if (slug === project.published?.slug) { setAvail("yes"); return; }
    setAvail("checking");
    const h = setTimeout(async () => {
      const r = await fetch(`/api/projects/${project.id}/publish?slug=${encodeURIComponent(slug)}`).then((x) => x.json()).catch(() => ({ available: false }));
      setAvail(r.available ? "yes" : "no");
    }, 300);
    return () => clearTimeout(h);
  }, [slug, open, project.id, project.published?.slug]);

  async function publish() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/projects/${project.id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Couldn't publish."); return; }
    onSaved(j as PublicProject);
  }

  const liveUrl = project.liveUrl ? (project.liveUrl.startsWith("/") ? `${typeof window !== "undefined" ? window.location.origin : ""}${project.liveUrl}` : project.liveUrl) : null;
  const suffix = project.sitesDomain ? `.${project.sitesDomain}` : ".sitesmith";
  return (
    <Dialog open={open} onClose={onClose} title="Publish" icon={<Globe size={15} />} width={620}>
      <div className="space-y-4 p-5">
        {liveUrl && (
          <div className="flex animate-rise items-center gap-3 rounded-[12px] border border-lime/30 bg-lime/[0.06] p-3.5">
            <CheckCircle2 size={18} className="shrink-0 text-lime" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-white">Live</div>
              <a href={ownVisit(liveUrl)} target="_blank" rel="noreferrer" className="block truncate font-mono text-[12.5px] text-lime hover:underline">{liveUrl}</a>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => { void navigator.clipboard?.writeText(liveUrl); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button>
            <a className="btn btn-primary" href={ownVisit(liveUrl)} target="_blank" rel="noreferrer">Open <ArrowUpRight size={14} /></a>
          </div>
        )}

        <div>
          <label htmlFor="slug" className="text-[12.5px] font-medium text-zinc-300">Site address</label>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center rounded-[10px] border border-white/10 bg-white/[0.04] pr-3 focus-within:border-sel/60">
              <input id="slug" className="h-full min-w-0 flex-1 bg-transparent pl-3 font-mono text-[13px] text-white outline-none" value={slug} spellCheck={false} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))} />
              <span className="font-mono text-[12.5px] text-zinc-500">{suffix}</span>
            </div>
            <span className="flex w-24 items-center gap-1.5 text-[12px]">
              {avail === "checking" && <><Loader2 size={13} className="animate-spin text-zinc-400" /><span className="text-zinc-400">Checking</span></>}
              {avail === "yes" && <><CheckCircle2 size={14} className="text-lime" /><span className="text-lime">Available</span></>}
              {avail === "no" && <><AlertTriangle size={14} className="text-amber-300" /><span className="text-amber-300">Taken</span></>}
            </span>
          </div>
          <p className="mt-2 text-[12px] text-zinc-500">{project.sitesDomain ? <>Live at https://{slug || "…"}{suffix} the moment you publish. Updates show within a minute.</> : <>Served at /s/{slug || "…"} for now. Subdomains switch on once the sites domain is set.</>}</p>
        </div>

        <SafetySection projectId={project.id} open={open} version={project.version} />

        {project.published && <VisitsSection projectId={project.id} open={open} />}

        <VisibilitySection projectId={project.id} open={open} />
        <DomainSection projectId={project.id} open={open} suggest={suggest(project)} />
        <ShareSection project={project} onSaved={onSaved} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] border border-sel/60 bg-sel/[0.06] p-3.5">
            <div className="flex items-center gap-2 text-[13.5px] font-medium text-white"><Globe size={15} className="text-sel" /> Free</div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-zinc-400"><li>Your own subdomain</li><li>Live data, wallet, buy box</li><li>&ldquo;Built with sitesmith&rdquo; footer</li></ul>
          </div>
          <div className="rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5 opacity-80">
            <div className="flex items-center gap-2 text-[13.5px] font-medium text-white"><Crown size={15} className="text-amber-300" /> Pro <span className="ml-auto rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] text-zinc-400">Soon</span></div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-zinc-400"><li>Custom domain</li><li>No footer badge</li><li className="flex items-center gap-1.5">Pay with any coin <BrandIcon icon={BRANDS.near} size={11} color="#a1a1aa" /> Intents</li></ul>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-white/[0.12] p-3.5">
          <Rocket size={16} className="shrink-0 text-zinc-500" />
          <div className="flex-1 text-[12.5px] text-zinc-400"><span className="font-medium text-zinc-200">Launch a token from this site.</span> Bonding-curve launch on NEAR, Solana and Robinhood Chain.</div>
          <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-400">Coming soon</span>
        </div>

        {err && <p className="text-[12.5px] text-amber-300">{err}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-3">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" disabled={avail !== "yes" || busy || !project.spec} onClick={() => void publish()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} {project.published ? "Update site" : "Publish"}
        </button>
      </div>
    </Dialog>
  );
}

type Finding = { level: "high" | "warn" | "info"; title: string; detail: string };

/** The pre-publish check (lib/safety.ts): drainer wording, promises of profit, a wrong CA, lookalike or http links. */
function SafetySection({ projectId, open, version }: { projectId: string; open: boolean; version: number }) {
  const [f, setF] = useState<Finding[] | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/projects/${projectId}/safety`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setF(j.findings as Finding[]); }).catch(() => undefined);
    return () => { live = false; };
  }, [projectId, open, version]);
  if (!f) return null;
  const high = f.filter((x) => x.level === "high").length, warn = f.filter((x) => x.level === "warn").length;
  const head = high ? `${high} thing${high === 1 ? "" : "s"} to fix before publishing` : warn ? `${warn} thing${warn === 1 ? "" : "s"} worth a look` : "Nothing risky found";
  const shown = more ? f : f.filter((x) => x.level !== "info").slice(0, 4);
  return (
    <div className={`min-w-0 rounded-[12px] border p-3.5 ${high ? "border-red-400/35 bg-red-400/[0.05]" : warn ? "border-amber-300/25 bg-amber-300/[0.04]" : "border-white/[0.08] bg-ink-850"}`}>
      <div className="flex min-w-0 items-center gap-2">
        {high ? <ShieldAlert size={15} className="shrink-0 text-red-300" /> : warn ? <ShieldAlert size={15} className="shrink-0 text-amber-300" /> : <ShieldCheck size={15} className="shrink-0 text-lime" />}
        <span className="min-w-0 flex-1 text-[13px] font-medium text-white">Safety check: {head}</span>
        {f.length > shown.length || more ? (
          <button type="button" className="flex shrink-0 items-center gap-1 text-[12px] text-zinc-400 hover:text-white" onClick={() => setMore((m) => !m)}>{more ? "Less" : `All ${f.length}`} <ChevronDown size={12} className={more ? "rotate-180" : ""} /></button>
        ) : null}
      </div>
      {shown.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {shown.map((x, i) => (
            <li key={i} className="flex min-w-0 gap-2">
              {x.level === "info" ? <Info size={13} className="mt-0.5 shrink-0 text-zinc-500" /> : <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${x.level === "high" ? "text-red-300" : "text-amber-300"}`} />}
              <div className="min-w-0">
                <p className="text-[12.5px] text-zinc-200">{x.title}</p>
                <p className="break-words text-[12px] leading-snug text-zinc-500">{x.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!f.length && <p className="mt-1.5 text-[12px] text-zinc-500">Checked the words and links for drainer wording, promises of profit, a wrong contract address and lookalike links.</p>}
    </div>
  );
}

interface Visits { days: Array<{ d: string; views: number; uniques: number }>; referrers: Array<{ host: string; n: number }>; total: number; uniques: number }

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Last 30 days of visits to the published site: totals, a small bar per day, and where visitors came from. */
function VisitsSection({ projectId, open }: { projectId: string; open: boolean }) {
  const [v, setV] = useState<Visits | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/projects/${projectId}/visits?days=30`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setV(j as Visits); }).catch(() => undefined);
    return () => { live = false; };
  }, [projectId, open]);
  if (!v) return null;

  const W = 552, H = 56, n = v.days.length, gap = 2;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...v.days.map((x) => x.views));
  const shown = hover != null ? v.days[hover] : null;
  return (
    <div className="rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-300"><BarChart3 size={14} className="text-zinc-400" /> Visits, last 30 days</div>
        <div className="text-[12.5px] text-zinc-400"><span className="font-semibold text-white">{v.total.toLocaleString("en-US")}</span> views</div>
        <div className="text-[12.5px] text-zinc-400"><span className="font-semibold text-white">{v.uniques.toLocaleString("en-US")}</span> visitors, roughly</div>
      </div>
      {v.total === 0 ? (
        <p className="mt-2 text-[12px] text-zinc-500">No visits yet. Share the link and they show up here within a minute.</p>
      ) : (
        <>
          <p className="mt-2 h-4 text-[11.5px] text-zinc-500">
            {shown ? `${shortDay(shown.d)}: ${shown.views} ${shown.views === 1 ? "view" : "views"}, ${shown.uniques} ${shown.uniques === 1 ? "visitor" : "visitors"}` : `${shortDay(v.days[0].d)} to ${shortDay(v.days[n - 1].d)} (UTC)`}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label={`Views per day for the last 30 days, ${v.total} in all`} onMouseLeave={() => setHover(null)}>
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            {v.days.map((x, i) => {
              const h = x.views ? Math.max(2, (x.views / max) * (H - 2)) : 0;
              const left = i * (bw + gap);
              return (
                <g key={x.d} onMouseEnter={() => setHover(i)}>
                  <rect x={left - gap / 2} y={0} width={bw + gap} height={H} fill="transparent" />
                  {h > 0 && <path d={bar(left, H, bw, h)} className={hover == null || hover === i ? "fill-lime" : "fill-lime/40"} />}
                  <title>{`${shortDay(x.d)}: ${x.views} views, ${x.uniques} visitors`}</title>
                </g>
              );
            })}
          </svg>
          {v.referrers.length > 0 && (
            <div className="mt-3">
              <div className="text-[11.5px] text-zinc-500">Top referrers</div>
              <ul className="mt-1 space-y-0.5">
                {v.referrers.slice(0, 5).map((r) => (
                  <li key={r.host} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="truncate font-mono text-zinc-300">{r.host}</span>
                    <span className="tabular-nums text-zinc-400">{r.n.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="mt-2 text-[11px] text-zinc-500">Counted without cookies or stored IP addresses. Bots and your own visits from here are left out.</p>
    </div>
  );
}

/** A bar standing on the baseline with its top corners rounded (up to 4px, less on thin or short bars). */
function bar(x: number, base: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}
