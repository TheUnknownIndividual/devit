import { ArrowRight, Check, Globe, Loader2, MessageSquare, MousePointer2, Wallet } from "lucide-react";
import { BrandIcon, BRANDS, BrandLogo, ChainIcon, LogoStack, LOGOS } from "@/components/brand";
import { StyleShowcase } from "./StyleShowcase";

const STEPS = [
  { t: "Reading the chain", d: "$WOOF · price, holders", s: "done" },
  { t: "Finding socials and the story", d: "IPFS metadata, website", s: "done" },
  { t: "Reading their X", d: "@woof · 18 posts", s: "done" },
  { t: "Writing in their voice", d: "NEAR AI Cloud", s: "run" },
] as const;

const INTEGRATIONS: Array<{ name: string; what: string; mark: React.ReactNode }> = [
  { name: "MetaMask", what: "EVM wallets", mark: <LogoStack srcs={[LOGOS.metamask, LOGOS.rabby]} /> },
  { name: "Phantom", what: "Solana wallets", mark: <LogoStack srcs={[LOGOS.phantom, LOGOS.solflare, LOGOS.backpack]} /> },
  { name: "WalletConnect", what: "Mobile wallets", mark: <BrandLogo src={LOGOS.walletconnect} /> },
  { name: "NEAR wallets", what: "HOT, Meteor, Intear", mark: <LogoStack srcs={[LOGOS.hot, LOGOS.meteor, LOGOS.intear]} /> },
  { name: "Privy", what: "Email and social sign-in", mark: <BrandLogo src={LOGOS.privy} /> },
  { name: "Helius", what: "Solana data and RPC", mark: <BrandLogo src={LOGOS.helius} /> },
  { name: "Alchemy", what: "EVM data and RPC", mark: <BrandLogo src={LOGOS.alchemy} /> },
  { name: "NEAR Intents", what: "Cross-chain buys", mark: <BrandLogo src={LOGOS.nearIntents} /> },
  { name: "Jupiter · KyberSwap", what: "Swaps on the site", mark: <LogoStack srcs={[LOGOS.jupiter, LOGOS.kyberswap]} /> },
];

