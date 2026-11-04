# sitesmith

Describe a token or dApp in one sentence and get a working website: live chain data, a wallet button, a buy box, and buys from any chain through NEAR Intents. Edit it by clicking blocks in the preview and leaving comments.

## Run it

```
pnpm install --frozen-lockfile
cp .env.example .env.local   # all keys optional
pnpm dev                     # http://localhost:3100
```

## Try it

1. On the home page, type `A loud degen site for BONK on Solana DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` and press **Build now**.
   You land in the builder. The step log shows each step as it runs: the contract was found, DexScreener and the Solana RPC were read, the copy was written. The preview shows the site with the BONK logo, price, market cap and live trades.
2. With **Select** on, click the headline in the preview. Type `Change the headline to "Bonk goes brrr"` and press Enter. Click the buy button and type `make it bigger`.
   Both comments queue above the chat, and a numbered pin marks the block in the preview.
3. Press **Apply 2**.
   Only those two parts change. **Undo** in the top bar reverts the change.
4. Open the **ExternalLink** icon (Open live), scroll to **Buy**, and pick **Any chain**.
   You get a NEAR Intents quote for paying with ETH, BTC, USDC or NEAR, delivered on Solana. Add your address and a refund address to get a one-time deposit address.
5. Click **Integrations → Privy**, or **Integrations → WalletConnect**.
   A guided setup opens: illustrated steps, a button to the provider's dashboard, and a paste box. The box checks the ID against the provider before you can save it.
6. Click **Publish**, keep the suggested address, and publish.
   The site is served at `/s/<address>`. Edits stay in the builder until you publish again.

## NEAR tech used

- **NEAR Intents (1-Click API):** any-chain buys on every generated site (`src/lib/intents.ts`, `src/app/api/intents`).
- **NEAR AI Cloud:** the first-choice model for writing and editing sites, with Claude as the fallback (`src/lib/llm.ts`).
- **NEAR RPC:** reads `ft_metadata` and `ft_total_supply` for NEAR tokens (`src/lib/chain.ts`).

## Also used

- **DexScreener:** pairs, logos and socials.
- **GeckoTerminal:** recent trades.
- **Jupiter:** Solana quotes.
- **Helius DAS:** Solana metadata and holders, when a key is set.
- **Blockscout:** EVM holder counts.
- **EIP-6963:** wallet discovery for MetaMask and other EVM wallets.
