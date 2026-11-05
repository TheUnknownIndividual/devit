"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bot, ChevronDown, KeyRound, Sparkles } from "lucide-react";
import { BrandIcon, BRANDS } from "@/components/brand";
import { Menu } from "@/components/ui/Menu";
import { MODEL_CHOICES, isModelChoice, type ModelChoice } from "@/lib/models";
import { KeysDialog } from "./KeysDialog";

// The chat box's model pill (bottom left): Auto by default, or a model the person picks. Every plan gets it. A model
// with no key behind it yet offers "Add a key", which opens the keys dialog right here instead of sending them to Settings.

const KEY = "sitesmith:model";
const subs = new Set<() => void>();
const read = (): ModelChoice => { try { const v = localStorage.getItem(KEY); return isModelChoice(v) ? v : "auto"; } catch { return "auto"; } };

/** The current pick, shared by every chat box on the page; send it as the x-model header. */
export function usePickedModel(): ModelChoice {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, () => "auto");
}
export const modelHeader = (): Record<string, string> => { const m = read(); return m === "auto" ? {} : { "x-model": m }; };
function setPicked(m: ModelChoice) { try { localStorage.setItem(KEY, m); } catch { /* private mode */ } subs.forEach((f) => f()); }

function Mark({ id }: { id: ModelChoice }) {
  if (id === "glm") return <BrandIcon icon={BRANDS.near} size={13} color="#d4d4d8" />;
  if (id === "claude-sonnet" || id === "claude-haiku") return <BrandIcon icon={BRANDS.claude} size={13} color="#d4d4d8" />;
  if (id === "gpt") return <Bot size={13} className="text-zinc-300" />;
  if (id === "openrouter") return <BrandIcon icon={BRANDS.openrouter} size={13} color="#d4d4d8" />;
  return <Sparkles size={13} className="text-lime" />;
}

export function ModelPicker({ disabled }: { disabled?: boolean }) {
  const picked = usePickedModel();
  const [avail, setAvail] = useState<Record<string, boolean> | null>(null);
  const [keys, setKeys] = useState(false);
  const load = () => fetch("/api/models", { cache: "no-store" }).then((r) => r.json()).then((j: { available: Record<string, boolean> }) => setAvail(j.available)).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  const cur = MODEL_CHOICES.find((m) => m.id === picked) ?? MODEL_CHOICES[0];

  return (
    <>
      <Menu<ModelChoice | "keys">
        label="Model"
        up
        width={280}
        value={picked}
        onPick={(v) => { if (v === "keys") setKeys(true); else if (avail && !avail[v]) setKeys(true); else setPicked(v); }}
        items={[
          ...MODEL_CHOICES.map((m) => ({ value: m.id as ModelChoice, label: m.label, icon: <Mark id={m.id} />, hint: avail && !avail[m.id] ? "Add a key" : m.id === "auto" ? "default" : undefined })),
          { value: "keys" as const, label: "Your API keys…", icon: <KeyRound size={13} className="text-zinc-400" /> },
        ]}
        trigger={(open) => (
          <button type="button" disabled={disabled} title={cur.note} className={`btn h-8 gap-1.5 px-2 text-[12.5px] ${open ? "bg-white/[0.08] text-white" : "btn-ghost text-zinc-300"}`}>
            <Mark id={cur.id} /> {cur.label} <ChevronDown size={12} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      />
      <KeysDialog open={keys} onClose={() => { setKeys(false); void load(); }} />
    </>
  );
}
