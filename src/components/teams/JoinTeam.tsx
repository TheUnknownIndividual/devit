"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, LogIn } from "lucide-react";
import { SignInDialog } from "@/components/account/SignInDialog";
import { setSessionUser } from "@/components/account/session";

/** Join with the account you're signed into, or sign in / sign up first and join straight after. */
export function JoinTeam({ token, team, signedIn, already }: { token: string; team: string; signedIn: boolean; already: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/invites/${encodeURIComponent(token)}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) router.push(`/projects?w=${encodeURIComponent(j.teamId)}`);
    else setError(j.error ?? "Couldn't join. Try again.");
  }

  if (already) return <button type="button" className="btn btn-primary w-full" onClick={() => router.push(`/projects?w=${encodeURIComponent(already)}`)}>You&apos;re in {team}. Open its projects <ArrowRight size={15} /></button>;
  return (
    <>
      {signedIn ? (
        <button type="button" className="btn btn-primary btn-lg w-full" disabled={busy} onClick={() => void join()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Join {team}</button>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-lg w-full" disabled={busy} onClick={() => setOpen(true)}>{busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Sign in or sign up to join</button>
          <p className="mt-2 text-center text-[12px] text-zinc-500">A passkey, an email code or a wallet. New here? That makes your account.</p>
        </>
      )}
      {error && <p role="alert" className="mt-3 rounded-[10px] border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[12.5px] text-amber-200">{error}</p>}
      <SignInDialog open={open} onClose={() => setOpen(false)} onDone={({ user }) => { setSessionUser(user); setOpen(false); void join(); }} />
    </>
  );
}
