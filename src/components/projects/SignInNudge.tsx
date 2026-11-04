"use client";

import { LogIn } from "lucide-react";
import { openSignIn } from "@/components/account/session";

/** Signed out: these projects live in this browser only until you sign in. */
export function SignInNudge({ count }: { count: number }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-white/[0.08] bg-ink-900 px-4 py-3">
      <p className="min-w-0 flex-1 text-[13px] text-zinc-400">{count ? "These sites are kept in this browser. Sign in to keep them on your account and open them on any device." : "Sign in to see the sites on your account."}</p>
      <button type="button" className="btn btn-outline h-8" onClick={openSignIn}><LogIn size={14} /> Sign in</button>
    </div>
  );
}
