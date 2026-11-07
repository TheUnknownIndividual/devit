# devit

An AI website builder for tokens and dApps. You type one sentence, optionally with a contract address, and it builds a working site with live chain data, a wallet button, an in-page swap and buys from any chain through NEAR Intents. You edit it by clicking parts of the preview and leaving comments; only those parts change.

- Live: https://devit.lol (no sign-in needed for a first build)
- Built for NEAR HACKATHON (Nov 1–14 2026). Tracks: Open Innovation, Privacy & Private AI.

## The problem

A new token or dApp needs a website on day one: price, chart, how to buy, socials, and a buy button that works for people holding coins on other chains. Teams either pay a designer, ship a static template with a dead "Buy" link, or use a general AI builder that knows nothing about the chain. devit reads the chain and the team's own posts, writes the site around them, and wires the buying in.

## Try it on the hosted demo

Each step says what to do and what you should see.

1. **Build from one sentence.** On https://devit.lol type
   `A dark degen site for Black Dragon on NEAR blackdragon.tkn.near` and press **Build now**.
   You land in the builder. The step log shows each step as it runs (contract found, DexScreener and the NEAR RPC read, copy written). The preview shows a site with the BLACKDRAGON logo, live price, market cap, chart and recent trades.
2. **Edit by clicking.** With **Select** on, click the headline in the preview and type `Make the headline shorter and louder`, press Enter. Click the buy box and type `make it bigger`.
   Both comments queue above the chat and a numbered pin marks each block. Press **Apply 2**: only those two blocks change. **Undo** in the top bar puts them back.
3. **Buy from another chain (NEAR Intents).** Open the live site (the arrow icon in the top bar), scroll to **Buy** and pick **Any chain**.
   You get a NEAR Intents 1-Click quote for paying with ETH, BTC, USDC or SOL, delivered as the token's chain asset. Entering a receive address and a refund address returns a one-time deposit address. Nothing is sent unless you send to it. **Private buy** routes the same buy through Confidential Intents, so the paying address and the receiving wallet aren't linked on chain.
4. **NEAR wallet and swap.** On the live site press **Connect wallet** and pick a NEAR wallet (HOT, Meteor, Intear). The buy box quotes a Rhea swap from NEAR into the token, signed in your own wallet.
5. **Start from a repo or design.** On the home page press **GitHub** (under the prompt box), open **Import from URL**, paste `github.com/vercel/next.js` and press **Import repository**.
   A "Starting from GitHub" card appears in the prompt box with the repo's description, site and topics, and the next build is written from them. Signed in with GitHub, **Your repositories** lists your own repos instead. **Figma** does the same from a file shared by link.
6. **Pay for a plan with any token (NEAR Intents).** Sign in, open https://devit.lol/pricing and press **Pay with any token** on Pro.
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
  - Any-chain and private buys on every generated site: `src/lib/intents.ts`, `src/app/api/intents`.
  - Plan and credit-pack payments that arrive as USDC on NEAR: `src/lib/billing.ts`, `src/lib/credit-orders.ts`, `src/app/api/billing`.
- **NEAR AI Cloud**: the first-choice model for writing and editing sites (private inference in TEEs), with Claude and OpenAI as fallbacks: `src/lib/llm.ts`. Measured cost per call feeds the credit meter: `src/lib/meter.ts`, `src/lib/credits.ts`.
- **NEAR RPC**: `ft_metadata` and `ft_total_supply` for NEP-141 tokens (`src/lib/chain.ts`). The Treasury block reads account balances, Sputnik DAO v2 policy and proposals (the contracts behind Trezu), and `intents.near` balances (`src/lib/treasury.ts`, `src/blocks/client/treasury.tsx`).
- **NEAR wallets**: HOT, Meteor and Intear through `@hot-labs/near-connect` on generated sites (`src/blocks/client/wallet.ts`). Sign-in to the builder with a NEAR wallet uses a NEP-413 signed message, checked against a full-access key of the account (`src/lib/walletauth.ts`).
- **Rhea**: NEAR swaps in the buy box, quoted through neartrade's public API (see Hackathon notes) and signed in the buyer's NEAR wallet (`src/lib/swap.ts`, `src/lib/venues.ts`).

## Other services

DexScreener (pairs, logos, socials), GeckoTerminal (trades, candles), Jupiter (Solana swaps), KyberSwap (EVM swaps), Relay (EVM cross-chain buys), Helius DAS (Solana metadata and holders, with a key), Blockscout (EVM holders), twitterapi.io (a team's recent X posts), GitHub and Figma (imports, export to GitHub), Cloudflare (tunnel and custom hostnames), Spaceship (domain search).

## Layout

- `src/app`: Next.js pages and API routes (the builder, published sites at `/s/<slug>` or `<slug>.<domain>`, billing, auth).
- `src/lib`: the agent (`agent.ts`, `research.ts`, `llm.ts`), the site spec (`spec.ts`), chain reads, swaps, intents, accounts, credits.
- `src/blocks`: the renderer that turns a site spec into the published page, plus the client parts (wallet, swap, chart, trades).
- `edge/`: an optional Cloudflare Worker that serves published sites on subdomains.

The agent writes a JSON site spec (theme plus ordered blocks with stable ids), not free-form HTML. That is why clicking an element maps to exactly one block and an edit only regenerates the blocks you commented on.

## Hackathon notes

- Timeline: work started on 2026-10-26, after the hackathon announcement on 2026-10-19, which the rules count as inside the window (HACKATHON.md Q-001). Nothing was committed until 2026-11-04, so the first commit holds the work from Oct 26 onward and later commits are day by day. No code was brought in from an earlier project.
- One dependency comes from an earlier project by the same author: NEAR swap quotes in the buy box use the public developer API of neartrade (`dev.neartrade.lol`, routing on Rhea pools). It is called over HTTP like any other service; its code is not in this repo and is not part of this submission.
- Written with AI coding help (Claude Code). Libraries: Next.js 16, React 19, Tailwind CSS 3, zod, `@hot-labs/near-connect`, `@solana/kit`, `@noble/curves` and `@noble/hashes`, `@simplewebauthn`, `@walletconnect/universal-provider`, `@privy-io/react-auth`, `lucide-react`, `simple-icons`, `uqr`, `playwright-core` (style-reference screenshots).
- Swaps and payments were tested with quotes only. devit never holds user funds; buyers sign in their own wallet or send to a 1-Click deposit address.

## License

MIT, see `LICENSE`.
