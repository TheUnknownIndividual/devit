# devit

An AI website builder for tokens and dApps. You type one sentence, optionally with a contract address, and it builds a working site with live chain data, a wallet button, an in-page swap and buys from other chains through NEAR Intents (18 coins on 13 chains, from ETH, SOL, BTC and USDC to SUI and ZEC). You edit it by clicking parts of the preview and leaving comments; only those parts change.

- Live: https://devit.lol (no sign-in needed for a first build)
- Built for NEAR HACKATHON (Nov 1–14 2026). Tracks: Open Innovation, Privacy & Private AI.

## The problem

A new token or dApp needs a website on day one: price, chart, how to buy, socials, and a buy button that works for people holding coins on other chains. Teams either pay a designer, ship a static template with a dead "Buy" link, or use a general AI builder that knows nothing about the chain. devit reads the chain and the team's own posts, writes the site around them, and wires the buying in.

## Try it on the hosted demo

Each step says what to do and what you should see.

1. **Build from one sentence.** On https://devit.lol type
   `A dark degen site for Black Dragon on NEAR blackdragon.tkn.near` and press **Build now**.
   You land in the builder. The step log shows each step as it runs: contract found, DexScreener and the NEAR RPC read, then **Understanding the project** (facts with sources), **Art direction** (archetype, fonts, light or dark, the section plan) and **Designing the site**. While the last step runs, the preview fills in section by section. The finished site is designed around Black Dragon's own artwork and story, with live price, market cap, chart, trades and the buy box mounted where the design placed them. Build the same token again and you get a different design.
2. **Edit by clicking.** With **Select** on, click the headline in the preview and type `Make the headline shorter and louder`, press Enter. Click the buy box and type `make it bigger`.
   Both comments queue above the chat and a numbered pin marks each block. Press **Apply 2**: only those two blocks change. **Undo** in the top bar puts them back.
3. **Buy from another chain (NEAR Intents).** Open the live site (the arrow icon in the top bar), scroll to **Buy** and pick **Other chains**.
   You get a NEAR Intents 1-Click quote for paying with ETH, BTC, USDC or SOL, delivered as the token's chain asset. Entering a receive address and a refund address returns a one-time deposit address. Nothing is sent unless you send to it. **Private buy** routes the same buy through Confidential Intents, so the paying address and the receiving wallet aren't linked on chain.
4. **Buy with ETH from an Ethereum wallet.** On the same live site press **Connect wallet**, pick any Ethereum wallet (MetaMask, Rabby, OKX, Coinbase Wallet, Trust or WalletConnect), and open the **With ETH** tab.
   It picks the coin your wallet holds most of (23 coins on 12 chains: ETH, USDC and USDT on Ethereum, Base, Arbitrum and Optimism, plus POL, AVAX, BERA, MON, OKB, XPL and stablecoins on Polygon, Avalanche, Berachain, Monad, Robinhood Chain, Scroll, X Layer and Plasma) and shows its balance; type an amount in the coin or switch to USD, and the quote shows how many tokens you get. **Buy** sends one transaction from your wallet: NEAR Intents bridges it and the token lands in your own 0x account on NEAR (the same address, NEP-518), so no NEAR wallet is created. **Sell** runs the other way, signed by the same wallet on NEAR's chain 397. Tokens NEAR Intents doesn't list are bridged as wNEAR and swapped on NEAR through neartrade's router.
5. **NEAR wallet and swap.** On the live site press **Connect wallet** and pick a NEAR wallet (HOT, Meteor, Intear). The buy box quotes a Rhea swap from NEAR into the token, signed in your own wallet.
6. **Start from a repo or design.** On the home page press **GitHub** (under the prompt box), open **Import from URL**, paste `github.com/vercel/next.js` and press **Import repository**.
   A "Starting from GitHub" card appears in the prompt box with the repo's description, site and topics, and the next build is written from them. Signed in with GitHub, **Your repositories** lists your own repos instead. **Figma** does the same from a file shared by link.
6. **Pay for a plan in crypto (NEAR Intents).** Sign in, open https://devit.lol/pricing and press **Pay with crypto** on Pro.
   You pick the coin and chain you pay from and get a 1-Click deposit address. The payment arrives as USDC on NEAR, and the plan turns on when 1-Click reports it delivered. No card, no custody.
7. **See the metering.** Open **Settings** while signed in.
   You see AI credits left, when they come back, and any packs bought. 1 credit is $0.01 of measured model cost, so heavy use can't cost more than the plan brings in.
8. **Security checks.** Open https://devit.lol/security.
   Each check runs against the live server when the page loads, each with pass or fail: secrets sealed with AES-256-GCM, no secret in the browser bundle or the build image, logs that can't leak keys, keys pasted in chat never reaching the model, a site with a secret in it refused at publish, key rotation without downtime.
