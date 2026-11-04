"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Fingerprint, Loader2, Mail, Smartphone, Wallet } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Dialog } from "@/components/ui/Dialog";
import { BrandIcon, BRANDS } from "@/components/brand";
import type { PublicUser } from "@/lib/accounts";
import type { SolWallet } from "@/blocks/client/wallet";
import { evmWallets, signInEvm, signInNear, signInSolana, solanaWallets, type EvmChoice } from "./wallets";

// One dialog for signing in, signing up and (from Settings) linking another method. Every method ends the same way:
// the server answers with the account, signed in or with the method added.

type Done = (r: { user: PublicUser; linked: boolean }) => void;
type Busy = null | "passkey" | "passkey-new" | "email" | "code" | "google" | "solana" | "evm" | "near";

export function SignInDialog({ open, onClose, onDone, link = false }: { open: boolean; onClose: () => void; onDone: Done; link?: boolean }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [pick, setPick] = useState<null | "solana" | "evm">(null);
  const [sol, setSol] = useState<SolWallet[]>([]);
  const [evm, setEvm] = useState<EvmChoice[]>([]);
  const [offers, setOffers] = useState<{ google: boolean; email: boolean }>({ google: false, email: true });

  useEffect(() => {
    if (!open) return;
    setError(null); setPick(null); setBusy(null);
    fetch("/api/auth/methods").then((r) => r.json()).then(setOffers).catch(() => undefined);
    // Wallets announce themselves a beat after asking.
    evmWallets(); solanaWallets();
    const t = setTimeout(() => { setEvm(evmWallets()); setSol(solanaWallets()); }, 150);
    return () => clearTimeout(t);
  }, [open]);

  async function run(kind: NonNullable<Busy>, fn: () => Promise<{ user: PublicUser; linked: boolean }>) {
    setBusy(kind); setError(null);
    try { onDone(await fn()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function post(path: string, body: unknown) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again.");
    return j;
  }

  const passkey = (mode: "login" | "register") => run(mode === "login" ? "passkey" : "passkey-new", async () => {
    const o = await post("/api/auth/passkey", { step: "options", mode });
    let response;
    try {
      response = mode === "login" ? await startAuthentication({ optionsJSON: o.options }) : await startRegistration({ optionsJSON: o.options });
    } catch (e) {
      const n = (e as Error).name;
      throw new Error(n === "NotAllowedError" ? "The passkey prompt was closed." : n === "InvalidStateError" ? "This device already has a passkey for your account." : "This browser couldn't use a passkey.");
    }
    return post("/api/auth/passkey", { step: "verify", mode, id: o.id, response });
  });

  async function sendCode() {
    setBusy("email"); setError(null);
    try { await post("/api/auth/email", { step: "start", email }); setSent(true); setCode(""); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const verifyCode = () => run("code", () => post("/api/auth/email", { step: "verify", email, code }));

  // A full-page hop to Google and back to this page, signed in (or with Google added, from Settings).
  function google() {
    setBusy("google");
    window.location.href = `/api/auth/google?next=${encodeURIComponent(location.pathname + location.search)}`;
  }

  function wallet(kind: "solana" | "evm" | "near") {
    if (kind === "near") return void run("near", signInNear);
    const list = kind === "solana" ? solanaWallets() : evmWallets();
    if (kind === "solana") setSol(list as SolWallet[]); else setEvm(list as EvmChoice[]);
    if (!list.length) return setError(`No ${kind === "solana" ? "Solana" : "Ethereum"} wallet found in this browser. On a phone, open this page in your wallet app's browser.`);
    if (list.length === 1) return void run(kind, () => (kind === "solana" ? signInSolana(list[0] as SolWallet) : signInEvm(list[0] as EvmChoice)));
    setPick(kind);
  }

  const title = link ? "Add a sign-in method" : "Sign in to sitesmith";
  return (
    <Dialog open={open} onClose={onClose} title={title} icon={<Fingerprint size={15} />} width={440}>
      <div className="space-y-5 p-5">
        {pick ? (
          <div className="space-y-2">
            <button type="button" className="btn btn-ghost -ml-2 h-8 px-2 text-[12px]" onClick={() => setPick(null)}><ArrowLeft size={14} /> All methods</button>
            <p className="text-[12.5px] text-zinc-400">Pick a {pick === "solana" ? "Solana" : "Ethereum"} wallet. It only signs a message: no transaction, no cost.</p>
            {(pick === "solana" ? sol : evm).map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={!!busy}
                onClick={() => void run(pick, () => (pick === "solana" ? signInSolana(w as SolWallet) : signInEvm(w as EvmChoice)))}
                className="flex h-11 w-full items-center gap-3 rounded-[10px] border border-white/[0.08] bg-ink-850 px-3 text-left text-[13.5px] text-white hover:border-white/15 disabled:opacity-50"
              >
                {w.icon ? <img src={w.icon} alt="" className="h-5 w-5 rounded" /> : <Wallet size={16} className="text-zinc-400" />}
                <span className="flex-1 truncate">{w.name}</span>
                {busy === pick ? <Loader2 size={15} className="animate-spin text-zinc-400" /> : <ArrowRight size={15} className="text-zinc-500" />}
              </button>
            ))}
          </div>
        ) : (
          <>
            <section className="space-y-2">
              {!link && (
                <button type="button" className="btn btn-primary btn-lg w-full" disabled={!!busy} onClick={() => void passkey("login")}>
                  {busy === "passkey" ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />} Continue with a passkey
                </button>
              )}
              <button type="button" className={`btn btn-lg w-full ${link ? "btn-primary" : "btn-outline"}`} disabled={!!busy} onClick={() => void passkey("register")}>
                {busy === "passkey-new" ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />} {link ? "Add a passkey" : "Create an account with a passkey"}
              </button>
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-zinc-500">
                <Smartphone size={13} className="mt-0.5 shrink-0" /> Passkeys sync across your devices. On a computer without one, pick &ldquo;Use a phone or tablet&rdquo; in the prompt and scan the code.
              </p>
            </section>

            <Divider />

            {offers.google && (
              <button type="button" className="btn btn-outline btn-lg w-full" disabled={!!busy} onClick={google}>
                {busy === "google" ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark />} {link ? "Add Google" : "Continue with Google"}
              </button>
            )}
            {offers.google && !offers.email && <Divider />}

            {offers.email && (<>
            <section className="space-y-2">
              {!sent ? (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
                  <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
                  <button type="submit" className="btn btn-outline h-10" disabled={!/^\S+@\S+\.\S+$/.test(email) || !!busy}>
                    {busy === "email" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send code
                  </button>
                </form>
              ) : (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void verifyCode(); }}>
                  <p className="text-[12.5px] text-zinc-400">We sent a 6-digit code to <span className="text-white">{email}</span>.</p>
                  <div className="flex gap-2">
                    <input className="field font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Code" autoFocus />
                    <button type="submit" className="btn btn-primary h-10" disabled={code.length !== 6 || !!busy}>
                      {busy === "code" ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Verify
                    </button>
                  </div>
                  <button type="button" className="text-[12px] text-zinc-500 hover:text-white" onClick={() => { setSent(false); setError(null); }}>Use a different email</button>
                </form>
              )}
            </section>

            <Divider />
            </>)}

            <section className="grid grid-cols-3 gap-2">
              {([["solana", BRANDS.solana, "Solana"], ["evm", BRANDS.ethereum, "Ethereum"], ["near", BRANDS.near, "NEAR"]] as const).map(([k, icon, name]) => (
                <button key={k} type="button" className="btn btn-outline h-10 px-2" disabled={!!busy} onClick={() => wallet(k)} aria-label={`Sign in with a ${name} wallet`}>
                  {busy === k ? <Loader2 size={15} className="animate-spin" /> : <BrandIcon icon={icon} size={14} color="#d4d4d8" />} {name}
                </button>
              ))}
            </section>
          </>
        )}

        {error && <p role="alert" className="rounded-[10px] border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[12.5px] text-amber-200">{error}</p>}
      </div>
    </Dialog>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Divider() {
  return <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-zinc-600"><span className="h-px flex-1 bg-white/[0.07]" />or<span className="h-px flex-1 bg-white/[0.07]" /></div>;
}
