import type { Metadata } from "next";
import { TopBar } from "@/components/account/TopBar";
import { Gallery } from "@/components/templates/Gallery";

export const metadata: Metadata = {
  title: "Templates · sitesmith",
  description: "Starter templates for memecoin, dApp and NFT sites. Pick a style, press Use template, and sitesmith builds it around your token with live price, chart, trades and buys.",
  alternates: { canonical: "/templates" },
};

export default function Templates() {
  return (
    <div className="min-h-screen bg-ink-950">
      <TopBar />
      <main className="mx-auto max-w-[1040px] px-5 pb-24 pt-10">
        <div className="max-w-[620px]">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[40px]">Templates</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            Every template is a finished sample site with a made-up token. Use one and it is rebuilt around your own token, with your contract address, socials and words.
          </p>
        </div>
        <Gallery />
      </main>
    </div>
  );
}
