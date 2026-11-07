import { ImageResponse } from "next/og";

// The share image for the builder's pages (Open Graph and X cards).
export const dynamic = "force-static";

export function GET() {
  const chains = ["NEAR", "Solana", "Ethereum", "Base", "BNB Chain", "Robinhood Chain"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#0A0D1A 0%,#0F1630 55%,#1A2A6B 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.2" fill="#C6F24E" />
            <rect x="13" y="2.5" width="8.5" height="8.5" rx="2.2" stroke="#C6F24E" strokeWidth="1.8" />
            <rect x="2.5" y="13" width="19" height="8.5" rx="2.2" stroke="#C6F24E" strokeWidth="1.8" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>devit</div>
          <div style={{ fontSize: 26, color: "#a1a1aa", marginLeft: 6 }}>devit.lol</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>A live website for your token, from one sentence.</div>
          <div style={{ fontSize: 30, color: "#cbd5e1", lineHeight: 1.35 }}>Live charts, wallets, swaps and cross-chain buys with NEAR Intents.</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {chains.map((c) => (
            <div key={c} style={{ display: "flex", fontSize: 22, color: "#e4e4e7", padding: "8px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.05)" }}>{c}</div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
