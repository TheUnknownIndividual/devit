"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, KeyRound, Loader2, LogIn, Wand2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { openSignIn, setSessionUser, useSession } from "@/components/account/session";
import { KeyRow } from "@/components/settings/KeyRow";
import { LLM_PROVIDER_IDS, PROVIDER_NAMES, guessProviders } from "@/lib/llm-providers";
import { ProviderMark } from "./ProviderMark";

// The chat box's keys dialog: AI model keys only (chain and X keys live in Settings → API keys). Paste any key at the
// top and we work out whose it is (the prefix first, then each likely provider's free check), or add one under its
// provider. The next message can use it.

export function KeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  const [paste, setPaste] = useState("");
  const [state, setState] = useState<{ s: "idle" | "busy" | "ok" | "bad"; text?: string }>({ s: "idle" });
  const [all, setAll] = useState(false);
  const guess = paste.trim().length >= 8 ? guessProviders(paste) : [];

  async function add() {
    setState({ s: "busy" });
    const r = await fetch("/api/account/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "auto", key: paste.trim(), save: true }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: keyof typeof PROVIDER_NAMES; reason?: string; error?: string; user?: Parameters<typeof setSessionUser>[0] };
    if (j.ok && j.id) {
      if (j.user) setSessionUser(j.user);
      setPaste("");
      setState({ s: "ok", text: `Saved as your ${PROVIDER_NAMES[j.id]} key. Its models are in the model menu now.` });
    } else setState({ s: "bad", text: j.reason ?? j.error ?? "That didn't work." });
  }

  const saved = user ? LLM_PROVIDER_IDS.filter((id) => user.keys[id]) : [];
  const rest = user ? LLM_PROVIDER_IDS.filter((id) => !user.keys[id]) : [];

  return (
    <Dialog open={open} onClose={onClose} title="Your AI keys" icon={<KeyRound size={16} />} width={600}>
      {!user ? (
        <div className="space-y-3 p-5">
          <p className="text-[13px] text-zinc-400">Sign in to add your own model keys. They&apos;re encrypted on our server, tied to your account, and used for your builds before ours.</p>
          <button type="button" className="btn btn-primary" onClick={() => { onClose(); openSignIn(); }}><LogIn size={15} /> Sign in</button>
        </div>
      ) : (
        <div className="min-w-0 space-y-5 p-5">
          <section>
            <h3 className="mb-1 text-[12px] font-medium text-zinc-400">Add a key</h3>
            <p className="mb-2 text-[12px] text-zinc-500">Paste a key from any provider: Claude, GPT, Gemini, Grok, DeepSeek, Mistral, Groq, Hugging Face, OpenRouter or NEAR AI. We work out whose it is.</p>
            <form className="flex flex-wrap gap-2 sm:flex-nowrap" onSubmit={(e) => { e.preventDefault(); if (paste.trim()) void add(); }}>
              <input
                className="field h-9 min-w-0 flex-1 font-mono text-[12.5px]"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-…, AIza…, xai-…, hf_…"
                value={paste}
                aria-label="API key"
                onChange={(e) => { setPaste(e.target.value); setState({ s: "idle" }); }}
              />
              <button type="submit" className="btn btn-primary h-9" disabled={!paste.trim() || state.s === "busy"}>
                {state.s === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Detect and save
              </button>
            </form>
            {guess.length > 0 && state.s === "idle" && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-zinc-400">
                <ProviderMark provider={guess[0]} on /> Looks like {guess.length === 1 ? `a ${PROVIDER_NAMES[guess[0]]} key` : `${PROVIDER_NAMES[guess[0]]} (we'll also try ${guess.slice(1).map((g) => PROVIDER_NAMES[g]).join(", ")})`}.
              </p>
            )}
            {state.s === "ok" && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-lime"><CheckCircle2 size={13} /> {state.text}</p>}
            {state.s === "bad" && <p className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-300"><AlertTriangle size={13} className="mt-px shrink-0" /> {state.text}</p>}
          </section>

          {saved.length > 0 && (
            <section>
              <h3 className="mb-2 text-[12px] font-medium text-zinc-400">Your keys</h3>
              <div className="space-y-2">{saved.map((id) => <KeyRow key={id} id={id} saved={user.keys[id]} onUser={(u) => u && setSessionUser(u)} />)}</div>
            </section>
          )}

          <section>
            <button type="button" className="flex w-full items-center gap-2 text-left text-[12px] font-medium text-zinc-400 hover:text-zinc-200" aria-expanded={all} onClick={() => setAll((a) => !a)}>
              Add under a provider <span className="font-normal text-zinc-500">({rest.length})</span>
              <ChevronDown size={13} className={`ml-auto transition-transform ${all ? "rotate-180" : ""}`} />
            </button>
            {all && <div className="mt-2 space-y-2">{rest.map((id) => <KeyRow key={id} id={id} saved={user.keys[id]} onUser={(u) => u && setSessionUser(u)} />)}</div>}
          </section>

          <p className="text-[11.5px] text-zinc-500">Your keys run first, then ours if they fail. Builds on your own model key don&apos;t count toward your plan. Keys are encrypted at rest and never shown again. Chain and X keys are in Settings → API keys.</p>
        </div>
      )}
    </Dialog>
  );
}
