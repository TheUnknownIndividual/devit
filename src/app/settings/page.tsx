import type { Metadata } from "next";
import { TopBar } from "@/components/account/TopBar";
import { SettingsView } from "@/components/settings/SettingsView";
import { SignInNudge } from "@/components/projects/SignInNudge";
import { buildsToday, getUser, publicUser, viewer } from "@/lib/accounts";
import { isAdmin, sweepPayments } from "@/lib/billing";
import { entitled, planOf } from "@/lib/entitlements";
import { FAIR_USE_BUILDS_PER_DAY, plan } from "@/lib/plans";
import { teamsOf } from "@/lib/teams";
import { teamView } from "@/lib/team-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings · sitesmith" };

export default async function Settings() {
  const v = await viewer();
  // Ask 1-Click about open payments first, so a plan that just landed shows as on.
  if (v.user) await sweepPayments(v.user.id);
  const user = v.user && ((await getUser(v.user.id)) ?? v.user);
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[1040px] px-5 pb-24 pt-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Settings</h1>
        {user ? (
          <SettingsView
            initial={publicUser(user)}
            usage={{ today: await buildsToday(`user:${user.id}`), cap: (await entitled(user, "unlimitedBuilds")) ? null : plan(await planOf(user)).buildsPerDay, fairUse: FAIR_USE_BUILDS_PER_DAY }}
            admin={isAdmin(user)}
            teams={{ list: await Promise.all((await teamsOf(user.id)).map((t) => teamView(t, user))), canCreate: await entitled(user, "teams") }}
          />
        ) : (
          <SignInNudge count={0} />
        )}
      </main>
    </div>
  );
}
