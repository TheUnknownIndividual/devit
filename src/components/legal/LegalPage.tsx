import Link from "next/link";
import { TopBar } from "@/components/account/TopBar";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[720px] px-5 pb-24 pt-10">
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[40px]">{title}</h1>
        <p className="mt-2 text-[12.5px] text-zinc-500">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-[14.5px] leading-relaxed text-zinc-300 [&_h2]:mb-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-12 text-[13px] text-zinc-500">
          <Link href="/" className="underline-offset-4 hover:text-zinc-300 hover:underline">Home</Link>
          {" · "}
          <Link href="/privacy" className="underline-offset-4 hover:text-zinc-300 hover:underline">Privacy</Link>
          {" · "}
          <Link href="/terms" className="underline-offset-4 hover:text-zinc-300 hover:underline">Terms</Link>
        </p>
      </main>
    </div>
  );
}