9. **Publish.** In the builder press **Publish**, keep the suggested name, and publish.
   The site is served at `https://<name>.devit.lol`, with its own `/llms.txt` and `/sitemap.xml`. **Custom domain** in the publish dialog connects your own domain.

## Run it locally

Node 22 and pnpm 10.

```
pnpm install --frozen-lockfile
cp .env.example .env.local   # every key is optional
pnpm dev                     # http://localhost:3100
```

With no model key, an offline writer and editor build and edit sites from templates, so steps 1, 2, 3 and 9 work without any account or key. Add `NEAR_AI_API_KEY` (https://cloud.near.ai) to have NEAR AI Cloud write the sites. Data is kept as JSON files under `data/`.

`pnpm typecheck` runs the type check. `node scripts/smoke.mjs http://localhost:3100` checks that the main pages load and fit a 390 px phone screen.

## NEAR tech used

- **NEAR Intents 1-Click API**
  - Cross-chain and private buys on every generated site (18 coins on 13 chains): `src/lib/intents.ts`, `src/app/api/intents`.
  - Plan and credit-pack payments that arrive as USDC on NEAR: `src/lib/billing.ts`, `src/lib/credit-orders.ts`, `src/app/api/billing`.
- **NEAR AI Cloud**: the first-choice model for writing and editing sites (private inference in TEEs), with Claude and OpenAI as fallbacks: `src/lib/llm.ts`. Measured cost per call feeds the credit meter: `src/lib/meter.ts`, `src/lib/credits.ts`.
- **NEAR RPC**: `ft_metadata` and `ft_total_supply` for NEP-141 tokens (`src/lib/chain.ts`).
- **NEAR Business (Trezu)**: the Treasury block reads a project's Sputnik DAO v2 treasury straight from the contracts NEAR Business runs on: balances, staked NEAR, `intents.near` balances, council, approval threshold and the latest proposals. Each proposal, the council and the dashboard link to that DAO's own NEAR Business pages (`src/lib/treasury.ts`, `src/blocks/client/treasury.tsx`). Try it: build with `A clean site for the Trezu demo DAO, show its treasury trezu-demo.sputnik-dao.near` and ask for a Treasury section.
- **Ethereum wallets on NEAR (NEP-518)**: the With ETH tab keeps a buyer's tokens in their 0x account on NEAR and signs NEAR actions from MetaMask on chain 397 through NEAR's public relayer, with the wallet contract's ABI encoded by hand (`src/lib/ethnear.ts`, `src/lib/xbuy.ts`, `src/blocks/client/xbuy.tsx`). NEAR's relayer pays the gas; the only NEAR the account needs is the 1-yocto and storage deposits token calls attach, so a sponsor wallet fronts 0.005 NEAR and the same trade pays it back, as a wNEAR transfer inside the swap or a 1-Click app fee on a direct sell (`src/lib/nearsponsor.ts`, off unless `SPONSOR_NEAR_ACCOUNT`/`SPONSOR_NEAR_KEY` are set).
- **NEAR wallets**: HOT, Meteor and Intear through `@hot-labs/near-connect` on generated sites (`src/blocks/client/wallet.ts`). Sign-in to the builder with a NEAR wallet uses a NEP-413 signed message, checked against a full-access key of the account (`src/lib/walletauth.ts`).
- **Rhea**: NEAR swaps in the buy box, quoted through neartrade's public API (see Hackathon notes) and signed in the buyer's NEAR wallet (`src/lib/swap.ts`, `src/lib/venues.ts`).

## Other services

- **Helius**: Solana RPC and DAS (`getAsset`) for token names, logos and holders whenever `HELIUS_API_KEY` is set (it is on the hosted demo), or a project owner's own Helius key from Settings (`src/lib/chain.ts`).
- **Alchemy**: Ethereum, Base and BNB Chain reads, plus token logos from `alchemy_getTokenMetadata`, when `ALCHEMY_API_KEY` or an owner's own Alchemy key is set; public RPCs otherwise (`src/lib/chain.ts`).
- **Wallets**: Phantom, Solflare and Backpack (Wallet Standard), MetaMask, Rabby and Coinbase Wallet (EIP-6963), WalletConnect, Privy.
- **Farcaster**: Farcaster profiles show in a site's socials, and share buttons open a cast next to the X post.

DexScreener (pairs, logos, socials), GeckoTerminal (trades, candles), Jupiter (Solana swaps), KyberSwap (EVM swaps), Relay (EVM cross-chain buys), Blockscout (EVM holders), twitterapi.io (a team's recent X posts), GitHub and Figma (imports, export to GitHub), Cloudflare (tunnel and custom hostnames), Spaceship (domain search).

## Layout

- `src/app`: Next.js pages and API routes (the builder, published sites at `/s/<slug>` or `<slug>.<domain>`, billing, auth).
- `src/lib`: the agent (`agent.ts`, `research.ts`, `llm.ts`), the site spec (`spec.ts`), chain reads, swaps, intents, accounts, credits.
- `src/blocks`: the renderer that turns a site spec into the published page, plus the client parts (wallet, swap, chart, trades).
- `edge/`: an optional Cloudflare Worker that serves published sites on subdomains.

### How a site is designed (no templates)

Every site is designed for its own project and written as code. A build runs five stages, each shown live in the step log:

1. **Derive.** Chain data, the token's launchpad and DexScreener metadata, its website, its X profile and posts, and the user's sentence. The artwork's colours are measured from the logo and banner pixels by k-means clustering (`src/lib/palette.ts`).
2. **Understand** (`src/lib/design/brief.ts`, `understand`). A model looks at the logo, banner and post pictures and reads everything found. It writes a dossier: what the project is, its story, the subject in its artwork, its voice and catchphrases, each fact it may state with its source, what content really exists (roadmap, tokenomics, team, milestones), and which sections that content can carry.
3. **Direct** (`direct`). An art director turns the dossier into a concept and a section plan:
   - an archetype (a seeded pick from 20, never repeating the recent sites);
   - a palette built from the artwork's own colours, contrast-checked to 7:1;
   - a font pairing from 50 curated Google Fonts pairs (`src/lib/design/fonts.ts`);
   - a hero idea, one signature element and one motion moment;
   - sections planned only from content that exists;
   - inspiration from the team's reference library (`src/lib/design/inspiration.ts`, screenshots in `design-refs/`). 28 sites we collected (token sites such as 5-star.fun, thehunt.dev, hundonpump.com and oakagentkit.org, plus product craft from Agora, Alchemy, Infinex, Musebook, hmmmm, Phantom, Relay and others), each studied for how its first screen is composed and what makes it work. Three that suit the project (by archetype, mood and light/dark, never the same ones as the last builds) are shown to the director with their screenshots. The brief names which ones it draws on and the exact principle it borrows. Words, pictures, logos and markup are never copied.
4. **Create** (`src/lib/design/codegen.ts`). The code writer writes the whole site in HTML and CSS, seeing the brief and the screenshots of the references the director chose. It streams, and each section is saved the moment it closes, so the preview fills in section by section, in the same way bolt.new streams files. Live parts (buy box, chart, trades, stats, contract address, wallet, signup) are our own React widgets. The writer places them with `data-ss-widget` slots, and they take on the site's design tokens.
5. **Review** (`src/lib/design/review.ts`). The finished page is rendered in headless Chromium at 1280 and 390 px wide and measured for the faults a person spots at once: anything wider than the screen, art or shapes spilling out of their section, a background shape not centred on the picture it frames, split columns not sharing a centre, side-by-side panels of different heights, big empty bands, cut-off text, tiny text, a hero that doesn't fit the first screen. The measurements and the screenshots go back to the model as one review, and it fixes them in the site's own CSS and HTML. The page is measured again, and a fix that measures worse is discarded.

Everything the model writes passes a sanitiser on save and again on render (`src/lib/sanitize.ts`). It removes scripts, event handlers, frames, forms and `javascript:` links, allows images only from the token's own sources, and strips imports and foreign `url()`s from CSS. Each section keeps `data-block-id` and `data-el`, so clicking an element still maps to exactly one section. A comment rewrites only that section (`src/lib/design/edit.ts`), a whole-page request in chat can change the stylesheet, and double-clicking text edits it in place. If any stage fails, the build falls back to the block renderer: a JSON spec of themed blocks with stable ids.

The design rules (`src/lib/design/principles.ts`) are devit's own, informed by Anthropic's Apache-2.0 frontend-design skill.

## Hackathon notes

- Timeline: work started on 2026-10-26, after the hackathon announcement on 2026-10-19, which the rules count as inside the window (HACKATHON.md Q-001). Nothing was committed until 2026-11-04, so the first commit holds the work from Oct 26 onward and later commits are day by day. No code was brought in from an earlier project.
- One dependency comes from an earlier project by the same author: NEAR swap quotes in the buy box use the public developer API of neartrade (`dev.neartrade.lol`, routing on Rhea pools). It is called over HTTP like any other service; its code is not in this repo and is not part of this submission.
- Written with AI coding help (Claude Code). Libraries: Next.js 16, React 19, Tailwind CSS 3, zod, `@hot-labs/near-connect`, `@solana/kit`, `@noble/curves` and `@noble/hashes`, `@simplewebauthn`, `@walletconnect/universal-provider`, `@privy-io/react-auth`, `lucide-react`, `simple-icons`, `glimm` (the WebGL sweep from the home page into the builder), `uqr`, `playwright-core` (style-reference screenshots), `sanitize-html` (generated-site sanitiser).
- Swaps and payments were tested with quotes only. devit never holds user funds; buyers sign in their own wallet or send to a 1-Click deposit address.

## License

MIT, see `LICENSE`.
