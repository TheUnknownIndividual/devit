import { addressInUrl, detectAddress, findAddress, urlsIn } from "./address";
import type { Chain, TokenVenue } from "./spec";

// Launchpads, DEXes and aggregators a token can come from, so a pasted link or a "launched on pump.fun" is read
// right and the copy says how the token actually trades. Pure: the landing page reads links with it as you type.
// Facts checked 2026-11-04 against the venue's docs, its contracts on chain or its live API. Anything marked
// "unverified" came from third-party write-ups only, or is our best reading of the venue's links.

export type VenueKind = "launchpad" | "dex" | "aggregator";

export interface Venue {
  id: string;
  name: string;
  kind: VenueKind;
  chains: Chain[];
  /** How it works, in plain words: for the writer, the FAQ and How to buy. */
  how: string;
  site: string;
  /** Hosts of its app links. */
  hosts: RegExp;
  /** DexScreener dexId or GeckoTerminal dex id (labels joined after a space). */
  dex?: RegExp;
  /** Token addresses it mints end like this. */
  suffix?: RegExp;
  /** Names it in a sentence. */
  words?: RegExp;
  /** Starts tokens on a bonding curve (or auction) that later moves to a pool. */
  curve?: boolean;
  /** Where liquidity goes at graduation. */
  graduatesTo?: string;
  /** Our in-site router fills its curve (checked with a live quote). False sends buys to the venue until graduation. */
  routable?: boolean;
  /** Public read endpoint, where one exists. */
  api?: string;
  /** The venue's own page for buying the token. */
  buy?: (address: string, chain: Chain) => string;
}

const jup = (a: string) => `https://jup.ag/swap/SOL-${a}`;
const UNI_CHAIN: Partial<Record<Chain, string>> = { ethereum: "mainnet", base: "base", bsc: "bnb", robinhood: "robinhood" };

