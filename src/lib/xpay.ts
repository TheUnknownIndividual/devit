// Coins a visitor can pay with (or get back) straight from a connected Ethereum wallet on a NEAR token's site.
// Each one is a NEAR Intents 1-Click asset; client-safe (no server imports).

export interface XCoin {
  key: string;
  symbol: "ETH" | "USDC" | "USDT";
  chain: string;
  chainId: string;
  rpc: string;
  explorer: string;
  asset: string;
  decimals: number;
  contract?: string;
  /** Left in the wallet for gas when paying with the chain's own coin. */
  reserve?: string;
}

export const XCOINS: XCoin[] = [
  { key: "eth:ETH", symbol: "ETH", chain: "Ethereum", chainId: "0x1", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", asset: "nep141:eth.omft.near", decimals: 18, reserve: "0.0006" },
  { key: "base:ETH", symbol: "ETH", chain: "Base", chainId: "0x2105", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", asset: "nep141:base.omft.near", decimals: 18, reserve: "0.00003" },
  { key: "arb:ETH", symbol: "ETH", chain: "Arbitrum", chainId: "0xa4b1", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", asset: "nep141:arb.omft.near", decimals: 18, reserve: "0.00003" },
  { key: "eth:USDC", symbol: "USDC", chain: "Ethereum", chainId: "0x1", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", asset: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", decimals: 6, contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { key: "base:USDC", symbol: "USDC", chain: "Base", chainId: "0x2105", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6, contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
  { key: "arb:USDC", symbol: "USDC", chain: "Arbitrum", chainId: "0xa4b1", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", decimals: 6, contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
  { key: "eth:USDT", symbol: "USDT", chain: "Ethereum", chainId: "0x1", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", asset: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", decimals: 6, contract: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
];
export const xcoin = (key: string) => XCOINS.find((c) => c.key === key) ?? null;

/** "1.5" with 18 decimals → 1500000000000000000n, exactly (no float rounding). */
export function toUnits(v: string, decimals: number): bigint {
  const [w = "0", f = ""] = v.trim().split(".");
  if (!/^\d*$/.test(w) || !/^\d*$/.test(f)) return 0n;
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}
export function fromUnits(v: bigint | string, decimals: number): number {
  const b = BigInt(v);
  const d = 10n ** BigInt(decimals);
  return Number(b / d) + Number(b % d) / Number(d);
}
/** A plain decimal string for an input box, trimmed to `places` digits. */
export function unitsToInput(v: bigint, decimals: number, places = 6): string {
  const d = 10n ** BigInt(decimals);
  const f = (v % d).toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "");
  return `${v / d}${f ? `.${f}` : ""}`;
}
