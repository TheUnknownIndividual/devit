"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SiteSpec } from "@/lib/spec";
import { usd, num } from "../format";
import { BuyBox, Chart, CopyCA, LiveStats, LiveTrades, WalletButton, useLiveToken, type Mode } from "./parts";
import { SignupForm } from "./signup";
import { BuyToasts, Leaderboard, Milestones, WhatIf } from "./fomo";

// Generated-code sites: the model's HTML marks where the live parts go (<div data-ss-widget="buy">) and where live
// numbers sit (<span data-ss-bind="price">). After the page loads, our own widgets mount into those slots through
// portals, so the model decides placement and look while wallets, quotes and charts stay our code.

export const WIDGETS = ["buy", "chart", "trades", "stats", "ca", "wallet", "signup", "whatif", "leaderboard", "milestones", "toasts"] as const;
export type WidgetKind = (typeof WIDGETS)[number];
const NUMERIC_BINDS = new Set(["price", "mcap", "marketCap", "liquidity", "volume", "holders", "change24h"]);
const STAT_KEYS = new Set(["price", "marketCap", "holders", "liquidity", "volume24h", "change24h", "supply", "curve"]);

interface Slot { el: HTMLElement; kind: WidgetKind; data: DOMStringMap }

function widget(s: Slot, spec: SiteSpec, mode: Mode, walletconnect: string | null, privy: string | null): ReactNode {
  const t = spec.token;
  const d = s.data;
  switch (s.kind) {
    case "buy": return <BuyBox chain={spec.chain} token={t} ticker={spec.ticker} />;
    case "chart": return <Chart token={t} mode={mode} dark={spec.theme.dark} />;
    case "trades": return <LiveTrades token={t} mode={mode} />;
    case "stats": {
      const items = (d.items ?? "").split(",").map((x) => x.trim()).filter((x) => STAT_KEYS.has(x));
      return <LiveStats token={t} mode={mode} count={mode === "live"} items={items.length ? items.slice(0, 4) : ["price", "marketCap", "liquidity", "volume24h"]} />;
    }
    case "ca": return t ? <CopyCA address={t.address} /> : null;
    case "wallet": return <WalletButton chain={spec.chain} token={t} walletconnect={walletconnect} privy={privy} />;
    case "signup": {
      const fields = d.fields === "wallet" || d.fields === "both" ? d.fields : "email";
      return <SignupForm fields={fields} button={d.button || "Join"} success={d.success || "You're on the list."} mode={mode} />;
    }
    case "whatif": return <WhatIf token={t} ticker={spec.ticker} mode={mode} amount={Number(d.amount) > 0 ? Number(d.amount) : 100} />;
    case "leaderboard": return <Leaderboard token={t} mode={mode} count={Math.max(3, Math.min(20, Number(d.count) || 10))} />;
    case "milestones": return <Milestones token={t} mode={mode} />;
    case "toasts": return <BuyToasts token={t} ticker={spec.ticker} mode={mode} minUsd={Number(d.min) >= 0 ? Number(d.min) : 50} seconds={6} />;
  }
}

/** The number inside a formatted value ("$12.4K" -> 12.4), with what's around it. */
function numberIn(text: string): { pre: string; n: number; post: string; dec: number; commas: boolean } | null {
  const m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text.trim());
  if (!m) return null;
  const raw = m[2];
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? { pre: m[1], n, post: m[3], dec: (raw.split(".")[1] ?? "").length, commas: raw.includes(",") } : null;
}

/** Counts a live number up from zero the first time it appears, then lands on the exact text. */
function countUp(el: HTMLElement, final: string): void {
  const p = numberIn(final);
  if (!p || p.n === 0) { el.textContent = final; return; }
  const start = performance.now(), dur = 900;
  const fmt = (v: number) => p.pre + (p.commas ? v.toLocaleString("en-US", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) : v.toFixed(p.dec)) + p.post;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    if (t >= 1) { el.textContent = final; return; }
    el.textContent = fmt(p.n * (1 - (1 - t) ** 3));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Mounts the live widgets into a generated site's slots and keeps data-ss-bind numbers current. */
export function CodeIslands({ rootId, spec, mode, walletconnect, privy }: { rootId: string; spec: SiteSpec; mode: Mode; walletconnect: string | null; privy: string | null }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const live = useLiveToken(spec.token, mode);

  // The sections' HTML is set outside React (dangerouslySetInnerHTML), so find the slots again whenever it changes.
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const scan = () => setSlots(
      [...root.querySelectorAll<HTMLElement>("[data-ss-widget]")]
        .filter((el) => (WIDGETS as readonly string[]).includes(el.dataset.ssWidget ?? ""))
        .map((el) => ({ el, kind: el.dataset.ssWidget as WidgetKind, data: { ...el.dataset } })),
    );
    scan();
    const mo = new MutationObserver((list) => { if (list.some((m) => m.type === "childList" && [...m.addedNodes].some((n) => n instanceof HTMLElement && (n.matches("section,[data-ss-widget]") || n.querySelector?.("[data-ss-widget]"))))) scan(); });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [rootId, spec.blocks]);

  // Scroll reveals and the rest of the motion live in CodeMotion (client/motion.tsx).

  // Live numbers written straight into the model's own markup.
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const t = live;
    const val: Record<string, string> = {
      price: usd(t?.priceUsd), mcap: usd(t?.marketCap), marketCap: usd(t?.marketCap), liquidity: usd(t?.liquidityUsd), volume: usd(t?.volume24h),
      holders: num(t?.holders), change24h: t?.change24h != null ? `${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(2)}%` : "—",
      symbol: `$${spec.ticker}`, name: spec.name, ca: t?.address ?? "",
    };
    const moving = mode === "live" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const el of root.querySelectorAll<HTMLElement>("[data-ss-bind]")) {
      const k = el.dataset.ssBind ?? "";
      if (!(k in val) || el.textContent === val[k]) continue;
      const numeric = NUMERIC_BINDS.has(k);
      const before = numeric ? numberIn(el.textContent ?? "") : null;
      const after = numeric ? numberIn(val[k]) : null;
      if (moving && after && !el.dataset.ssCounted && val[k] !== "—") { el.dataset.ssCounted = "1"; countUp(el, val[k]); continue; }
      el.textContent = val[k];
      // A number that moved flashes green or red, like a terminal tick.
      if (moving && before && after && before.n !== after.n) {
        const cls = after.n > before.n ? "ss-flash-up" : "ss-flash-down";
        el.classList.remove("ss-flash-up", "ss-flash-down");
        void el.offsetWidth;
        el.classList.add(cls);
      }
    }
  }, [rootId, live, mode, spec.ticker, spec.name, spec.blocks]);

  return <>{slots.map((s, i) => createPortal(widget(s, spec, mode, walletconnect, privy), s.el, `${s.kind}:${i}`))}</>;
}
