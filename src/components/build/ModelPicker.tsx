"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, KeyRound, Settings2 } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { PROVIDER_NAMES, parsePick, type LlmProviderId } from "@/lib/llm-providers";
import { MODEL_CHOICES, isModelChoice, type ModelChoice } from "@/lib/models";
import { KeysDialog } from "./KeysDialog";
import { ModelsDialog, useExtraModels } from "./ModelsDialog";
import { ProviderMark } from "./ProviderMark";

// The chat box's model pill (bottom left): Auto by default, or a model the person picks. Every plan gets it. A model
// with no key behind it yet offers "Add a key", which opens the keys dialog right here instead of sending them to Settings.
// "More models…" opens the catalog, where any model we can run is switched on for this menu.

const KEY = "sitesmith:model";
const subs = new Set<() => void>();
const read = (): ModelChoice => { try { const v = localStorage.getItem(KEY); return isModelChoice(v) ? v : "auto"; } catch { return "auto"; } };

/** The current pick, shared by every chat box on the page; send it as the x-model header. */
export function usePickedModel(): ModelChoice {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, () => "auto");
}
export const modelHeader = (): Record<string, string> => { const m = read(); return m === "auto" ? {} : { "x-model": m }; };
function setPicked(m: ModelChoice) { try { localStorage.setItem(KEY, m); } catch { /* private mode */ } subs.forEach((f) => f()); }

export function ModelPicker({ disabled }: { disabled?: boolean }) {
  const picked = usePickedModel();
  const extras = useExtraModels();
  const [avail, setAvail] = useState<Record<string, boolean> | null>(null);
  const [own, setOwn] = useState<Partial<Record<LlmProviderId, boolean>>>({});
  const [keys, setKeys] = useState(false);
  const [more, setMore] = useState(false);
  const load = () => fetch("/api/models", { cache: "no-store" }).then((r) => r.json()).then((j: { available: Record<string, boolean>; own?: Partial<Record<LlmProviderId, boolean>> }) => { setAvail(j.available); setOwn(j.own ?? {}); }).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  const x = parsePick(picked);
  const builtIn = MODEL_CHOICES.find((m) => m.id === picked);
  const extra = extras.find((m) => m.id === picked);
  const cur = builtIn
    ? { label: builtIn.label, note: builtIn.note, mark: builtIn.provider ?? ("auto" as const) }
    : { label: extra?.name ?? x?.model.split("/").pop() ?? "Auto", note: x ? `${PROVIDER_NAMES[x.provider]} · ${x.model} · on your key` : "", mark: x?.provider ?? ("auto" as const) };

  return (
    <>
      <Menu<string>
        label="Model"
        up
        width={300}
        header={<div><p className="text-[12px] font-medium text-zinc-200">Pick a model</p><p className="text-[11px] text-zinc-500">Which AI writes and edits your site. Auto picks for each job.</p></div>}
        value={picked}
        onPick={(v) => {
          if (v === "keys") return setKeys(true);
          if (v === "more") return setMore(true);
          const p = parsePick(v);
          if (p ? !own[p.provider] : avail && !avail[v]) return setKeys(true);
          setPicked(v as ModelChoice);
        }}
        items={[
          ...MODEL_CHOICES.map((m) => ({ value: m.id as string, label: m.label, icon: <ProviderMark provider={m.provider ?? "auto"} on={m.id === picked} />, hint: avail && !avail[m.id] ? "Add a key" : m.id === "auto" ? "default" : undefined })),
          ...extras.map((m) => ({ value: m.id, label: m.name, icon: <ProviderMark provider={m.provider} on={m.id === picked} />, hint: own[m.provider] ? undefined : "Add a key" })),
          { value: "more", label: "More models…", icon: <Settings2 size={13} className="text-zinc-400" /> },
          { value: "keys", label: "Your AI keys…", icon: <KeyRound size={13} className="text-zinc-400" /> },
        ]}
        trigger={(open) => (
          <button type="button" disabled={disabled} title={cur.note} className={`btn h-8 max-w-[180px] gap-1.5 px-2 text-[12.5px] ${open ? "bg-white/[0.08] text-white" : "btn-ghost text-zinc-300"}`}>
            <ProviderMark provider={cur.mark} on /> <span className="truncate">{cur.label}</span> <ChevronDown size={12} className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      />
      <KeysDialog open={keys} onClose={() => { setKeys(false); void load(); }} />
      <ModelsDialog open={more} onClose={() => setMore(false)} own={own} onKeys={() => { setMore(false); setKeys(true); }} />
    </>
  );
}
