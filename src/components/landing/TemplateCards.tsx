"use client";

import { ArrowUpRight } from "lucide-react";
import { THEMES, THEME_LABELS, fxOf } from "@/lib/themes";
import type { ThemeId } from "@/lib/spec";

const STARTERS: Record<ThemeId, { ticker: string; line: string; prompt: string }> = {
  degen: { ticker: "WOOF", line: "The loudest dog on Solana.", prompt: "A loud degen site for $WOOF, a dog coin on Solana, with a live chart and a big buy button" },
  clean: { ticker: "GRNT", line: "Grants for builders on NEAR.", prompt: "A clean site for $GRNT, a NEAR community grants token, with treasury, roadmap and FAQ" },
  retro: { ticker: "PIXEL", line: "Insert coin. Press start.", prompt: "A retro arcade site for $PIXEL on Robinhood Chain with a hi-score holders board" },
  cozy: { ticker: "FROG", line: "A soft little frog on Ethereum.", prompt: "A cozy pastel site for $FROG on Ethereum with how to buy and socials" },
  terminal: { ticker: "TAPE", line: "Every trade, as it happens.", prompt: "A terminal-style site for $TAPE on Solana, like Axiom: live chart, trades and a fast buy box up top" },
  app: { ticker: "PAWS", line: "Your first coin, made simple.", prompt: "A friendly wallet-app style site for $PAWS on Ethereum, like MetaMask, with how to buy and FAQ" },
  brutal: { ticker: "RAW", line: "The chart is the chart.", prompt: "A brutalist internet-native site for $RAW on Ethereum, like SPX6900, with tokenomics" },
  glass: { ticker: "FLOW", line: "Swap in from any chain.", prompt: "A glassy DeFi site for $FLOW on NEAR, like Uniswap, with liquidity stats and the swap box" },
};

/** A hint of the style's background effect on the card. */
function cardBg(t: (typeof THEMES)[ThemeId]): string {
  const fx = fxOf(t);
  const ink = t.dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  if (fx.bg === "glow") return `radial-gradient(70% 60% at 85% 10%, ${t.accent}40, transparent 70%), ${t.bg}`;
  if (fx.bg === "orbs") return `radial-gradient(35% 45% at 85% 20%, ${t.accent}55, transparent 70%), radial-gradient(30% 40% at 10% 90%, ${t.accent}30, transparent 70%), ${t.bg}`;
  if (fx.bg === "dots") return `radial-gradient(${ink} 1px, transparent 1.5px) 0 0/12px 12px, ${t.bg}`;
  if (fx.bg === "grid") return `linear-gradient(${ink} 1px, transparent 1px) 0 0/16px 16px, linear-gradient(90deg, ${ink} 1px, transparent 1px) 0 0/16px 16px, ${t.bg}`;
  if (fx.bg === "stripes") return `repeating-linear-gradient(-45deg, ${ink} 0 2px, transparent 2px 10px), ${t.bg}`;
  return t.bg;
}

export function TemplateCards() {
  function use(id: ThemeId) {
    window.dispatchEvent(new CustomEvent("sitesmith:prompt", { detail: { style: id, prompt: STARTERS[id].prompt } }));
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(Object.keys(STARTERS) as ThemeId[]).map((id, n) => {
        const t = THEMES[id];
        const s = STARTERS[id];
        return (
          <button key={id} type="button" onClick={() => use(id)} data-reveal style={{ "--d": n } as React.CSSProperties} className="group panel overflow-hidden p-0 text-left transition-[border-color,transform] duration-200 hover:border-white/20 active:scale-[.98]">
            <div style={{ background: cardBg(t), color: t.text }} className="relative h-[168px] origin-bottom overflow-hidden p-4 transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.04]">
              <div className="flex items-center justify-between text-[10px] font-semibold" style={{ color: t.muted }}>
                <span style={{ color: t.text }}>${s.ticker}</span>
                <span style={{ background: t.accent, color: t.accentText, borderRadius: fxOf(t).pill ? 999 : Math.min(t.radius, 8), boxShadow: fxOf(t).surface === "offset" ? `2px 2px 0 ${t.border}` : undefined }} className="px-2 py-1 transition-transform duration-300 group-hover:scale-110">Buy</span>
              </div>
              <div className="mt-6 text-[22px] font-extrabold leading-[1.05]" style={{ textTransform: t.uppercase ? "uppercase" : "none", letterSpacing: t.uppercase ? "0.01em" : "-0.02em" }}>{s.line}</div>
              <div className="mt-4 flex gap-1.5">
                {["MC", "Holders", "24h"].map((k) => (
                  <span key={k} style={{ background: t.surface, borderColor: t.border, borderRadius: Math.min(t.radius, 8), color: t.muted, boxShadow: fxOf(t).surface === "offset" ? `2px 2px 0 ${t.border}` : undefined, backdropFilter: fxOf(t).surface === "glass" ? "blur(8px)" : undefined }} className="border px-2 py-1 text-[9px]">{k}</span>
                ))}
              </div>
            </div>
            <div className="flex h-12 items-center justify-between border-t border-white/[0.06] px-4 text-[13px]">
              <span className="font-medium text-zinc-100">{THEME_LABELS[id]}</span>
              <span className="flex items-center gap-1 text-zinc-500 transition-colors group-hover:text-zinc-200">Use <ArrowUpRight size={14} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