export const VENUES: Venue[] = [
  // ---------- Solana ----------
  {
    id: "pumpfun", name: "pump.fun", kind: "launchpad", chains: ["solana"], site: "https://pump.fun", hosts: /(^|\.)pump\.fun$/,
    dex: /^pump-?fun\b/, suffix: /pump$/, words: /\bpump\.?fun\b/i, curve: true, graduatesTo: "pumpswap", routable: true,
    // Supply, curve allocation and the 0.95% protocol fee read from pump.fun's Global account on chain. The ~85 SOL
    // graduation figure is third-party, and newer curves can be quoted in USDC (seen on chain): unverified.
    how: "Every pump.fun coin starts on its own bonding curve: 1B supply, about 793M of it sold on the curve, the price rising with each buy (0.95% protocol fee plus a creator fee per trade). When the curve sells out the coin graduates and its liquidity moves to a PumpSwap pool (Raydium before March 2025). Mints end in \"pump\".",
    buy: (a) => `https://pump.fun/coin/${a}`,
  },
  {
    id: "pumpswap", name: "PumpSwap", kind: "dex", chains: ["solana"], site: "https://swap.pump.fun", hosts: /^swap\.pump\.fun$/,
    dex: /^pump-?swap\b/, words: /\bpump\s?swap\b/i,
    // Fee split per swap (LP, protocol, creator, tapering with market cap) is third-party: unverified.
    how: "PumpSwap is pump.fun's own constant-product AMM, where pump.fun coins trade once they graduate from the curve. Each swap pays a small fee shared by liquidity providers, the protocol and the coin's creator.",
    buy: (a) => `https://pump.fun/coin/${a}`,
  },
  {
    id: "bonk", name: "letsbonk.fun", kind: "launchpad", chains: ["solana"], site: "https://bonk.fun", hosts: /(^|\.)(lets)?bonk\.fun$/,
    dex: /^letsbonk|^bonk-?fun/, suffix: /bonk$/, words: /\b(lets\s?bonk(\.fun)?|bonk\.fun|bonkfun)\b/i, curve: true, graduatesTo: "raydium", routable: true,
    // Built on Raydium LaunchLab, graduated "bonk" mints seen in Raydium CPMM pools. Threshold is LaunchLab's default.
    how: "letsbonk.fun (now bonk.fun) is the BONK community's launchpad, built on Raydium LaunchLab. Coins start on a LaunchLab bonding curve and graduate at about 85 SOL into a Raydium CPMM pool. Mints end in \"bonk\".",
    buy: (a) => `https://bonk.fun/token/${a}`, // link shape unverified
  },
  {
    id: "launchlab", name: "Raydium LaunchLab", kind: "launchpad", chains: ["solana"], site: "https://raydium.io/launchpad", hosts: /^$/,
    dex: /launch-?lab/, words: /\blaunch\s?lab\b/i, curve: true, graduatesTo: "raydium", routable: true,
    how: "Raydium LaunchLab is the bonding-curve engine behind letsbonk.fun and other Solana launchpads. A coin trades on its curve until it sells out or hits its raise target (85 SOL on the default mode), then the raised SOL and remaining tokens seed a Raydium CPMM pool; the LP is burned, locked or handed to the creator as the launch chose.",
    buy: (a) => `https://raydium.io/launchpad/token/?mint=${a}`, // link shape unverified
  },
  {
    id: "raydium", name: "Raydium", kind: "dex", chains: ["solana"], site: "https://raydium.io", hosts: /(^|\.)raydium\.io$/,
    dex: /^raydium/, words: /\braydium\b/i,
    how: "Raydium is Solana's biggest AMM family: AMM v4 (classic constant-product pools), CPMM (constant-product with Token-2022 support, 0.25% default fee) and CLMM (concentrated liquidity in chosen price ranges). Graduated pump.fun (before 2025) and LaunchLab coins land here.",
    buy: (a) => `https://raydium.io/swap/?inputMint=sol&outputMint=${a}`,
  },
  {
    id: "meteora-dbc", name: "Meteora DBC", kind: "launchpad", chains: ["solana"], site: "https://meteora.ag", hosts: /^$/,
    dex: /^meteora-?dbc/, words: /\b(meteora )?dbc\b|dynamic bonding curve/i, curve: true, graduatesTo: "meteora", routable: true,
    how: "Meteora's Dynamic Bonding Curve runs the curves of many Solana launchpads (Believe, Bags, Moonshot, Jupiter Studio and others). The price follows the launch's configured curve until the quote reserve reaches its migration threshold, then liquidity moves to a Meteora DAMM v2 pool with the LP locked for the launchpad and the creator. Jupiter and trading bots can trade the curve directly.",
    buy: jup,
  },
  {
    id: "meteora", name: "Meteora", kind: "dex", chains: ["solana"], site: "https://meteora.ag", hosts: /(^|\.)meteora\.ag$/,
    dex: /^meteora/, words: /\bmeteora\b|\bdlmm\b|\bdamm\b/i,
    how: "Meteora is a Solana DEX with DLMM pools (liquidity in discrete price bins, fees that rise with volatility) and DAMM v2 constant-product pools. Coins from Meteora's bonding curve (Believe, Bags, Moonshot, Jupiter Studio) graduate into DAMM v2 pools.",
    buy: jup,
  },
  {
    id: "orca", name: "Orca", kind: "dex", chains: ["solana"], site: "https://www.orca.so", hosts: /(^|\.)orca\.so$/,
    dex: /^orca/, words: /\borca\b|\bwhirlpools?\b/i,
    how: "Orca is a Solana DEX built on Whirlpools: concentrated-liquidity pools where providers pick a price range and a fee tier.",
    buy: jup,
  },
  {
    id: "moonshot", name: "Moonshot", kind: "launchpad", chains: ["solana"], site: "https://moonshot.com", hosts: /(^|\.)moonshot\.(com|money)$/,
    dex: /^moonshot|^moonit/, suffix: /moon$/, words: /\b(on|via|from|launched on) moonshot\b|moonshot\.(com|money)/i, curve: true, graduatesTo: "meteora", routable: true,
    // "moon" mints are listed on meteoradbc by DexScreener today; its graduation threshold is unverified.
    how: "Moonshot is DEX Screener's mobile launchpad. Coins (mints ending in \"moon\") start on a bonding curve, now run on Meteora's Dynamic Bonding Curve, and move to a Meteora pool when it fills.",
    buy: jup,
  },
  {
    id: "believe", name: "Believe", kind: "launchpad", chains: ["solana"], site: "https://believe.app", hosts: /(^|\.)believe\.app$/,
    dex: /^believe/, words: /\bbelieve\.app\b|\b(on|via|launched on) believe\b/i, curve: true, graduatesTo: "meteora", routable: true,
    // Uses Meteora DBC (Meteora's own docs). The ~$100K graduation market cap is third-party: unverified.
    how: "Believe launches a coin from a post on X. Its curve runs on Meteora's Dynamic Bonding Curve and the coin graduates into a Meteora DAMM v2 pool once the curve fills.",
    buy: jup,
  },
  {
    id: "jup-studio", name: "Jupiter Studio", kind: "launchpad", chains: ["solana"], site: "https://jup.ag/studio", hosts: /^$/,
    words: /\bjup(iter)?\s?studio\b/i, curve: true, graduatesTo: "meteora", routable: true,
    // On Meteora DBC per third-party write-ups; presets and creator fee split unverified.
    how: "Jupiter Studio is Jupiter's own launchpad. Coins start on a bonding curve (on Meteora's Dynamic Bonding Curve) and graduate into a Meteora pool when it fills.",
    buy: jup,
  },
  {
    id: "bags", name: "Bags", kind: "launchpad", chains: ["solana"], site: "https://bags.fm", hosts: /(^|\.)bags\.fm$/,
    dex: /^bags/, suffix: /BAGS$/, words: /\bbags\.fm\b|\b(on|via|launched on) bags\b/i, curve: true, graduatesTo: "meteora", routable: true,
    // "BAGS" mints seen on DexScreener as bags (curve) and meteora DYN2 (graduated). The 1% creator royalty is third-party.
    how: "Bags (bags.fm) is a Solana launchpad on Meteora's Dynamic Bonding Curve where the creator earns a share of every trade (about 1% of volume). Mints end in \"BAGS\"; graduated coins trade in Meteora DAMM v2 pools.",
    buy: (a) => `https://bags.fm/${a}`,
  },
  {
    id: "jupiter", name: "Jupiter", kind: "aggregator", chains: ["solana"], site: "https://jup.ag", hosts: /(^|\.)jup\.ag$/,
    words: /\bjupiter\b|\bjup\.ag\b/i,
    how: "Jupiter is Solana's main swap aggregator: it splits an order across every major pool and launchpad curve (pump.fun, Meteora, Raydium, LaunchLab and more) for the best price. In-site buys on Solana go through Jupiter.",
    buy: jup,
  },

  // ---------- EVM ----------
  {
    id: "pools", name: "pools.trade", kind: "launchpad", chains: ["robinhood"], site: "https://pools.xyz", hosts: /(^|\.)pools\.(trade|xyz)$/,
    dex: /pools-?trade/, words: /\bpools\.(trade|xyz)\b/i,
    how: "pools.trade (now pools.xyz) is Uniswap Labs' launchpad on Robinhood Chain, live since August 2026. Coins launch straight into permanently locked Uniswap v4 pools: free to launch, 0.25% per trade.",
    buy: (a) => `https://app.uniswap.org/swap?chain=robinhood&outputCurrency=${a}`,
  },
  {
    id: "pons", name: "Pons", kind: "launchpad", chains: ["robinhood"], site: "https://ponsfamily.com", hosts: /(^|\.)(ponsfamily\.com|pons\.family)$/,
    // GeckoTerminal ids: pons-dot-family (V1), pons-v2 (curves), pons-v2-dex (graduated pools).
    dex: /^pons/, words: /\bpons(\.family|family(\.com)?)?\b/i, curve: true, graduatesTo: "uniswap", routable: true,
    // pons.family is what GeckoTerminal calls Pons V1; the domain itself no longer resolves (checked). V2 facts from
    // docs.ponsfamily.com/docs/v2 and its factory 0x7eD5…EC7e on chain; KyberSwap quoted a V2 curve token live.
    how: "Pons (ponsfamily.com, first launched as pons.family) is Robinhood Chain's biggest launchpad. Each token gets its own bonding curve, priced from its reserves with a 1% fee plus an optional creator tax; buys in the first 5 seconds pay an anti-sniper tax that decays from 99% to zero. When the curve sells out (about 4.2 ETH raised) liquidity moves into a Uniswap v4 pool and is locked forever.",
    buy: (a) => `https://ponsfamily.com/launchpad/${a}`,
  },
  {
    id: "clanker", name: "Clanker", kind: "launchpad", chains: ["base", "robinhood"], site: "https://www.clanker.world", hosts: /(^|\.)clanker\.world$/,
    dex: /^clanker/, suffix: /b07$/i, words: /\bclanker\b/i,
    // "b07" suffix seen on every Clanker v4 token in its API; 20% protocol cut from DefiLlama. No curve: launches into a pool.
    how: "Clanker deploys a token straight into a Uniswap v4 pool (v3 before v4) with the starting liquidity locked forever; there is no bonding curve. The creator earns most of the pool's LP fees and Clanker keeps 20%. Clanker v4 token addresses end in \"b07\".",
    buy: (a) => `https://www.clanker.world/clanker/${a}`,
  },
  {
    id: "zora", name: "Zora", kind: "launchpad", chains: ["base"], site: "https://zora.co", hosts: /(^|\.)zora\.co$/,
    dex: /^zora/, words: /\bzora\b/i,
    how: "Zora turns every creator profile (creator coin) and post (content coin) on Base into an ERC-20 that trades in its own Uniswap v4 pool from the first block, with no curve. Trades pay 1%, split between the creator, referrers, the protocol and liquidity, and a sniper tax decays from 99% over the first 10 seconds. Content coins are paired against their creator's coin.",
    buy: (a) => `https://zora.co/coin/base:${a}`,
  },
  {
    id: "fourmeme", name: "four.meme", kind: "launchpad", chains: ["bsc"], site: "https://four.meme", hosts: /(^|\.)four\.meme$/,
    dex: /^four-?meme/, suffix: /(4444|ffff)$/i, words: /\bfour\.?meme\b|\b4meme\b/i, curve: true, graduatesTo: "pancakeswap", routable: false,
    // Docs (four-meme.gitbook.io): 1% fee, 20% of supply + raised funds to PancakeSwap. Suffixes seen on DexScreener.
    // KyberSwap found no route for a token still on the curve.
    how: "four.meme is BNB Chain's main launchpad. Coins trade on its internal bonding curve (1% fee per trade, at least 0.001 BNB) until it fills; then 20% of the supply and all the raised funds are paired in a PancakeSwap pool. Addresses usually end in \"4444\".",
    buy: (a) => `https://four.meme/token/${a}`,
  },
  {
    id: "flap", name: "flap.sh", kind: "launchpad", chains: ["bsc", "base", "robinhood"], site: "https://flap.sh", hosts: /(^|\.)flap\.sh$/,
    dex: /^flap/, suffix: /7777$/, words: /\bflap\.sh\b/i, curve: true,
    // Only the dexId (flapsh) and the "7777" suffix are seen on DexScreener; its mechanics are unverified.
    how: "flap.sh is a launchpad on BNB Chain, Base and Robinhood Chain; its token addresses end in \"7777\".",
  },
  {
    id: "aerodrome", name: "Aerodrome", kind: "dex", chains: ["base", "robinhood"], site: "https://aerodrome.finance", hosts: /(^|\.)aerodrome\.finance$/,
    dex: /^aero/, words: /\baerodrome\b/i,
    // On Robinhood Chain as "aero" (DexScreener) and aero-slipstream-robinhood (GeckoTerminal).
    how: "Aerodrome is Base's main DEX: volatile and stable pools plus Slipstream concentrated-liquidity pools, with trading fees paid to AERO voters who steer emissions.",
    buy: (a) => `https://aerodrome.finance/swap?from=eth&to=${a}`, // link shape unverified
  },
  {
    id: "pancakeswap", name: "PancakeSwap", kind: "dex", chains: ["bsc", "ethereum", "base", "robinhood"], site: "https://pancakeswap.finance", hosts: /(^|\.)pancakeswap\.finance$/,
    dex: /^pancake/, words: /\bpancake\s?swap\b/i,
    how: "PancakeSwap is BNB Chain's main DEX, also on Ethereum, Base and Robinhood Chain: v2 constant-product pools, v3 concentrated liquidity and Infinity pools with hooks. Graduated four.meme coins trade here.",
    buy: (a, c) => `https://pancakeswap.finance/swap?chain=${c === "ethereum" ? "eth" : c === "bsc" ? "bsc" : c}&outputCurrency=${a}`,
  },
  {
    id: "sushiswap", name: "SushiSwap", kind: "dex", chains: ["ethereum", "base", "robinhood"], site: "https://www.sushi.com", hosts: /(^|\.)sushi\.com$/,
    dex: /^sushi/, words: /\bsushi\s?swap\b|\bsushi\.com\b/i,
    how: "SushiSwap is a multi-chain DEX with v2 constant-product pools (0.3% fee) and v3 concentrated-liquidity pools.",
    buy: (a, c) => `https://www.sushi.com/${c}/swap?token0=NATIVE&token1=${a}`, // link shape unverified
  },
  {
    id: "uniswap", name: "Uniswap", kind: "dex", chains: ["ethereum", "base", "bsc", "robinhood"], site: "https://app.uniswap.org", hosts: /(^|\.)uniswap\.org$/,
    dex: /^uniswap/, words: /\buniswap\b|\buni ?v[234]\b/i,
    how: "Uniswap is the largest EVM DEX. v2 pools are constant-product with a 0.3% fee, v3 pools hold concentrated liquidity in fee tiers, and v4 runs every pool in one contract with optional hooks (custom fees, taxes, launch logic); Clanker, Zora, Pons and pools.trade coins trade in v4 pools. Live on Ethereum, Base, BNB Chain and, since July 2026, Robinhood Chain.",
    buy: (a, c) => `https://app.uniswap.org/swap?chain=${UNI_CHAIN[c] ?? "mainnet"}&outputCurrency=${a}`,
  },
  {
    id: "ramses", name: "Ramses", kind: "dex", chains: ["robinhood"], site: "https://ramses.exchange", hosts: /(^|\.)ramses\.(exchange|xyz)$/,
    dex: /^ramses/, words: /\bramses\b/i,
    // Pool types from GeckoTerminal's ids (ramses-v3, ramses-dlmm, ramses-legacy); site URL and the rest unverified.
    how: "Ramses is a DEX on Robinhood Chain with concentrated-liquidity (v3), DLMM and legacy pools.",
  },
  {
    id: "kyberswap", name: "KyberSwap", kind: "aggregator", chains: ["ethereum", "base", "bsc", "robinhood"], site: "https://kyberswap.com", hosts: /(^|\.)kyberswap\.com$/,
    words: /\bkyber\s?swap\b|\bkyber\b/i,
    how: "KyberSwap is an EVM swap aggregator that routes across hundreds of DEXes on many chains, Robinhood Chain included. In-site buys on Ethereum, Base, BNB Chain and Robinhood Chain go through it.",
    buy: (a, c) => `https://kyberswap.com/swap/${c}/eth-to-${a}`, // link shape unverified
  },
  {
    id: "oneinch", name: "1inch", kind: "aggregator", chains: ["ethereum", "base", "bsc"], site: "https://app.1inch.io", hosts: /(^|\.)1inch\.(io|com)$/,
    words: /\b1inch\b/i,
    how: "1inch is an EVM swap aggregator that splits orders across DEXes, with Fusion mode for gasless, resolver-filled swaps.",
  },
  {
    id: "zerox", name: "0x / Matcha", kind: "aggregator", chains: ["ethereum", "base", "bsc"], site: "https://matcha.xyz", hosts: /(^|\.)(matcha\.xyz|0x\.org)$/,
    words: /\bmatcha(\.xyz)?\b|\b0x (api|protocol|swap)\b/i,
    how: "0x is the swap API behind many wallets and apps; Matcha is its own trading front end. Both aggregate liquidity across DEXes.",
  },

  // ---------- NEAR ----------
  // Launchpad suffixes and pool shapes from neartrade's venue registry and swap parsers, which trade them live.
  {
    id: "nearly", name: "nearly.trade", kind: "launchpad", chains: ["near"], site: "https://nearly.trade", hosts: /(^|\.)nearly\.trade$/,
    suffix: /\.nearlytrade\.near$/, words: /\bnearly\.trade\b|\bnearlytrade\b/i, api: "https://nearly.trade/api/launch/<token>",
    how: "nearly.trade launches each token straight into a Rhea concentrated (DCL) pool as one-sided liquidity against wNEAR, so it trades from the first block with no curve and no graduation. Some launches set a token tax, read from the nearlytrade.near contract.",
    buy: (a) => `https://nearly.trade/t/${a}`,
  },
  {
    id: "memecooking", name: "meme.cooking", kind: "launchpad", chains: ["near"], site: "https://meme.cooking", hosts: /(^|\.)meme\.cooking$/,
    suffix: /\.meme-cooking\.near$/, words: /\bmeme\.?cooking\b/i, curve: true, graduatesTo: "rhea", api: "https://api.meme.cooking/meme",
    // From meme.cooking's own docs (Shitzu-Apes/meme-cooking-docs).
    how: "meme.cooking is a fair-launch auction: for a set countdown people deposit NEAR (withdrawing early costs 2%). If the soft cap is met the token launches, the NEAR and about half the supply go into a Ref/Rhea pool with the LP locked for 69 years, and depositors claim the rest pro rata; otherwise everyone is refunded.",
    buy: (a) => { const id = /-(\d+)\.meme-cooking\.near$/.exec(a)?.[1]; return id ? `https://meme.cooking/meme/${id}` : "https://meme.cooking"; },
  },
  {
    id: "justhoot", name: "JustHoot", kind: "launchpad", chains: ["near"], site: "https://justhoot.fun", hosts: /(^|\.)justhoot\.fun$/,
    suffix: /launchpad\.justhoot\.near$/, words: /\bjust\s?hoot\b/i, api: "https://api.justhoot.fun/api/tokens/<token>",
    how: "JustHoot seeds each launch into a Rhea concentrated (DCL) pool, so the token trades in that pool from its first trade with no curve. Its v2 tokens charge a transfer fee on every move (5% on some launches).",
    buy: (a) => `https://justhoot.fun/p/${a}`,
  },
  {
    id: "rhea-launchpad", name: "Rhea launchpad", kind: "launchpad", chains: ["near"], site: "https://dex.rhea.finance", hosts: /^$/,
    suffix: /\.rhea\.meme-launchpad\.near$/, words: /\brhea launchpad\b/i,
    how: "Rhea's launchpad puts the whole launch supply into a Rhea DCL pool as one-sided liquidity: no curve and no graduation, the token trades in its pool from the first block.",
  },
  {
    id: "intear-launch", name: "Intear launch", kind: "launchpad", chains: ["near"], site: "https://intear.tech", hosts: /^$/,
    suffix: /\.launch(-v2)?\.intear\.near$/,
    // Mechanics unverified: only the suffixes and that the tokens trade on Intear DEX are known.
    how: "Tokens launched from Intear (Intear Wallet's token launcher) trade in Intear DEX pools.",
  },
  {
    id: "intear", name: "Intear", kind: "dex", chains: ["near"], site: "https://intear.tech", hosts: /(^|\.)intear\.tech$/,
    dex: /^intear/, words: /\bintear\b/i, api: "https://prices.intear.tech/tokens",
    how: "Intear runs a NEAR wallet, an on-chain DEX (dex.intear.near, constant-product pools whose swap and withdrawal settle as one batch) and public price and trade indexers.",
  },
  {
    id: "shards", name: "shards.market", kind: "launchpad", chains: ["near"], site: "https://shards.market", hosts: /(^|\.)shards\.market$/,
    suffix: /\.factory\.shardsmarket\.near$/, words: /\bshards\.market\b/i, curve: true, api: "https://api.shards.market/tokens",
    how: "shards.market is a NEAR launchpad where tokens start on a bonding curve.", // graduation details unverified
  },
  {
    id: "grafun", name: "gra.fun", kind: "launchpad", chains: ["near"], site: "https://gra.fun", hosts: /(^|\.)gra\.fun$/,
    suffix: /\.gra-fun\.near$/, words: /\bgra\.fun\b/i, curve: true,
    how: "gra.fun is a NEAR launchpad where tokens start on a bonding curve.", // graduation details unverified
  },
  {
    id: "aidols", name: "AIdols", kind: "launchpad", chains: ["near"], site: "https://aidols.bot", hosts: /(^|\.)aidols\.bot$/,
    suffix: /\.aidols\.near$/, words: /\baidols\b/i, curve: true,
    how: "AIdols launches AI-agent tokens on NEAR on a bonding curve.", // graduation details unverified
  },
  {
    id: "rhea", name: "Rhea", kind: "dex", chains: ["near"], site: "https://dex.rhea.finance", hosts: /(^|\.)(rhea|ref)\.finance$/,
    dex: /^rhea|^ref/, words: /\brhea\b|\bref\.?finance\b/i,
    how: "Rhea Finance (formerly Ref Finance) is NEAR's main DEX: classic constant-product pools and DCL concentrated-liquidity pools, where nearly every launchpad token on NEAR ends up trading.",
  },
];

