"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FolderOpen, LogIn, LogOut, Settings } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { PLANS } from "@/lib/plans";
import { refreshSession, setSessionUser, useSession } from "./session";
import { SignInDialog } from "./SignInDialog";

// The top-right account control on every page: "Sign in" when signed out, the account's initial when signed in.

export function Avatar({ initial, size = 28 }: { initial: string; size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.46 }} className="grid shrink-0 place-items-center rounded-lg bg-lime font-semibold text-ink-950">{initial}</span>;
}

/** `compact` keeps it to an icon at every width (the builder's crowded bar); otherwise the label shows from sm up. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, loaded } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("sitesmith:signin", on);
    return () => window.removeEventListener("sitesmith:signin", on);
  }, []);

  const dialog = (
    <SignInDialog
      open={open}
      onClose={() => setOpen(false)}
      onDone={({ user }) => { setSessionUser(user); setOpen(false); router.refresh(); }}
    />
  );

  if (!loaded) return <span className={`h-9 w-9 shrink-0 ${compact ? "" : "sm:w-[84px]"}`} aria-hidden="true" />;
  if (!user) {
    return (
      <>
        <button type="button" className={`btn btn-outline max-sm:w-9 max-sm:px-0 ${compact ? "btn-icon" : ""}`} onClick={() => setOpen(true)} aria-label="Sign in">
          <LogIn size={15} />{!compact && <span className="hidden sm:inline">Sign in</span>}
        </button>
        {dialog}
      </>
    );
  }

  const who = user.name || user.email || user.methods[0]?.label || "Your account";
  return (
    <Menu
      label="Account"
      align="right"
      width={232}
      header={<div className="min-w-0"><div className="truncate text-[13px] font-medium text-white">{who}</div><div className="text-[11.5px] text-zinc-500">{PLANS.find((p) => p.id === user.plan)?.name} plan</div></div>}
      onPick={async (v: "projects" | "settings" | "pricing" | "out") => {
        if (v === "out") { await fetch("/api/auth/session", { method: "DELETE" }); await refreshSession(); router.refresh(); return; }
        router.push(`/${v}`);
      }}
      items={[
        { value: "projects", label: "Projects", icon: <FolderOpen size={15} /> },
        { value: "settings", label: "Settings", icon: <Settings size={15} /> },
        { value: "pricing", label: "Pricing", icon: <CreditCard size={15} /> },
        { value: "out", label: "Sign out", icon: <LogOut size={15} /> },
      ]}
      trigger={() => <button type="button" className="btn btn-ghost btn-icon" aria-label={`Account: ${who}`}><Avatar initial={user.initial} /></button>}
    />
  );
}
