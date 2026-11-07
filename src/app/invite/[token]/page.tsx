import Link from "next/link";
import type { Metadata } from "next";
import { TopBar } from "@/components/account/TopBar";
import { JoinTeam } from "@/components/teams/JoinTeam";
import { getUser, viewer } from "@/lib/accounts";
import { inviteByToken, roleIn } from "@/lib/teams";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join a team · devit", robots: { index: false } };

/** An invite link: who's asking, for which team and role. Joining needs an account, made or signed into here. */
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await inviteByToken(token);
  const { user } = await viewer();
  const by = found ? await getUser(found.invite.by) : null;
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[480px] px-5 pb-20 pt-12">
        <div className="rounded-2xl border border-white/[0.08] bg-ink-900 p-5 sm:p-6">
          {found ? (
            <>
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-white">Join {found.team.name}</h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
                {by?.name || by?.email || "A teammate"} invited you as {found.invite.role === "editor" ? "an editor: you can change and publish the team's sites" : "a viewer: you can open the team's sites without changing them"}.
              </p>
              <div className="mt-5"><JoinTeam token={token} team={found.team.name} signedIn={!!user} already={roleIn(found.team, user?.id) ? found.team.id : null} /></div>
            </>
          ) : (
            <>
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-white">This invite doesn&apos;t work any more</h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">It was already used, revoked, or it&apos;s more than a week old. Ask whoever sent it for a new link.</p>
              <Link href="/projects" className="btn btn-outline mt-5">Your projects</Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