const BY_ID = new Map(VENUES.map((v) => [v.id, v]));
export const venue = (id: string | null | undefined): Venue | null => (id ? BY_ID.get(id) ?? null : null);

// Chart, explorer and terminal sites: they name a chain and a token or pool, never a venue.
const DATA_HOSTS: Array<[RegExp, Chain | null]> = [
  [/(^|\.)(dexscreener\.com|geckoterminal\.com|birdeye\.so|dextools\.io|gmgn\.ai|defined\.fi|coingecko\.com)$/, null],
  [/(^|\.)(solscan\.io|solana\.fm|axiom\.trade|photon-sol\.tinyastro\.io|bullx\.io)$/, "solana"],
  [/(^|\.)(etherscan\.io|eth\.blockscout\.com)$/, "ethereum"],
  [/(^|\.)(basescan\.org|base\.blockscout\.com)$/, "base"],
  [/(^|\.)bscscan\.com$/, "bsc"],
  [/(^|\.)(nearblocks\.io|pikespeak\.ai|neartrade\.lol)$/, "near"],
  [/(^|\.)(robinhoodchain\.blockscout\.com|rh-scan\.com)$/, "robinhood"],
];

const CHAIN_SLUG: Record<string, Chain> = {
  solana: "solana", sol: "solana", ethereum: "ethereum", eth: "ethereum", ether: "ethereum", mainnet: "ethereum",
  base: "base", "8453": "base", bsc: "bsc", bnb: "bsc", binance: "bsc", "56": "bsc", near: "near", robinhood: "robinhood", hood: "robinhood", "4663": "robinhood",
};

