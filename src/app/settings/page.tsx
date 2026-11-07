import type { Metadata } from "next";
import { TopBar } from "@/components/account/TopBar";
import { SettingsView } from "@/components/settings/SettingsView";
import { SignInNudge } from "@/components/projects/SignInNudge";
import { getUser, publicUser, viewer } from "@/lib/accounts";
import { balance, payerFor } from "@/lib/credits";
import { isAdmin, sweepPayments } from "@/lib/billing";
import { sweepCreditOrders } from "@/lib/credit-orders";
import { entitled } from "@/lib/entitlements";
import { teamsOf } from "@/lib/teams";
import { teamView } from "@/lib/team-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings · sitesmith" };

export default async function Settings() {
  const v = await viewer();
  // Ask 1-Click about open payments first, so a plan that just landed shows as on.
  if (v.user) await Promise.all([sweepPayments(v.user.id), sweepCreditOrders(v.user.id)]);
  const user = v.user && ((await getUser(v.user.id)) ?? v.user);
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[1040px] px-5 pb-24 pt-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Settings</h1>
        {user ? (
          <SettingsView
            initial={publicUser(user)}
            usage={await balance(await payerFor(user, "-"))}
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
