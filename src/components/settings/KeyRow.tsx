"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { PublicUser } from "@/lib/accounts";
import { KEY_LABELS } from "@/lib/apikeys";
import type { KeyId } from "@/lib/keyscope";

// One API key or RPC: add, verify, switch on or off, replace, remove. Used in Settings and in the builder's keys dialog.

type Saved = PublicUser["keys"][KeyId];
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function send(method: string, path: string, body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}

export function KeyRow({ id, saved, onUser }: { id: KeyId; saved: Saved; onUser: (u: PublicUser | undefined) => void }) {
  const meta = KEY_LABELS[id];
  const rpc = id.startsWith("rpc:");
  const [value, setValue] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "bad"; reason?: string; for?: string }>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const open = (!saved && adding) || replacing;

  async function verify(save: boolean) {
    setCheck({ state: "checking" });
    const key = open ? value.trim() : undefined;
    const { j } = await send("POST", "/api/account/keys", { id, key, save });
    setCheck(j.ok ? { state: "ok", for: key } : { state: "bad", reason: j.reason ?? j.error ?? "That didn't work." });
    if (j.ok && j.user) onUser(j.user);
    if (j.ok && save) { setValue(""); setReplacing(false); setAdding(false); setCheck({ state: "idle" }); }
  }

  async function toggle(use: boolean) {
    setBusy(true);
    const { j } = await send("PATCH", "/api/account/keys", { id, use });
    setBusy(false);
    onUser(j.user);
  }

  async function remove() {
    setBusy(true);
    const { j } = await send("DELETE", `/api/account/keys?id=${encodeURIComponent(id)}`);
    setBusy(false);
    setCheck({ state: "idle" });
    onUser(j.user);
  }

  return (
    <div className="rounded-[12px] border border-white/[0.08] bg-ink-850 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <KeyRound size={15} className="shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-white">{meta.name}</div>
          <div className="text-[11.5px] text-zinc-500">{meta.hint}</div>
        </div>
        {saved && !replacing && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[12px] text-zinc-300">{saved.host ? `${saved.host} ` : ""}••••{saved.last4}</span>
            <Switch on={saved.use} disabled={busy} onChange={(v) => void toggle(v)} label={`Use my ${meta.name} key`} />
          </div>
        )}
        {!saved && !adding && <button type="button" className="btn btn-outline h-8" onClick={() => setAdding(true)}><Plus size={14} /> Add</button>}
      </div>

      {!saved && !adding ? null : saved && !replacing ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[27px]">
          <span className="text-[11.5px] text-zinc-500">{saved.use ? "Use my key: on" : "Use my key: off"}{saved.verifiedAt ? ` · verified ${day(saved.verifiedAt)}` : ""}</span>
          <span className="ml-auto flex items-center gap-1">
            <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" disabled={check.state === "checking"} onClick={() => void verify(false)}>
              {check.state === "checking" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verify
            </button>
            <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => { setReplacing(true); setCheck({ state: "idle" }); }}>Replace</button>
            <button type="button" className="btn btn-ghost h-7 px-2 text-[12px] text-red-300" disabled={busy} onClick={() => void remove()}><Trash2 size={13} /> Remove</button>
          </span>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2 sm:flex-nowrap sm:pl-[27px]">
          <input
            className="field h-9 min-w-0 flex-1 font-mono text-[12.5px]"
            type={rpc ? "url" : "password"}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            placeholder={rpc ? "https://…" : "Paste your key"}
            value={value}
            aria-label={`${meta.name} ${rpc ? "URL" : "key"}`}
            onChange={(e) => { setValue(e.target.value); setCheck({ state: "idle" }); }}
          />
          <button type="button" className="btn btn-outline h-9" disabled={!value.trim() || check.state === "checking"} onClick={() => void verify(false)}>
            {check.state === "checking" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verify
          </button>
          <button type="button" className="btn btn-primary h-9" disabled={check.state !== "ok" || check.for !== value.trim()} onClick={() => void verify(true)}>Save</button>
          <button type="button" className="btn btn-ghost h-9" onClick={() => { setReplacing(false); setAdding(false); setValue(""); setCheck({ state: "idle" }); }}>Cancel</button>
        </div>
      )}

      {check.state === "ok" && open && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-lime sm:pl-[27px]"><CheckCircle2 size={13} /> {meta.name} accepted it. Save to use it.</p>}
      {check.state === "ok" && !open && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-lime sm:pl-[27px]"><CheckCircle2 size={13} /> Still works.</p>}
      {check.state === "bad" && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-300 sm:pl-[27px]"><AlertTriangle size={13} /> {check.reason}</p>}
      {open && <a href={meta.get} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-zinc-500 hover:text-white sm:pl-[27px]">Get one <ArrowUpRight size={11} /></a>}
    </div>
  );
}


export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-md border transition-colors disabled:opacity-50 ${on ? "border-lime/50 bg-lime/20" : "border-white/15 bg-white/[0.05]"}`}
    >
      <span className={`absolute top-[2px] h-3.5 w-3.5 rounded-[4px] transition-[left,background-color] ${on ? "left-[18px] bg-lime" : "left-[2px] bg-zinc-500"}`} />
    </button>
  );
}
