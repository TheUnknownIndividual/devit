// Coins a visitor can pay with (or get back) straight from a connected EVM wallet on a NEAR token's site.
// Each one is a NEAR Intents 1-Click asset. Every coin here was checked with a $20 1-Click quote on 2026-11-07; BNB Chain ($1,000 minimum at the time),
// Gnosis and Abstract (no quotes) are left out. Client-safe: no server imports.

export interface XChain { key: string; id: string; name: string; rpc: string; explorer: string; native: string }

export const XCHAINS: Record<string, XChain> = {
  eth: { key: "eth", id: "0x1", name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", native: "ETH" },
  base: { key: "base", id: "0x2105", name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", native: "ETH" },
  arb: { key: "arb", id: "0xa4b1", name: "Arbitrum", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", native: "ETH" },
  op: { key: "op", id: "0xa", name: "Optimism", rpc: "https://mainnet.optimism.io", explorer: "https://optimistic.etherscan.io", native: "ETH" },
  pol: { key: "pol", id: "0x89", name: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com", native: "POL" },
  avax: { key: "avax", id: "0xa86a", name: "Avalanche", rpc: "https://api.avax.network/ext/bc/C/rpc", explorer: "https://snowtrace.io", native: "AVAX" },
  bera: { key: "bera", id: "0x138de", name: "Berachain", rpc: "https://rpc.berachain.com", explorer: "https://berascan.com", native: "BERA" },
  monad: { key: "monad", id: "0x8f", name: "Monad", rpc: "https://rpc.monad.xyz", explorer: "https://monadscan.com", native: "MON" },
  hood: { key: "hood", id: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com", native: "ETH" },
  scroll: { key: "scroll", id: "0x82750", name: "Scroll", rpc: "https://rpc.scroll.io", explorer: "https://scrollscan.com", native: "ETH" },
  xlayer: { key: "xlayer", id: "0xc4", name: "X Layer", rpc: "https://rpc.xlayer.tech", explorer: "https://www.oklink.com/xlayer", native: "OKB" },
  plasma: { key: "plasma", id: "0x2611", name: "Plasma", rpc: "https://rpc.plasma.to", explorer: "https://plasmascan.to", native: "XPL" },
};
/** NEAR's Ethereum-compatible chain (NEP-518), where the wallet signs NEAR actions. */
export const NEAR_EVM_CHAIN: XChain = { key: "near", id: "0x18d", name: "NEAR Protocol", rpc: "https://eth-rpc.mainnet.near.org", explorer: "https://nearblocks.io", native: "NEAR" };

export interface XCoin {
  key: string;
  symbol: string;
  chain: string;
  chainId: string;
  rpc: string;
  explorer: string;
  native: string;
  asset: string;
  decimals: number;
  contract?: string;
  /** Left in the wallet for gas when paying with the chain's own coin. */
  reserve?: string;
}

function coin(chainKey: string, symbol: string, asset: string, decimals: number, contract?: string, reserve?: string): XCoin {
  const c = XCHAINS[chainKey];
  return { key: `${chainKey}:${symbol}`, symbol, chain: c.name, chainId: c.id, rpc: c.rpc, explorer: c.explorer, native: c.native, asset, decimals, contract, reserve };
}

export const XCOINS: XCoin[] = [
  coin("eth", "ETH", "nep141:eth.omft.near", 18, undefined, "0.0006"),
  coin("base", "ETH", "nep141:base.omft.near", 18, undefined, "0.00003"),
  coin("arb", "ETH", "nep141:arb.omft.near", 18, undefined, "0.00003"),
  coin("op", "ETH", "nep245:v2_1.omni.hot.tg:10_11111111111111111111", 18, undefined, "0.00003"),
  coin("eth", "USDC", "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", 6, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
  coin("base", "USDC", "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", 6, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
  coin("arb", "USDC", "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", 6, "0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
  coin("op", "USDC", "nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ", 6, "0x0b2c639c533813f4aa9d7837caf62653d097ff85"),
  coin("eth", "USDT", "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", 6, "0xdac17f958d2ee523a2206206994597c13d831ec7"),
  coin("arb", "USDT0", "nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near", 6, "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"),
  coin("pol", "POL", "nep245:v2_1.omni.hot.tg:137_11111111111111111111", 18, undefined, "0.05"),
  coin("pol", "USDC", "nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L", 6, "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"),
  coin("avax", "AVAX", "nep245:v2_1.omni.hot.tg:43114_11111111111111111111", 18, undefined, "0.005"),
  coin("avax", "USDC", "nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o", 6, "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"),
  coin("bera", "BERA", "nep141:bera.omft.near", 18, undefined, "0.01"),
  coin("monad", "MON", "nep245:v2_1.omni.hot.tg:143_11111111111111111111", 18, undefined, "0.05"),
  coin("monad", "USDC", "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx", 6, "0x754704bc059f8c67012fed69bc8a327a5aafb603"),
  coin("hood", "ETH", "nep141:hood.omft.near", 18, undefined, "0.00003"),
  coin("scroll", "ETH", "nep245:v2_1.omni.hot.tg:534352_11111111111111111111", 18, undefined, "0.00003"),
  coin("xlayer", "OKB", "nep245:v2_1.omni.hot.tg:196_11111111111111111111", 18, undefined, "0.001"),
  coin("xlayer", "USDC", "nep245:v2_1.omni.hot.tg:196_2dK9kLNR7Ekq7su8FxNGiUW3djTw", 6, "0x74b7f16337b8972027f6196a17a631ac6de26d22"),
  coin("plasma", "XPL", "nep141:plasma.omft.near", 18, undefined, "0.05"),
  coin("plasma", "USDT0", "nep141:plasma-0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb.omft.near", 6, "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"),
];
export const xcoin = (key: string) => XCOINS.find((c) => c.key === key) ?? null;
/** The chain in the shape wallet_addEthereumChain takes. */
export const addChainParams = (c: XChain) => ({ chainId: c.id, chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer], nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 } });
export const chainOfCoin = (c: XCoin) => XCHAINS[c.key.split(":")[0]];

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
