"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Mode } from "./parts";

// The signup block's form. Live pages post to /api/forms on their own host; the builder preview shows it but
// doesn't send, so testing a layout never fills the team's list.

export function SignupForm({ fields, button, success, mode, slug: fixed }: { fields: "email" | "wallet" | "both"; button: string; success: string; mode: Mode; slug?: string }) {
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [hp, setHp] = useState("");
  const [state, setState] = useState<{ s: "idle" | "sending" | "done" | "error"; msg?: string }>({ s: "idle" });
  const live = mode === "live";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!live || state.s === "sending") return;
    setState({ s: "sending" });
    const slug = location.pathname.match(/^\/s\/([a-z0-9-]+)/)?.[1] ?? fixed;
    const r = await fetch("/api/forms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, email: fields !== "wallet" ? email : undefined, wallet: fields !== "email" ? wallet : undefined, website: hp || undefined }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    setState(r?.ok ? { s: "done" } : { s: "error", msg: j?.error ?? "Couldn't send. Try again." });
  }

  if (state.s === "done") {
    return <div className="ss-signup-done" data-el="success" role="status"><Check size={18} /> {success}</div>;
  }
  return (
    <form className="ss-signup-form" onSubmit={(e) => void submit(e)} data-el="form" noValidate={!live}>
      {fields !== "wallet" && <input className="ss-input" type="email" inputMode="email" autoComplete="email" placeholder="you@email.com" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required={fields === "email"} maxLength={200} />}
      {fields !== "email" && <input className="ss-input" type="text" autoComplete="off" spellCheck={false} placeholder="Wallet address" aria-label="Wallet address" value={wallet} onChange={(e) => setWallet(e.target.value)} required={fields === "wallet"} maxLength={120} />}
      <input className="ss-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
      <button type="submit" className="ss-btn" data-el="button" disabled={state.s === "sending"}>
        {state.s === "sending" && <Loader2 size={16} className="ss-spin" />}{button}
      </button>
      {state.s === "error" && <div className="ss-signup-err" role="alert">{state.msg}</div>}
      {!live && <div className="ss-signup-note">Preview: entries are saved on the published site.</div>}
    </form>
  );
}
