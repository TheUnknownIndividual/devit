"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { KeyRound, Loader2, Search, Settings2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Switch } from "@/components/settings/KeyRow";
import { PROVIDER_NAMES, type LlmProviderId } from "@/lib/llm-providers";
import type { CatalogModel } from "@/lib/model-catalog";
import { ProviderMark } from "./ProviderMark";

// "More models": every model we can run (OpenRouter's list, Hugging Face's, and each provider the person has a key
// for), searchable, with a recommended shortlist. Switching one on adds it to the chat box's model menu; it runs on
// the person's own key for its provider.

export interface ExtraModel { id: string; name: string; provider: LlmProviderId }

const KEY = "sitesmith:models:extra";
const subs = new Set<() => void>();
let cache: { raw: string | null; list: ExtraModel[] } = { raw: null, list: [] };
function readExtras(): ExtraModel[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (raw !== cache.raw) {
    let list: ExtraModel[] = [];
    try { list = raw ? (JSON.parse(raw) as ExtraModel[]).filter((m) => m && typeof m.id === "string") : []; } catch { list = []; }
    cache = { raw, list };
  }
  return cache.list;
}
const EMPTY: ExtraModel[] = [];
/** The catalog models switched on for the model menu (this browser). */
export function useExtraModels(): ExtraModel[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, readExtras, () => EMPTY);
}
function setExtras(list: ExtraModel[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40))); } catch { /* private mode */ }
  subs.forEach((f) => f());
}

type Tab = "recommended" | "mine" | "all";
const PAGE = 60;
const fmtCtx = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : `${Math.round(n / 1000)}K`);
const fmtPrice = (p: { in: number; out: number }) => (p.in === 0 && p.out === 0 ? "free" : `$${p.in} / $${p.out} per M`);

export function ModelsDialog({ open, onClose, own, onKeys }: { open: boolean; onClose: () => void; own: Partial<Record<LlmProviderId, boolean>>; onKeys: () => void }) {
  const extras = useExtraModels();
  const [models, setModels] = useState<CatalogModel[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("recommended");
  const [prov, setProv] = useState<LlmProviderId | "any">("any");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (!open || models) return;
    fetch("/api/models/catalog").then((r) => r.json()).then((j: { models: CatalogModel[] }) => setModels(j.models)).catch(() => setErr(true));
  }, [open, models]);
  useEffect(() => setShown(PAGE), [q, tab, prov]);

  const on = useMemo(() => new Set(extras.map((m) => m.id)), [extras]);
  const providers = useMemo(() => [...new Set((models ?? []).map((m) => m.provider))], [models]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (models ?? []).filter((m) => {
      // A search looks through everything; the tabs only narrow an empty search.
      if (!words.length && tab === "recommended" && !m.recommended) return false;
      if (tab === "mine" && !own[m.provider]) return false;
      if (prov !== "any" && m.provider !== prov) return false;
      const hay = `${m.name} ${m.model} ${m.vendor} ${PROVIDER_NAMES[m.provider]}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [models, q, tab, prov, own]);

  function toggle(m: CatalogModel, v: boolean) {
    setExtras(v ? [...extras.filter((x) => x.id !== m.id), { id: m.id, name: m.name, provider: m.provider }] : extras.filter((x) => x.id !== m.id));
  }

  const tabs: Array<[Tab, string]> = [["recommended", "Recommended"], ["mine", "On your keys"], ["all", "All models"]];
  return (
    <Dialog open={open} onClose={onClose} title="More models" icon={<Settings2 size={16} />} width={680}>
      <div className="min-w-0 space-y-3 p-5">
        <p className="text-[12.5px] text-zinc-500">Switch a model on to add it to the model menu in the chat box. It runs on your own key for its provider; without one, Auto takes over.</p>
        <div className="flex h-9 min-w-0 items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 focus-within:border-sel/60">
          <Search size={14} className="shrink-0 text-zinc-500" />
          <input className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none" placeholder="Search models: claude, gemini flash, qwen coder…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search models" autoFocus />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`h-7 rounded-[8px] border px-2.5 text-[12px] ${tab === id ? "border-white/15 bg-white/[0.09] text-white" : "border-white/[0.07] text-zinc-400 hover:text-zinc-200"}`}>{label}</button>
          ))}
          <select className="ml-auto h-7 max-w-full rounded-[8px] border border-white/[0.07] bg-ink-900 px-2 text-[12px] text-zinc-300" value={prov} onChange={(e) => setProv(e.target.value as LlmProviderId | "any")} aria-label="Provider">
            <option value="any">Any provider</option>
            {providers.map((p) => <option key={p} value={p}>{PROVIDER_NAMES[p]}</option>)}
          </select>
        </div>
        {extras.length > 0 && <p className="text-[11.5px] text-zinc-500">In your menu: {extras.map((m) => m.name).join(", ")}</p>}

        {!models && !err && <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-400"><Loader2 size={14} className="animate-spin" /> Loading every model…</div>}
        {err && <p className="py-4 text-[12.5px] text-amber-300">Couldn&apos;t load the model list. Try again in a moment.</p>}
        {models && list.length === 0 && <p className="py-4 text-[12.5px] text-zinc-500">{tab === "mine" && !q ? "Add a key to see the models on it." : "No model matches that."}</p>}
        {models && list.length > 0 && (
          <ul className="overflow-hidden rounded-[12px] border border-white/[0.07]">
            {list.slice(0, shown).map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-t border-white/[0.06] px-3 py-2.5 first:border-t-0">
                <span className="grid w-5 shrink-0 place-items-center"><ProviderMark provider={m.provider} on={on.has(m.id)} size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-zinc-100">{m.name}</div>
                  <div className="truncate text-[11.5px] text-zinc-500">
                    {m.vendor} · via {PROVIDER_NAMES[m.provider]}{m.ctx ? ` · ${fmtCtx(m.ctx)} context` : ""}{m.price ? ` · ${fmtPrice(m.price)}` : ""}{m.vision ? " · sees images" : ""}
                  </div>
                </div>
                {!own[m.provider] && (
                  <button type="button" onClick={onKeys} className="hidden shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 sm:inline-flex" title={`Runs on a ${PROVIDER_NAMES[m.provider]} key`}>
                    <KeyRound size={11} /> Needs a key
                  </button>
                )}
                <Switch on={on.has(m.id)} onChange={(v) => toggle(m, v)} label={`Show ${m.name} in the model menu`} />
              </li>
            ))}
          </ul>
        )}
        {models && list.length > shown && (
          <button type="button" className="btn btn-outline h-9 w-full" onClick={() => setShown((s) => s + PAGE)}>Show more ({list.length - shown})</button>
        )}
      </div>
    </Dialog>
  );
}
