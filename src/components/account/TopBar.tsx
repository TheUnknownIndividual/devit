import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { AccountMenu } from "./AccountMenu";

/** The header of the account pages (/projects, /pricing, /settings). */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="mx-auto flex h-16 max-w-[1040px] items-center justify-between gap-3 px-5">
      <Logo />
      <div className="flex items-center gap-1.5">
        <Link href="/projects" className="btn btn-ghost hidden sm:inline-flex">Projects</Link>
        <Link href="/templates" className="btn btn-ghost hidden sm:inline-flex">Templates</Link>
        <Link href="/pricing" className="btn btn-ghost hidden sm:inline-flex">Pricing</Link>
        {children}
        <AccountMenu />
      </div>
    </header>
  );
}
