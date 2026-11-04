import type { Metadata } from "next";
import { TopBar } from "@/components/account/TopBar";
import { SettingsView } from "@/components/settings/SettingsView";
import { SignInNudge } from "@/components/projects/SignInNudge";
import { activePlan, buildsToday, publicUser, viewer } from "@/lib/accounts";
import { plan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings · sitesmith" };

export default async function Settings() {
  const { user } = await viewer();
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[1040px] px-5 pb-24 pt-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Settings</h1>
        {user ? (
          <SettingsView initial={publicUser(user)} usage={{ today: await buildsToday(`user:${user.id}`), cap: plan(activePlan(user)).buildsPerDay }} />
        ) : (
          <SignInNudge count={0} />
        )}
      </main>
    </div>
  );
}
