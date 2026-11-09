import type { Metadata } from "next";
import { TopBar } from "@/components/account/TopBar";
import { DomainSearch } from "@/components/build/DomainSearch";

export const metadata: Metadata = { title: "Find a domain · devit" };

// The full domain search, opened from the Publish dialog's custom domain section ("Search every extension").
export default async function Domains({ searchParams }: { searchParams: Promise<{ q?: string; project?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[1040px] px-4 pb-24 pt-8 sm:px-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Find a domain</h1>
        <p className="mt-1 text-[13px] text-zinc-500">Every extension we sell, with prices that include registration and WHOIS privacy. Search several names at once with commas.</p>
        <DomainSearch initial={(sp.q ?? "").slice(0, 120)} projectId={sp.project?.slice(0, 64) || null} />
      </main>
    </div>
  );
}
