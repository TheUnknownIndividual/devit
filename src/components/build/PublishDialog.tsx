"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, Copy, Crown, Globe, Loader2, Rocket } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { BrandIcon, BRANDS } from "@/components/brand";
import type { PublicProject } from "@/lib/public";
import { DomainSection, VisibilitySection } from "./PublishPro";

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
              <a href={liveUrl} target="_blank" rel="noreferrer" className="block truncate font-mono text-[12.5px] text-lime hover:underline">{liveUrl}</a>
            </div>
            <button type="button" className="btn btn-outline" onClick={() => { void navigator.clipboard?.writeText(liveUrl); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button>
            <a className="btn btn-primary" href={liveUrl} target="_blank" rel="noreferrer">Open <ArrowUpRight size={14} /></a>
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

        <VisibilitySection projectId={project.id} open={open} />
        <DomainSection projectId={project.id} open={open} suggest={suggest(project)} />

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
