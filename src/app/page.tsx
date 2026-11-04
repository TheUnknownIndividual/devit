import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PromptBox } from "@/components/landing/PromptBox";
import { BrandIcon, BRANDS } from "@/components/brand";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { GetStarted } from "@/components/landing/GetStarted";
import { MotionFx } from "@/components/fx/MotionFx";
import { AccountMenu } from "@/components/account/AccountMenu";

export default function Home() {
  return (
    <div id="top" className="min-h-screen bg-ink-950">
      <MotionFx />
      <header className="enter relative z-20 mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-5">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Link href="#how" className="btn btn-ghost">How it works</Link>
          <Link href="#templates" className="btn btn-ghost">Templates</Link>
          <Link href="#integrations" className="btn btn-ghost">Integrations</Link>
          <Link href="/pricing" className="btn btn-ghost">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/projects" className="btn btn-ghost"><FolderOpen size={15} className="tilt" /> <span className="hidden sm:inline">My sites</span></Link>
          <GetStarted />
          <AccountMenu />
        </div>
      </header>

      {/* overflow-clip, not hidden: a hidden box can still be scrolled by scrollIntoView/focus, which slid the hero up inside itself. */}
      <section className="hero relative mx-2 overflow-clip rounded-[28px] border border-white/[0.06] sm:mx-3">
        {/* Background: slow-moving colour fields that lean toward the cursor, a dot grid that lights up under it, and fine grain. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[#0A0D1A]" />
          <div className="field-a absolute inset-0"><div className="absolute -left-[10%] -top-[30%] h-[90%] w-[70%] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(64,110,255,0.75),rgba(64,110,255,0))] blur-2xl" /></div>
          <div className="field-b absolute inset-0"><div className="absolute -right-[12%] -top-[10%] h-[80%] w-[55%] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(198,242,78,0.35),rgba(198,242,78,0))] blur-3xl [animation-delay:-6s]" /></div>
          <div className="field-c absolute inset-0"><div className="absolute bottom-[-35%] left-[20%] h-[70%] w-[70%] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(40,70,220,0.55),rgba(40,70,220,0))] blur-3xl [animation-delay:-11s]" /></div>
          <div className="hero-light absolute inset-0" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
          <div className="hero-dots absolute inset-0 bg-[radial-gradient(rgba(190,210,255,0.55)_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="absolute inset-0 opacity-[0.18] mix-blend-overlay [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22 stitchTiles=%22stitch%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-[860px] flex-col items-center px-5 pb-24 pt-24 text-center sm:pt-32">
          <h1 className="enter text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-white [--d:1] sm:text-[64px]">What are you launching today?</h1>
          <p className="enter mt-4 max-w-[620px] text-[17px] leading-relaxed text-zinc-300 [--d:2] sm:text-[19px]">
            Describe it in a sentence. Add your contract address and it reads your chain data, socials and posts too, then builds a site that sounds like you, with live charts, wallets and buys from any chain.
          </p>
          <PromptBox />
        </div>
      </section>

      <HowItWorks />

      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-10 text-[13px] text-zinc-500">
        <span>Built for NEAR HACKATHON 2026</span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><BrandIcon icon={BRANDS.near} size={13} color="#a1a1aa" /> NEAR AI Cloud</span>
          <span className="flex items-center gap-1.5"><BrandIcon icon={BRANDS.near} size={13} color="#a1a1aa" /> NEAR Intents</span>
          <span className="flex items-center gap-1.5"><BrandIcon icon={BRANDS.solana} size={13} color="#a1a1aa" /> Helius</span>
          <span className="flex items-center gap-1.5"><BrandIcon icon={BRANDS.cloudflare} size={13} color="#a1a1aa" /> Cloudflare</span>
        </span>
      </footer>
    </div>
  );
}
