"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { BRANDS, BrandIcon } from "@/components/brand";
import { openSignIn, setSessionUser, useSession } from "@/components/account/session";
import { KeyRow } from "@/components/settings/KeyRow";
import type { PublicProject } from "@/lib/public";

// Google Analytics and Search Console for the published site, and the twitterapi.io key for live X posts.

const absolute = (u: string) => (u.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${u}` : u);

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-white/[0.07] bg-ink-900 px-3 py-2">
      <span className="shrink-0 text-[11.5px] text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[12px] text-zinc-200">{value}</span>
      <button type="button" className="btn btn-ghost btn-icon h-7 w-7 shrink-0" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }}>{done ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
  );
}

const COPY = {
  ga: {
    title: "Google Analytics",
    icon: BRANDS.googleAnalytics,
    open: "https://analytics.google.com/analytics/web/#/a/p/admin/streams",
    openLabel: "Open Google Analytics",
    label: "Measurement ID",
    placeholder: "G-XXXXXXXXXX",
    steps: [
      "In Google Analytics, go to Admin → Data streams → Add stream → Web.",
      "Enter your site's address (below) and create the stream.",
      "Copy the Measurement ID (starts with G-) and paste it here.",
    ],
    after: "Visits, where they came from and clicks show up in Google Analytics within a few minutes of your next visitor. It runs on the published site only, never in the builder preview.",
  },
  gsc: {
    title: "Google Search Console",
    icon: BRANDS.searchConsole,
    open: "https://search.google.com/search-console/welcome",
    openLabel: "Open Search Console",
    label: "HTML tag",
    placeholder: '<meta name="google-site-verification" content="…" />',
    steps: [
      "In Search Console, add a property with the URL prefix option and your site's address (below).",
      "Pick HTML tag as the way to verify and copy the whole tag.",
      "Paste it here and save, then press Verify in Search Console.",
      "Under Sitemaps, submit the sitemap address (below) so Google finds every page.",
    ],
    after: "The tag sits in your site's head from now on, so verification keeps working after every publish.",
  },
} as const;

export function GooglePane({ which, project, onSaved }: { which: "ga" | "gsc"; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const c = COPY[which];
  const saved = (which === "ga" ? project.integrations.gaId : project.integrations.gscToken) ?? "";
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const site = project.liveUrl ? absolute(project.liveUrl) : null;

  async function save(v: string) {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(which === "ga" ? { gaId: v } : { gscToken: v }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok && j?.id) { onSaved(j as PublicProject); setValue(v ? ((which === "ga" ? j.integrations.gaId : j.integrations.gscToken) ?? v) : ""); }
    else setErr(j?.error ?? "Couldn't save that.");
  }

  return (
    <div className="min-w-0 animate-rise">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.07]"><BrandIcon icon={c.icon} size={17} /></span>
        <div className="text-[15px] font-semibold text-white">{c.title}</div>
        <a className="btn btn-outline ml-auto" href={c.open} target="_blank" rel="noreferrer">{c.openLabel} <ArrowUpRight size={14} /></a>
      </div>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-zinc-300">
        {c.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="mt-4 space-y-2">
        {site ? <CopyLine label="Site address" value={site} /> : <p className="text-[12.5px] text-amber-300">Publish the site first, so Google has an address to look at.</p>}
        {site && which === "gsc" && <CopyLine label="Sitemap" value={`${site.replace(/\/$/, "")}/sitemap.xml`} />}
      </div>
      <div className="mt-4 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
        <label htmlFor={`g-${which}`} className="text-[12.5px] font-medium text-zinc-300">{c.label}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input id={`g-${which}`} className="field min-w-0 flex-1 basis-[220px] font-mono text-[13px]" placeholder={c.placeholder} spellCheck={false} autoComplete="off" value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) void save(value.trim()); }} />
          <button type="button" className="btn btn-primary h-10" disabled={busy || !value.trim() || value.trim() === saved} onClick={() => void save(value.trim())}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save to site</button>
          {saved && <button type="button" className="btn btn-ghost h-10" disabled={busy} onClick={() => void save("")}>Remove</button>}
        </div>
        {err && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-amber-300"><AlertTriangle size={13} /> {err}</p>}
        {saved && !err && (
          <p className="mt-2.5 flex items-start gap-2 text-[12.5px] text-lime"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /><span>On the site{project.published ? "" : " once you publish"}. <span className="text-zinc-400">{c.after}</span></span></p>
        )}
      </div>
    </div>
  );
}

export function XDataPane({ project }: { project: PublicProject }) {
  const { user } = useSession();
  const hasPosts = !!project.spec?.blocks.some((b) => b.type === "posts");
  const handle = project.spec?.x?.profile.handle;
  return (
    <div className="min-w-0 animate-rise">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.07]"><BrandIcon icon={BRANDS.x} size={15} color="#fff" /></span>
        <div className="text-[15px] font-semibold text-white">X data with twitterapi.io</div>
        <a className="btn btn-outline ml-auto" href="https://twitterapi.io/dashboard" target="_blank" rel="noreferrer">Get a key <ArrowUpRight size={14} /></a>
      </div>
      <ul className="mt-4 space-y-2.5">
        {[
          "Builds read your latest posts, bio and followers with your own key, so the copy sounds like you.",
          "The From X section on your published site refreshes with your newest posts every hour.",
          "About $0.003 per refresh on twitterapi.io's pay-as-you-go pricing, so roughly $2 a month for an hourly refresh, billed by them to you. The key is sealed on our side and only ever sent to twitterapi.io.",
        ].map((p) => <li key={p} className="flex gap-2.5 text-[13.5px] leading-relaxed text-zinc-300"><Check size={15} className="mt-0.5 shrink-0 text-lime" />{p}</li>)}
      </ul>
      <div className="mt-4 text-[12.5px] text-zinc-400">
        {handle ? <>This site follows <span className="text-zinc-200">@{handle}</span>.</> : "Paste your X handle in the chat and the site picks it up."}{" "}
        {!hasPosts && "Ask the chat to “add my latest X posts” to put a From X section on the page."}
      </div>
      <div className="mt-4">
        {user ? <KeyRow id="twitterapi" saved={user.keys.twitterapi} onUser={(u) => u && setSessionUser(u)} /> : <button type="button" className="btn btn-primary" onClick={() => openSignIn()}>Sign in to add your key</button>}
      </div>
    </div>
  );
}