export function HowItWorks() {
  return (
    <main className="mx-auto max-w-[1240px] px-5">
      <section id="how" className="scroll-mt-20 pt-20">
        <h2 data-reveal className="text-[28px] font-semibold tracking-[-0.02em] text-white">From one sentence to a live site</h2>
        <p data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-2 max-w-[600px] text-[15px] text-zinc-400">It does the homework first: the chain, the token&apos;s metadata, your website and your posts on X. Every step shows as it runs, with where each fact came from.</p>

        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          <article data-reveal className="spot panel p-5">
            <div className="flex items-center gap-2 text-[14px] font-medium text-white"><MessageSquare size={16} className="text-lime" /> Add your contract address, if you have one</div>
            <p className="mt-1.5 text-[13px] text-zinc-400">It finds your logo, socials and lore, and reads your recent posts so the copy sounds like you, not like a template.</p>
            <ol className="mt-5 space-y-1.5">
              {STEPS.map((s, i) => (
                <li key={s.t} style={{ animationDelay: `${i * 120}ms` }} className="flex h-10 animate-rise items-center gap-3 rounded-[10px] border border-white/[0.06] bg-ink-850 px-3">
                  {s.s === "done"
                    ? <span className="grid h-5 w-5 place-items-center rounded-full bg-lime/15 text-lime"><Check size={12} strokeWidth={3} /></span>
                    : <Loader2 size={16} className="animate-spin text-sel" />}
                  <span className="text-[13px] text-zinc-100">{s.t}</span>
                  <span className="ml-auto truncate text-[12px] text-zinc-500">{s.d}</span>
                </li>
              ))}
            </ol>
          </article>

          <article data-reveal style={{ "--d": 1 } as React.CSSProperties} className="spot panel p-5">
            <div className="flex items-center gap-2 text-[14px] font-medium text-white"><MousePointer2 size={16} className="text-sel" /> Click a block, leave a comment</div>
            <p className="mt-1.5 text-[13px] text-zinc-400">Pile up comments on any part of the preview, then apply them in one go. Only those blocks change.</p>
            <div className="relative mt-5 rounded-[12px] border border-white/[0.06] bg-[#0B0B0B] p-4">
              <div className="rounded-md outline outline-2 outline-offset-4 outline-sel">
                <div className="text-[20px] font-extrabold uppercase leading-none text-white">The loudest dog</div>
                <div className="mt-2 inline-block bg-[#FFE600] px-2.5 py-1.5 text-[11px] font-bold uppercase text-black">Buy $WOOF</div>
              </div>
              <span className="absolute -top-2.5 left-3 rounded-md bg-sel px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-950">Hero</span>
              <div className="mt-5 flex items-start gap-2 rounded-[10px] border border-white/10 bg-ink-850 p-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sel text-[10px] font-bold text-ink-950">1</span>
                <span className="text-[12.5px] text-zinc-200">Make the button say &ldquo;Ape in&rdquo; and the headline bigger</span>
              </div>
            </div>
          </article>

          <article data-reveal style={{ "--d": 2 } as React.CSSProperties} className="spot panel p-5">
            <div className="flex items-center gap-2 text-[14px] font-medium text-white"><Wallet size={16} className="text-[#14F195]" /> Buyers pay from other chains</div>
            <p className="mt-1.5 text-[13px] text-zinc-400">Each site gets a wallet button and a buy box. NEAR Intents lets buyers pay with ETH, SOL, BTC, USDC and more from 13 chains.</p>
            <div className="mt-5 flex items-center justify-between rounded-[12px] border border-white/[0.06] bg-ink-850 p-4">
              <div className="flex flex-col gap-2">
                {([["solana", "SOL"], ["ethereum", "ETH"], ["near", "NEAR"]] as const).map(([c, s]) => (
                  <span key={c} className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.07] bg-ink-900 px-2.5 text-[12px] text-zinc-200"><ChainIcon chain={c} size={14} /> {s}</span>
                ))}
                <span className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.07] bg-ink-900 px-2.5 text-[12px] text-zinc-200"><BrandIcon icon={BRANDS.bitcoin} size={14} /> BTC</span>
              </div>
              <svg width="70" height="120" viewBox="0 0 70 120" fill="none" aria-hidden="true" className="text-white/20">
                {[16, 48, 80, 112].map((y) => <path key={y} d={`M0 ${y - 4} C 35 ${y - 4}, 35 60, 70 60`} stroke="currentColor" strokeDasharray="3 4" className="animate-[dash_1.2s_linear_infinite]" />)}
              </svg>
              <div className="flex flex-col items-center gap-2">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-lime"><BrandIcon icon={BRANDS.near} size={22} color="#08080A" /></span>
                <span className="text-[11px] text-zinc-400">NEAR Intents</span>
                <span className="flex h-8 items-center gap-1.5 rounded-lg bg-[#FFE600] px-2.5 text-[12px] font-bold text-black">$WOOF</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="templates" className="scroll-mt-20 pt-20">
        <h2 data-reveal className="text-[28px] font-semibold tracking-[-0.02em] text-white">Start from a style</h2>
        <p data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-2 max-w-[560px] text-[15px] text-zinc-400">Real sites, built from the same blocks yours will be. Pick one and it fills the prompt; change anything after with a comment.</p>
        <div data-reveal style={{ "--d": 2 } as React.CSSProperties} className="mt-8"><StyleShowcase /></div>
        <p className="mt-4 text-[13px] text-zinc-500"><a href="/templates" className="text-zinc-300 underline underline-offset-4 hover:text-white">Browse all templates</a> for memecoin, dApp and NFT sites.</p>
      </section>

      <section id="integrations" className="scroll-mt-20 pt-20">
        <h2 data-reveal className="text-[28px] font-semibold tracking-[-0.02em] text-white">Wired in for you</h2>
        <p data-reveal style={{ "--d": 1 } as React.CSSProperties} className="mt-2 max-w-[560px] text-[15px] text-zinc-400">Wallets work out of the box. For WalletConnect and Privy, the builder walks you through getting an ID and checks it before it goes live.</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INTEGRATIONS.map((i, n) => (
            <div key={i.name} data-reveal style={{ "--d": n % 4 } as React.CSSProperties} className="spot panel group flex h-[72px] items-center gap-3 px-4 transition-colors hover:border-white/15">
              <span className="transition-transform duration-300 [transition-timing-function:var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-110">{i.mark}</span>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-white">{i.name}</div>
                <div className="truncate text-[12px] text-zinc-500">{i.what}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-20">
        <div data-reveal className="spot panel flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Globe size={20} className="text-lime" />
            <div>
              <div className="text-[15px] font-medium text-white">Publish to your own subdomain</div>
              <div className="text-[13px] text-zinc-400">One click to a live address. Pay for a custom domain in crypto through NEAR Intents.</div>
            </div>
          </div>
          <a href="#start" className="btn btn-outline">Build a site <ArrowRight size={15} className="nudge-r" /></a>
        </div>
      </section>
    </main>
  );
}
