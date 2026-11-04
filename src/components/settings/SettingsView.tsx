"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, Fingerprint, KeyRound, Loader2, LogOut, Mail, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { BrandIcon, BRANDS } from "@/components/brand";
import { Avatar } from "@/components/account/AccountMenu";
import { SignInDialog } from "@/components/account/SignInDialog";
import { refreshSession, setSessionUser } from "@/components/account/session";
import type { PublicUser } from "@/lib/accounts";
import { KEY_LABELS } from "@/lib/apikeys";
import type { KeyId } from "@/lib/keyscope";
import { PLANS } from "@/lib/plans";

const SECTIONS = [["account", "Account"], ["methods", "Sign-in methods"], ["keys", "API keys"], ["plan", "Plan"]] as const;
const MODEL_KEYS: KeyId[] = ["nearai", "anthropic", "openai", "openrouter"];
const CHAIN_KEYS: KeyId[] = ["helius", "rpc:near", "rpc:solana", "rpc:ethereum", "rpc:robinhood"];

const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function send(method: string, path: string, body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}

export function SettingsView({ initial, usage }: { initial: PublicUser; usage: { today: number; cap: number | null } }) {
  const router = useRouter();
  const [user, setUser] = useState(initial);
  const [name, setName] = useState(initial.name ?? "");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [methodErr, setMethodErr] = useState<string | null>(null);
  const update = (u: PublicUser | null | undefined) => { if (u) { setUser(u); setSessionUser(u); } };
  const hasOwnModel = MODEL_KEYS.some((k) => user.keys[k]?.use);
  const plan = PLANS.find((p) => p.id === user.plan) ?? PLANS[0];

  async function saveName() {
    setSaving(true);
    const { j } = await send("PATCH", "/api/account", { name });
    setSaving(false);
    update(j.user);
  }

  async function unlink(kind: string, id: string) {
    setMethodErr(null);
    const { ok, j } = await send("DELETE", "/api/account/methods", { kind, id });
    if (!ok) return setMethodErr(j.error ?? "Couldn't remove it.");
    update(j.user);
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[180px_1fr]">
      <nav aria-label="Settings" className="hidden lg:block">
        <ul className="sticky top-6 space-y-0.5">
          {SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`} className="btn btn-ghost w-full justify-start">{label}</a></li>)}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        <Section id="account" title="Account">
          <div className="flex items-center gap-3">
            <Avatar initial={user.initial} size={40} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-white">{user.name || user.email || user.methods[0]?.label}</div>
              <div className="text-[12px] text-zinc-500">Member since {day(user.createdAt)}</div>
            </div>
          </div>
          <form className="mt-4 flex max-w-[460px] gap-2" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
            <input className="field" value={name} maxLength={60} placeholder="Your name" aria-label="Name" onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-outline h-10" disabled={saving || name === (user.name ?? "")}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
          </form>
          {user.email && <p className="mt-3 flex items-center gap-2 text-[12.5px] text-zinc-400"><Mail size={13} /> {user.email}</p>}
          <button type="button" className="btn btn-ghost mt-3 -ml-2 h-8 px-2 text-[12.5px]" onClick={async () => { await send("DELETE", "/api/auth/session"); await refreshSession(); router.push("/"); }}>
            <LogOut size={14} /> Sign out
          </button>
        </Section>

        <Section id="methods" title="Sign-in methods" hint="Any of these signs you in to this account. Keep at least two, so losing a device doesn't lock you out.">
          <ul className="divide-y divide-white/[0.06] rounded-[12px] border border-white/[0.08]">
            {user.methods.map((m) => (
              <li key={`${m.kind}:${m.fullId}`} className="flex min-h-[52px] items-center gap-3 px-3 py-2">
                <MethodIcon kind={m.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-white">{m.label}</div>
                  <div className="text-[11.5px] text-zinc-500">Added {day(m.at)}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-icon h-8 w-8" disabled={user.methods.length < 2} onClick={() => void unlink(m.kind, m.fullId)} aria-label={`Remove ${m.label}`} title={user.methods.length < 2 ? "Your only sign-in method" : "Remove"}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-outline mt-3" onClick={() => setLinking(true)}><Plus size={15} /> Add a method</button>
          {methodErr && <p role="alert" className="mt-2 text-[12.5px] text-amber-200">{methodErr}</p>}
          <SignInDialog link open={linking} onClose={() => setLinking(false)} onDone={({ user }) => { update(user); setLinking(false); }} />
        </Section>

        <Section id="keys" title="API keys" hint="Bring your own keys and your builds and edits run on them first, then on ours if they fail. Builds on your own model key don't count toward your plan. Keys are encrypted at rest and never shown again.">
          <h3 className="mb-2 text-[12px] font-medium text-zinc-400">Models</h3>
          <div className="space-y-2">{MODEL_KEYS.map((id) => <KeyRow key={id} id={id} saved={user.keys[id]} onUser={update} />)}</div>
          <h3 className="mb-2 mt-5 text-[12px] font-medium text-zinc-400">Chain data</h3>
          <div className="space-y-2">{CHAIN_KEYS.map((id) => <KeyRow key={id} id={id} saved={user.keys[id]} onUser={update} />)}</div>
        </Section>

        <Section id="plan" title="Plan">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-white">{plan.name}</div>
              <div className="mt-0.5 text-[12.5px] text-zinc-400">
                {usage.cap == null ? "Unlimited builds within fair use" : `${Math.min(usage.today, usage.cap)} of ${usage.cap} builds used today`}
                {hasOwnModel && " · builds on your own key don't count"}
                {user.planUntil ? ` · runs until ${day(user.planUntil)}` : ""}
              </div>
              {usage.cap != null && <div className="mt-2 h-1.5 max-w-[320px] overflow-hidden rounded-sm bg-white/[0.06]"><div className="h-full bg-lime" style={{ width: `${Math.min(100, (usage.today / usage.cap) * 100)}%` }} /></div>}
            </div>
            <Link href="/pricing" className="btn btn-outline">{user.plan === "free" ? "Upgrade" : "Change plan"} <ArrowUpRight size={14} /></Link>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-white/[0.08] bg-ink-900 p-4 sm:p-5" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-[15px] font-semibold text-white">{title}</h2>
      {hint && <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-zinc-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MethodIcon({ kind }: { kind: string }) {
  const c = "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-zinc-300";
  if (kind === "passkey") return <span className={c}><Fingerprint size={15} /></span>;
  if (kind === "email") return <span className={c}><Mail size={15} /></span>;
  const icon = kind === "solana" ? BRANDS.solana : kind === "evm" ? BRANDS.ethereum : BRANDS.near;
  return <span className={c}><BrandIcon icon={icon} size={14} color="#d4d4d8" /></span>;
}

type Saved = PublicUser["keys"][KeyId];

function KeyRow({ id, saved, onUser }: { id: KeyId; saved: Saved; onUser: (u: PublicUser | undefined) => void }) {
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

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
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
