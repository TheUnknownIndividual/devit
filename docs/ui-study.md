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

## bolt.new and lovable: what they have that we don't (2026-11-05)

Crawled with `scripts/ui-study.mjs`: bolt.new home, pricing and its editor (it renders view-only without a login); lovable.dev pricing, templates and login (its home page answers 403 to headless browsers). Signed-in pages (project list, project settings, the full editor) need an account on each site, which I can't make, so this list stops at what's public plus the editor bolt shows view-only.

What we already match: chat beside a live preview with device sizes, undo, publish with custom domains and private links, teams and roles, your own model keys and a model picker, GitHub export and zip download (new today), style starters with real sample sites.

Gaps, most useful first:

1. **Plan mode** (bolt, the "Plan" toggle in the prompt box): the agent answers with an outline first and builds after you say go. For us: sections, style and token data as a checklist before the first build.
2. **Code view** (bolt's Preview / `</>` switch): read the generated code in the builder. For us: the site's spec and block files, the same ones the export ships.
3. **Version history with restore** (both): every change as a named point you can return to. We keep `history` but only offer one-step undo.
4. **Direct text edits** (lovable "visual edits"): click a heading in the preview and type, no model call. Our select-and-comment always goes through the agent.
5. **Templates gallery page** (lovable: 228, filtered by Apps, Websites and so on, each with "Use template"): we have 8 styles on the landing page only. A `/templates` page with chips and a remix button.
6. **Start from somewhere** (bolt: "or start from Figma, GitHub, Team template"): import a repo or a design. Our closest is pasting a contract address and reference URLs.
7. **Project type chooser under the prompt** (bolt: Website, Slides, App, Prototype): our kind (memecoin, dApp, NFT) is only read from the sentence.
8. **Voice input** (bolt's mic in the prompt box).
9. **Chat-only mode** (lovable): ask about the site without changing it.
10. **Project knowledge** (lovable): standing instructions the agent reads on every change (tone, banned words, links).
11. **Pricing details** (lovable): monthly/yearly toggle with "2 months free", a credits picker per plan, credit rollover and top-ups.
12. **View-only shares with a clear banner** (bolt: "You have view-only access to this project"): we have view-only access for team viewers; a public share link of the builder itself is missing.
13. **Site analytics and SEO settings** for published sites (lovable): visits, title, description, social image.

## Style references, second round (2026-11-07)

Captured with `node scripts/ui-study.mjs` (desk, full-page and phone screenshots plus computed styles in `data/ui-study/<host>/`). The problem being solved: all eight starter styles opened on the same skeleton (bar nav, headline left with a logo box right, four stat cards) and only changed colour and font. Each reference below is studied for its **composition**, not its paint, and each became either a new style or the shape of an existing one. Nothing is copied but measured traits: no text, art, logos or exact headlines.

alpharhc.xyz could not be studied: the deployment answers 402 "temporarily paused" and has no archive snapshot.

### Agora (agoradex.app): professional with FOMO. Style `launchpad`
- Near-black page, Inter 500/600 at 11–15 px for almost everything, JetBrains Mono for small numbers. Radii 10/12/16 px, pill chips (999 px). Muted text #9A9BA1, green #34C77B for gains, a blue primary button.
- Top bar: icon links, a search box with a `/` key hint, launch and currency buttons. Under it a row of filter chips with counts.
- The hero is a **featured-token banner**: a large rounded card with a purple/blue gradient, the token logo and big name, a verified badge, and a stats panel with small caps labels (MARKET CAP, 24H VOLUME, 24H CHANGE, TRADES 24H). Thumbnails and dots to page through featured tokens.
- A right rail with a ranked list (rank, logo, name, market cap, change). Then trending cards with sparklines, new-launch tiles where the picture fills the card and an "x minutes ago" pill sits on top, and a status bar at the bottom (block, price).
- Easing `cubic-bezier(.4,0,.2,1)` and `(.2,.8,.3,1)`. Card shadow `rgba(255,255,255,.12) 0 1px 0 inset, rgba(0,0,0,.35) 0 10px 30px`.
- **What makes it feel professional and FOMO at once:** calm type and tight spacing, but every number on screen is live and small caps labels make it read like a terminal.

### Alchemy (alchemy.com): corporate DeFi. Style `platform`
- White page, Neue Montreal (licensed; Inter Tight is the free match) with headlines at **weight 400**, 16 px body. Text #020617, slate #64748B, hairlines #E2E8F0, blue #363FF9. Radii 8/12/16 px.
- An announcement bar above the nav. A pale lavender wash behind the hero.
- Headline left; on the right a **product screen** (a dashboard with floating stat cards). Small blue button plus a "Talk to sales >" text link.
- A logo wall in a thin-bordered 5-column grid. A **stats strip**: big light blue numbers ($1T+, 500M+, 99.99%) separated by vertical hairlines, no boxes.
- Section titles centred with a subtitle and two buttons; **two-tone titles** (the second half in grey). Bento grid of feature cards each with a small UI drawing and a "→" title link. Testimonials in an offset wall, case-study image cards.

### Infinex (infinex.xyz): DeFi as a consumer app. Style `exchange`
- Pure black. InterVariable 600, h1 48 px in **two short sentences on two lines**. Orange #FE6F39 pill buttons. Surfaces #101114 / #1C1E21 / #23252A, text #ECEEF1, muted #B0B4BA. Radii 20/24/40 px.
- A **floating capsule nav**: links inside a rounded pill in the middle, logo left, "Log in" (dark pill) and the orange pill right.
- The hero's right side is the **app itself**, a phone and a desktop window bleeding off the right edge. Under the buttons: platform row (Web, Extension, App soon) and a "secured by" trust line. A roadmap teaser card with a chevron; a bouncing scroll cue.

### Oak (oakagentkit.org): meme-ish, illustrated. Style `forest`
- Deep forest #0A392F / #062F27, cream text #F0F7EA, muted #C5D6C7. Amber #E2AA5B for eyebrows, each with a short rule ("—— What Oak does"). Lime #C3F56B pill buttons.
- Manrope 450 for body, Charter-like serif for section titles (~40 px). Source Serif 4 is the free match.
- **Full-bleed illustrated hero** (a 3D diorama) with a **giant chunky orange title** carrying a stacked text-shadow, set over the bottom-left of the picture.
- Small "Get Oak ↗" outline pill, an install code block, a numbered three-column row (01/02/03) with hairlines, long editorial sections, translucent cream panels (rgba(240,247,234,.035–.1)), radii 6/12/16, a blurred floating nav bar.

### Musebook (musebook.me) and hmmmm (hmmmm.fun): warm meme. Style `storybook`
- Musebook: cream paper #FFFDF8 with peach and sand tints (#FAE7DD, #F3E4CD), text #2B2B2B / #4D463B, terracotta #A55630. A custom serif at ~58 px 600 with **the last word of the headline in terracotta**; Source Sans 3 body. Small tracked uppercase terracotta eyebrow. Floating pill nav with a soft shadow. Live counter chips ("74 muses in town"), a progress bar while things load. A peach-tinted contract card with Copy and "Check it on the explorer ↗". The hero picture sits in a rounded frame with a **tilted, taped paper caption** and live activity cards laid over it. Warm shadows rgba(60,40,20,.1). Radii 14/18/999.
- hmmmm: cream #FBF3E4, navy text #1E2433, green #3BB54A. Fraunces 900 display (96 px, tracking −2.4 px), Inter body, JetBrains Mono labels. A pill eyebrow badge. Pill buttons, 24 px radius everywhere. The hero picture in an **organic blob mask** (`border-radius: 42% 58% 46% 54% / 48% 44% 56% 52%`) with tilted sticker labels. A big round "should I?" button section, a dark navy band with a two-row picture marquee, a live activity ticker in mono, a dashed "buy it the easy way" card, the chart in a white rounded card. Keyframes float-up, bob, ticker, spin-slow.

### What changed in the renderer
- **Hero compositions** (`HERO_LAYOUTS` in `src/lib/spec.ts`, built in `src/blocks/Site.tsx`): `split`, `center`, `banner` (Agora), `poster` (Oak), `product` with a window or phone mock (Alchemy, Infinex), `collage` (Musebook, hmmmm), `mascot`, `window`, `stack`, `dash`. Each style's default is `HERO_OF` in `src/lib/themes.ts`; restyling a site moves its hero to the new style's composition, and edit words ("poster", "mockup", "stickers", "banner") pick one directly.
- **Navigation frame** (`fx.frame`): `bar` or a floating `float` capsule.
- **Stats row** (`fx.stats`): `cards`, `strip` (Alchemy's divided big numbers), `chips` (Musebook's counters), `panel` (one bordered row with small caps labels).
- **Section titles** (`fx.titles`): `plain`, `eyebrow` (accent label with a rule), `number` (01, 02…), `split` (second half muted).
- **Background** `wash` (a pale accent gradient, Alchemy).

| Style | Hero | Nav | Stats | Titles |
|---|---|---|---|---|
| degen | mascot | bar + ticker | strip | plain |
| clean | split | bar | cards | eyebrow |
| retro | window | bar + ticker | chips (square) | plain |
| cozy | collage | bar | chips | plain |
| terminal | dash | bar + ticker | panel | plain |
| app | center xl | float | chips | plain |
| brutal | stack | bar + ticker | panel | number |
| glass | center | bar | panel (glass) | plain |
| launchpad | banner | bar + ticker | cards | plain |
| platform | product (window) | bar | strip | split |
| exchange | product (phone) | float | cards | plain |
| storybook | collage | float | chips | eyebrow |
| forest | poster | float | strip | number |
