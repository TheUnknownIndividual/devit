import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { TopBar } from "@/components/account/TopBar";
import { LeakTry } from "@/components/security/LeakTry";
import { posture } from "@/lib/env-guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Security · sitesmith",
  description: "How sitesmith keeps keys secret: AES-256-GCM sealing, log redaction, a leak firewall on every prompt and publish, and paid RPC keys that never reach a page. Checked live on the running server.",
  alternates: { canonical: "/security" },
};

const WHERE: Array<{ what: string; kept: string; reads: string }> = [
  { what: "Server keys (.env)", kept: "Handed to the process at start. Not in the code, the image or the logs.", reads: "The server process only" },
  { what: "Model and API keys you add", kept: "Sealed with AES-256-GCM in your account. Only the last 4 characters are ever shown.", reads: "Your builds, on the server" },
  { what: "Connector keys (MCP)", kept: "Sealed. Sent only to the connector you added, over https.", reads: "Read-only tool calls" },
  { what: "Database logins", kept: "Sealed. Forms on your site post to our server, which writes to your database.", reads: "The form endpoint" },
  { what: "Paid RPC URLs", kept: "Sealed on disk. Published sites read the chain through our proxy.", reads: "The RPC proxy" },
  { what: "Domain setup tokens", kept: "Not stored. Used for the one request that adds your DNS records.", reads: "That request" },
];

export default function Security() {
  const { checks, at } = posture();
  const passing = checks.filter((c) => c.ok).length;
  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[920px] px-4 pb-24 pt-10 sm:px-5">
        <div className="max-w-[640px]">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[40px]">Security</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            A token team pastes keys, RPC URLs and contract addresses into a site builder. Here is where each one goes, and the checks below run live on this server every time the page loads.
          </p>
        </div>

        <section className="mt-10" aria-labelledby="live">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="live" className="text-[18px] font-semibold text-white">{passing} of {checks.length} checks passing</h2>
            <p className="text-[12px] text-zinc-500">Read at {new Date(at).toISOString().slice(11, 16)} UTC · <a className="underline-offset-2 hover:text-zinc-300 hover:underline" href="/api/security">as JSON</a></p>
          </div>
          <ul className="mt-4 grid gap-px overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.id} className="flex min-w-0 gap-3 bg-ink-900 p-4">
                {c.ok ? <ShieldCheck size={17} className="mt-0.5 shrink-0 text-lime" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />}
                <div className="min-w-0">
                  <h3 className="text-[14px] font-medium text-white">{c.title}</h3>
                  <p className="mt-1 break-words text-[12.5px] leading-relaxed text-zinc-400">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="try">
          <h2 id="try" className="text-[18px] font-semibold text-white">Try the leak firewall</h2>
          <p className="mt-1.5 max-w-[640px] text-[13.5px] leading-relaxed text-zinc-400">
            The same check runs on every chat message, every new site description and every publish. Paste text with a key in it and see what a model would get. Nothing you type here is stored or logged.
          </p>
          <LeakTry />
        </section>

        <section className="mt-12" aria-labelledby="where">
          <h2 id="where" className="text-[18px] font-semibold text-white">Where each secret lives</h2>
          <div className="mt-4 overflow-hidden rounded-[14px] border border-white/[0.08]">
            {WHERE.map((w) => (
              <div key={w.what} className="grid min-w-0 gap-1 border-t border-white/[0.06] bg-ink-900 p-4 first:border-t-0 sm:grid-cols-[200px_minmax(0,1fr)_170px] sm:gap-4">
                <div className="text-[13.5px] font-medium text-white">{w.what}</div>
                <div className="min-w-0 text-[13px] leading-relaxed text-zinc-400">{w.kept}</div>
                <div className="text-[12.5px] text-zinc-500"><span className="sm:hidden">Read by: </span>{w.reads}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
