# UI study: DeFi apps and design references

Measured on 2026-11-05 with `node scripts/ui-study.mjs <urls…>`. The script loads each page headless, reads computed styles, hovers and presses the main buttons without clicking them, scrolls the page, and on swap apps types an amount and opens the token picker and settings (then Escape; nothing is ever confirmed). Screenshots and raw numbers land in `data/ui-study/<host>/` (gitignored).

Use this as the menu when a site, the builder or a block needs to "feel like" a product. Numbers are what the sites actually ship, not guesses.

## Patterns worth copying

| Pattern | Who does it | How it's built |
|---|---|---|
| Press feedback | Uniswap, Matcha (`scale .98`), Jupiter (`.983`), Phantom (hover `.985`) | `transform: scale()` on `:active`, 80–150 ms. Never more than 3% |
| Fast hovers | Uniswap 80–100 ms, Jupiter 150 ms | Colour and background only, `cubic-bezier(.17,.67,.45,1)` |
| Slow, soft hovers on marketing pages | Phantom 400 ms, Relay 250 ms linear | Background fade plus a tiny scale |
| Swap card | Uniswap, Jupiter, Matcha | ~480 px column. Two stacked panels ("Sell" / "Buy") with the flip arrow overlapping the seam. 36 px amount. USD value under it updates on every keystroke. CTA stays dim until there's a valid amount |
| Amount presets | Relay (Buy: $100 / $300 / $1,000), Matcha limit (Market / −2% / −5% / −10%) | Chips under the amount; one tap fills the field |
| Big centred amount | Relay Buy tab | "$215" at hero size, conversion line under it |
| Token picker | Uniswap | 400 px modal. Search first, then chips for popular tokens, then grouped sections, then a ranked list with category tags. Escape closes |
| Settings with RPC latency | Jupiter | Blurred modal, tabs General / Spot / Portfolio, an RPC endpoint list with **live ms per endpoint, coloured by speed**. Copy this for our RPC settings |
| Token header strip | Matcha | Market cap · 24h volume · Holders · Age, then the chart with 1H…All timeframe pills and a Price/MCap toggle |
| Auto-advancing tabs | Across (`integrator-tab-progress 6s linear`) | The active tab has a progress bar that fills, then moves to the next tab. Pauses on hover |
| Template gallery | AlignUI | Category chips with icons. One big browser-frame preview with title and description in the bar. Crossfade `0.6s cubic-bezier(.6,.6,0,1)`, bottom fade, floating "Explore template" button |
| Skeletons | Uniswap Explore | Shimmer (`myc-shimmer`) on 12 px-radius rows |
| Stats tiles | Jumper (65 chains / 37 bridges / 46 DEXs) | Big number, small label, a glow behind the main card |
| Trusted-by row | Relay | Greyscale logos under the hero |
| Floating orbs | Uniswap landing | Blurred token images drifting (GSAP/three). Our `fx.bg = "orbs"` is the cheap CSS version |
| Marquee | Across (52 s loop) | Our `fx.ticker` |
| Sticky header that tightens | Across, AlignUI | Our `fx.nav` + MotionFx |

## Easing curves seen

- `cubic-bezier(.17,.67,.45,1)`: Uniswap UI, quick and neutral.
- `cubic-bezier(.34,1.56,.64,1)`: Uniswap landing spring, a slight overshoot. This is our `--ease-spring`.
- `cubic-bezier(.19,1,.22,1)`: Uniswap `landing-rise-in` 1 s and Family, a long soft landing.
- `cubic-bezier(.22,1,.36,1)`: Jupiter and Phantom, ease-out quint.
- `cubic-bezier(.23,1,.32,1)`: Matcha.
- `cubic-bezier(.76,0,.24,1)` / `(.7,0,0,1)`: kargul, in-out for page-level moves.
- `cubic-bezier(.6,.6,0,1)`: AlignUI template crossfade.

## Site by site

**Uniswap** (app.uniswap.org)
- Type: Basel at weights 485 and 535.
- Colours: background #131313, surface #1F1F1F, accent #FF37C7 (hover #E500A5), soft accent fill rgba(255,55,199,.08).
- Swap page: the swap card, the token picker and a settings popover.
- Explore page: tables, 12 px radius, shimmer skeletons.

**Relay** (relay.link)
- Light theme with a Chivo italic uppercase headline.
- Purple #4615C8 (hover #3B00B4), 12 px buttons.
- Tabs Swap / Bridge / Buy; Buy is the big-amount-plus-presets layout.

**Jupiter** (jup.ag)
- Sidebar app shell with a ticker bar across the top.
- One card with tabs Market / Limit / DCA.
- Lime CTA (~#C7F284).
- Settings modal as described in the table above.

**Matcha** (matcha.xyz)
- Token page: header strip, chart and swap side by side.
- Pills at radius 26.

**Across** (app.across.to)
- Type: serif ivypresto display at weight 300, Barlow body, uppercase nav.
- Mint #6CF9D8 CTA, radius 24 cards.
- Reveals are 0.5 s opacity plus transform; the title shimmer runs on a 7 s loop.

**Jumper** (jumper.exchange)
- Sidebar layout, purple #653CA2 pill buttons.
- Stats tiles, with a glow behind the widget.

**CoW Swap** (swap.cow.fi)
- Asymmetric pill radii (21 / 6).
- Floating elements on a 3.5 s loop.

**Phantom** (phantom.com)
- Lavender #E2DFFE / #AB9FF2, 32 px radii.
- Hero inside a rounded dark media card.

**Family** (family.co)
- Illustrated mascots.
- 68 px headline at −1.36 tracking.
- Black and cream pill buttons.

**Rainbow** (rainbow.me)
- Phone mockup hero, 44 px bold headline.
- Section nav list on the right.

**NEAR Intents** (app.near-intents.org)
- Swap card in the Uniswap mould, with a "from any chain" selector.

**AlignUI Pro** (pro.alignui.com)
- Type: Inter Var, 72 px headline at weight 550 and −2.16 tracking.
- Layered soft shadows, a floating pill nav, dashed dividers and ruler-style grid lines.
- Template section as described in the table above.

**Other references**
- **bentogrids:** dark gallery cards with backdrop blur, a count badge and filter tabs.
- **grainient:** Framer, Lenis smooth scroll and shader gradients; lime #C2F13C.
- **kargul swipe-file:** Geist, 24 px cards, a segmented filter pill.
- **mobbin:** a variable font at 80 px, slot-in hero text (`hero-slot-in`), 30% radii.
- **bolt.new:** Schibsted Grotesk, a blue glow behind the prompt box, intent chips (Website / Slides / App) and "or start from Figma / GitHub".

## What we've taken so far

- **"Start from a style"** (`components/landing/StyleShowcase.tsx`) follows the AlignUI frame and Across' auto-advance:
  - It shows the real sample site per style from `/styles/<id>` (`lib/showcase.ts`).
  - The token is a demo, so the price drifts, trades roll in and the chart draws itself, with no network.
  - Hovering the frame slowly scrolls the site.

## Next candidates

1. **Buy box presets:** amount chips (0.1 / 0.5 / 1 SOL; $100 / $300 on the Any chain tab).
2. **Buy box layout:** a flip-arrow two-panel layout, and a live USD value under the amount.
3. **RPC latency in builder settings:** ping each endpoint and colour the ms, as Jupiter does.
4. **Chart timeframes:** 1H / 1D / 1W / All pills and a Price/MCap toggle on the chart block.
5. **Skeleton shimmer:** use it instead of "—" while live data loads.
