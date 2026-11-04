export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n === 0) return "$0";
  // Small prices: count the zeros after the point, like DexScreener does ($0.0₈9538).
  const zeros = Math.ceil(-Math.log10(n)) - 1;
  const digits = Math.round(n * 10 ** (zeros + 4)).toString().replace(/0+$/, "") || "0";
  if (zeros < 4) return `$${n.toFixed(zeros + 4).replace(/0+$/, "")}`;
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[+d]).join("");
  return `$0.0${sub}${digits}`;
}

export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function ago(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}