function chainInUrl(u: URL): Chain | null {
  for (const k of ["chain", "network", "chainId"]) {
    const c = CHAIN_SLUG[(u.searchParams.get(k) ?? "").toLowerCase()];
    if (c) return c;
  }
  for (const bit of `${u.pathname}/${u.hash}`.split(/[/#?&=:]+/)) {
    const c = CHAIN_SLUG[bit.toLowerCase()];
    if (c) return c;
  }
  return null;
}

/** A launchpad, DEX, chart or explorer host: a link there is about a token, never the team's own website. */
export function isVenueHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return DATA_HOSTS.some(([re]) => re.test(h)) || VENUES.some((v) => v.hosts.test(h));
}

export interface VenueLink { url: string; venue: string | null; chain: Chain | null; address: string | null }

/** What a link names: the venue, the chain and the token or pool. Null for links that aren't about a token. */
export function readLink(u: URL): VenueLink | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (/\/(tx|txs|txns|transaction)\//i.test(u.pathname)) return null;
  let v: Venue | null = null;
  let chain: Chain | null = null;
  const data = DATA_HOSTS.find(([re]) => re.test(host));
  if (data) chain = data[1];
  else {
    v = VENUES.find((x) => x.hosts.test(host)) ?? null;
    if (!v) return null;
    // A path that names a sub-product: Raydium's launchpad, Jupiter's Studio, pump.fun's swap.
    if (v.id === "raydium" && /^\/launchpad/.test(u.pathname)) v = venue("launchlab");
    if (v?.id === "jupiter" && /^\/studio/.test(u.pathname)) v = venue("jup-studio");
    if (v?.id === "meteora" && /dbc/i.test(u.pathname)) v = venue("meteora-dbc");
    if (v && v.chains.length === 1) chain = v.chains[0];
  }
  const address = addressInUrl(u);
  chain = chain ?? chainInUrl(u);
  const det = address ? detectAddress(address) : null;
  if (det && (!chain || !det.chains.includes(chain))) chain = det.chains.length === 1 ? det.chains[0] : v?.chains.find((c) => det.chains.includes(c)) ?? null;
  // Uniswap and PancakeSwap links leave the chain out on their home chain.
  if (!chain && v?.id === "uniswap") chain = "ethereum";
  if (!chain && v?.id === "pancakeswap") chain = "bsc";
  if (!address && !v) return null;
  return { url: u.href, venue: v?.id ?? null, chain, address };
}

/** Venues a sentence names without a link ("launched on pump.fun", "on uniswap"). Links don't count twice. */
export function venuesNamed(text: string): string[] {
  const plain = text.replace(/\bhttps?:\/\/\S+/g, " ");
  return VENUES.filter((v) => v.words?.test(plain)).map((v) => v.id);
}

/** The words with venue links and "on pump.fun" mentions taken out: where a token trades isn't the look it wants ("like pump.fun" stays). */
export function withoutVenueMentions(text: string): string {
  return text
    .replace(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"')\]]*/gi, (m) => {
      try { return isVenueHost(new URL(/^https?:\/\//i.test(m) ? m : `https://${m}`).hostname) ? " " : m; } catch { return m; }
    })
    .replace(/\b(?:(?:launched|live|listed|trading|trades|minted|deployed|bought)\s+)?(?:on|via|from|at|through)\s+(?:the\s+)?[\w.-]+/gi, (m) => (VENUES.some((v) => v.words?.test(m)) ? " " : m));
}

export interface TokenRead { address: string | null; chains: Chain[]; venue: string | null; link: VenueLink | null }

/** The token a prompt points at, with the chain and venue its link or words imply. */
export function readToken(text: string): TokenRead | null {
  let link: VenueLink | null = null;
  for (const u of urlsIn(text)) {
    const l = readLink(u);
    if (l && (l.address || !link)) link = l;
    if (link?.address) break;
  }
  const address = link?.address ?? findAddress(text);
  const named = venuesNamed(text);
  const det = address ? detectAddress(address) : null;
  // A Solana or NEAR address names its launchpad ("…pump", "*.meme-cooking.near"); an EVM suffix is only a hint once the chain is known.
  const own = address && det?.chains.length === 1 ? launchpadOf(address, det.chains[0]) : null;
  const v = venue(link?.venue ?? named[0]) ?? own;
  if (!address && !v) return null;
  let chains: Chain[] = link?.chain ? [link.chain] : det?.chains ?? [];
  if (!link?.chain && v) {
    const both = chains.length ? chains.filter((c) => v.chains.includes(c)) : v.chains;
    if (both.length) chains = both;
  }
  return { address, chains, venue: v?.id ?? null, link };
}

/** The venue a DexScreener pair (or GeckoTerminal pool) is on. */
export function venueOfDex(dexId: string | null | undefined, labels: string[] = [], chain?: Chain): Venue | null {
  if (!dexId) return null;
  const key = `${dexId} ${labels.join(" ")}`.toLowerCase();
  if (/launch-?lab/.test(key)) return venue("launchlab");
  // GeckoTerminal's pons-v2-dex: Pons tokens after graduation, in Uniswap v4 pools.
  if (/^pons-v2-dex/.test(key)) return venue("uniswap");
  return VENUES.find((v) => v.dex?.test(key.split(" ")[0]) && (!chain || v.chains.includes(chain))) ?? null;
}

/** The launchpad a token's address says it came from (pump.fun's "…pump", NEAR's "*.nearlytrade.near"). */
export function launchpadOf(address: string, chain: Chain): Venue | null {
  return VENUES.find((v) => v.kind === "launchpad" && v.suffix?.test(address) && v.chains.includes(chain)) ?? null;
}

export interface PairLike { dexId: string; labels?: string[]; liquidity?: { usd?: number } }

/**
 * Where a token launched and trades, from its pairs and its address. A curve pair (pump.fun's, Meteora DBC's,
 * four.meme's) and no pool means it is still on the curve; a pool next to a curve launchpad means it graduated.
 */
export function readVenue(chain: Chain, address: string, pairs: PairLike[]): TokenVenue | null {
  const byLiq = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const tagged = byLiq.map((p) => ({ p, v: venueOfDex(p.dexId, p.labels, chain) }));
  const curvePair = tagged.find((t) => t.v?.kind === "launchpad" && t.v.curve);
  const pool = tagged.find((t) => t.v?.kind === "dex") ?? tagged.find((t) => t.v?.kind === "launchpad" && !t.v.curve);
  // A launchpad by its own name wins over the shared curve engine it runs on (a "moon" mint on Meteora DBC is Moonshot).
  const bySuffix = launchpadOf(address, chain);
  const pad = bySuffix ?? curvePair?.v ?? tagged.find((t) => t.v?.kind === "launchpad")?.v ?? null;
  if (!pad && !pool) return null;
  const onCurve = !!curvePair && (!pool || (pool.p.liquidity?.usd ?? 0) < (curvePair.p.liquidity?.usd ?? 0) / 10);
  const stage: TokenVenue["stage"] = pad?.curve ? (onCurve || !pool ? "curve" : "graduated") : pad ? "pool" : null;
  const dex = pool?.v?.kind === "dex" ? pool.v.id : stage === "pool" ? pad?.graduatesTo ?? null : null;
  return { launchpad: pad?.id ?? null, dex: stage === "curve" ? null : dex, stage, progress: null, buyUrl: pad?.buy?.(address, chain) ?? null };
}

/** One line for the build log: "Launched on pump.fun · graduated to PumpSwap". */
export function venueLine(t: { venue?: TokenVenue; dexId?: string | null }): string | null {
  const tv = t.venue;
  const pad = venue(tv?.launchpad);
  const dex = venue(tv?.dex);
  const dexName = dex?.name ?? (t.dexId ? prettyDex(t.dexId) : null);
  if (!pad) return dexName ? `Trades on ${dexName}` : null;
  const pct = tv?.progress != null ? ` (${Math.round(tv.progress * 100)}% of the curve sold)` : "";
  if (tv?.stage === "curve") return `Launched on ${pad.name} · still on the bonding curve${pct}`;
  if (tv?.stage === "graduated") return `Launched on ${pad.name} · graduated to ${dexName ?? venue(pad.graduatesTo)?.name ?? "a pool"}`;
  return `Launched on ${pad.name}${dexName && dexName !== pad.name ? ` · trades on ${dexName}` : ""}`;
}

/** "uniswap" → "Uniswap", "pancakeswap" → "Pancakeswap": a dexId we have no entry for, readable. */
export function prettyDex(id: string): string {
  const v = VENUES.find((x) => x.dex?.test(id.toLowerCase()));
  return v?.name ?? id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** What the writer needs to know about where the token trades, in plain words. */
export function venueBrief(tv: TokenVenue | undefined, named: string[] = []): string | null {
  const ids = [tv?.launchpad, tv?.dex, ...named].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  if (!ids.length) return null;
  const parts = ids.map((id) => venue(id)).filter((v): v is Venue => !!v).map((v) => `${v.name}: ${v.how}`);
  const pad = venue(tv?.launchpad);
  if (pad && tv?.stage === "curve") parts.push(`This token is still on ${pad.name}'s bonding curve${tv.progress != null ? ` (${Math.round(tv.progress * 100)}% sold)` : ""}: buys go into the curve until it graduates${pad.graduatesTo ? ` to ${venue(pad.graduatesTo)?.name}` : ""}.`);
  if (pad && tv?.stage === "graduated") parts.push(`This token has graduated from ${pad.name}'s curve and now trades in a ${venue(tv.dex)?.name ?? venue(pad.graduatesTo)?.name ?? "DEX"} pool.`);
  return parts.join("\n");
}
