"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { AccountMenu } from "@/components/account/AccountMenu";
import { useSession } from "@/components/account/session";
import { GetStarted } from "./GetStarted";

/** Signed in: your projects and your account. Signed out: get started and sign in. */
export function HeaderActions() {
  const { user, loaded } = useSession();
  return (
    <div className="flex items-center gap-2">
      {user ? (
        <Link href="/projects" className="btn btn-ghost"><FolderOpen size={15} className="tilt" /> <span className="hidden sm:inline">Projects</span></Link>
      ) : loaded ? (
        <GetStarted />
      ) : null}
      <AccountMenu />
    </div>
  );
}
