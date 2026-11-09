// The motion kit every generated-code site gets, whatever the model wrote. Models vary a lot in how much motion they
// write (one site came out with none at all), so the floor is ours: scroll reveals, word-by-word headlines, hover
// response on everything clickable, live numbers that count and flash, and a pulse when the token really trades.
//
// Rules of the kit:
//  - Live view only. The builder's preview and the reviewer's screenshots show the finished state.
//  - Entrances and hover use the individual `translate`/`scale` properties, so they compose with the model's `transform`.
//  - The hover floor sits in :where() (zero specificity), so any hover the model wrote wins.
//  - prefers-reduced-motion turns all of it off (SITE_CSS also stops every animation and transition).

/** Which entrance a site's archetype gets. "rise" is the default. */
export type MotionPreset = "rise" | "type" | "slam" | "wipe" | "float";

const PRESET: Record<string, MotionPreset> = {
  "terminal-shell": "type", "trading-desk": "type", "space-mission": "type", "game-hud": "type", "broadcast-news": "type",
  "poster-wall": "slam", "arcade-cabinet": "slam", "comic-panel": "slam", "street-sticker": "slam", "zine-collage": "slam", "wanted-poster": "slam", "trading-card": "slam",
  "editorial-magazine": "wipe", "newspaper-front": "wipe", "swiss-grid": "wipe", "museum-placard": "wipe", "luxury-house": "wipe",
  storybook: "float", "field-guide": "float",
};

export const motionOf = (archetype: string | undefined): MotionPreset => PRESET[archetype ?? ""] ?? "rise";

const L = ".ss-code[data-ss-mode=live]";
// Crisp, not slimy (owner feedback 2026-11-09): short moves, short durations, a fast start that settles without
// overshoot or wobble, staggers capped so nothing trails in for seconds. Entrances use the individual translate/scale
// properties, never transform, so they compose with whatever transform the model's CSS gives the same element
// (a rotated card stays rotated) instead of fighting it and snapping at the end.
const EASE = "cubic-bezier(.2,.7,.2,1)";
const STAGGER = (ms: number) => `calc(min(var(--i,0),4)*${ms}ms)`;

export const MOTION_CSS = [
  // Reveal: hidden until scrolled to, then in. Stagger with style="--i:N" (capped at 4 steps).
  `${L} [data-ss-reveal]{opacity:0;translate:0 12px;transition:opacity .45s ease-out,translate .5s ${EASE},scale .5s ${EASE},clip-path .55s ${EASE};transition-delay:${STAGGER(50)}}`,
  // Explicit variants the model can ask for.
  `${L} [data-ss-reveal=mask]{opacity:1;translate:none;clip-path:inset(0 0 100% 0)}`,
  `${L} [data-ss-reveal=scale]{translate:none;scale:.97}`,
  `${L} [data-ss-reveal=left]{translate:-20px 0}`,
  `${L} [data-ss-reveal=right]{translate:20px 0}`,
  // The archetype's own entrance for plain reveals.
  `${L}[data-ss-motion=type] [data-ss-reveal=""]{opacity:1;translate:none;clip-path:inset(0 100% 0 0);transition:clip-path .42s steps(14,end);transition-delay:${STAGGER(60)}}`,
  `${L}[data-ss-motion=slam] [data-ss-reveal=""]{translate:none;scale:1.04;transition:opacity .2s ease-out,scale .32s cubic-bezier(.2,.9,.3,1);transition-delay:${STAGGER(45)}}`,
  `${L}[data-ss-motion=wipe] [data-ss-reveal=""]{opacity:1;translate:none;clip-path:inset(0 0 100% 0);transition:clip-path .6s ${EASE};transition-delay:${STAGGER(60)}}`,
  `${L}[data-ss-motion=float] [data-ss-reveal=""]{translate:0 20px;transition:opacity .6s ease-out,translate .7s ${EASE};transition-delay:${STAGGER(70)}}`,
  // Shown: after every variant and preset so it always wins.
  `${L} [data-ss-reveal].is-in{opacity:1;translate:none;scale:none;clip-path:inset(0 0 0 0)}`,

  // The hero headline word by word: each word slides up from behind its own mask, quickly.
  `${L} .ss-w{display:inline-block;overflow:clip;vertical-align:top;padding-bottom:.12em;margin-bottom:-.12em}`,
  `${L} .ss-w>span{display:inline-block;translate:0 105%;transition:translate .55s ${EASE};transition-delay:calc(min(var(--w,0),8)*28ms)}`,
  `${L}[data-ss-motion=slam] .ss-w>span{translate:0 105%;transition:translate .38s cubic-bezier(.2,.9,.3,1);transition-delay:calc(min(var(--w,0),8)*40ms)}`,
  `${L}[data-ss-motion=type] .ss-w>span{transition:translate .01s steps(1);transition-delay:calc(min(var(--w,0),10)*55ms)}`,
  `${L} [data-ss-split].is-in .ss-w>span{translate:none}`,
  // Until the kit is ready the h1 (the hero headline) waits, so it never shows, vanishes and slides back in (never more than 1.2s, in case scripts don't run).
  `${L}:not([data-ss-ready]) .ss-code-body>section h1{opacity:0;animation:ssShow 0s 1.2s forwards}`,
  `@keyframes ssShow{to{opacity:1}}`,

  // Hover floor: everything clickable answers the pointer, briefly and by a pixel. Zero specificity, so the model's own
  // hover wins. Cards don't float up on hover (that reads as slime): their border takes the accent instead.
  `:where(${L}) :where(a[href],button):not(:where([data-ss-widget] *)){transition:translate .15s ease-out,scale .15s ease-out,color .15s,background-color .15s,border-color .15s,opacity .15s}`,
  `:where(${L}) :where(a[href],button):not(:where([data-ss-widget] *)):hover{translate:0 -1px}`,
  `:where(${L}) :where(a[href],button):not(:where([data-ss-widget] *)):active{translate:0 0;scale:.98}`,
  `:where(${L}) :where(article,[data-ss-card]){transition:border-color .2s,box-shadow .2s}`,
  `:where(${L}) :where(article,[data-ss-card]):hover{border-color:color-mix(in oklab,var(--accent) 70%,transparent)}`,
  // Pointer tilt for hero art (the kit sets --rx/--ry, at most 6deg); don't combine with data-ss-reveal on the same element.
  `${L} [data-ss-tilt]{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s ${EASE};will-change:transform}`,
  // Parallax: the kit sets translate from scroll position.
  `${L} [data-ss-parallax]{will-change:translate}`,

  // Live numbers flash when they move (classes set by the kit).
  `${L} [data-ss-bind].ss-flash-up{animation:ssFlashUp .9s ease-out}`,
  `${L} [data-ss-bind].ss-flash-down{animation:ssFlashDown .9s ease-out}`,

  // Scroll progress, and the market pulse: a sweep along the bottom edge each time the token really trades.
  `.ss-code .ss-progress{height:2px}`,
  `.ss-code .ss-pulse{position:fixed;left:0;right:0;bottom:0;height:3px;z-index:31;pointer-events:none;background:var(--accent);transform-origin:0 50%;transform:scaleX(0);opacity:0}`,
  `${L}[data-ss-pulse=buy] .ss-pulse{animation:ssPulseBar 1.2s ${EASE}}`,
  `${L}[data-ss-pulse=sell] .ss-pulse{background:var(--muted);animation:ssPulseBar 1.2s ${EASE}}`,
  `@keyframes ssPulseBar{0%{transform:scaleX(0);opacity:1}60%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}`,

  // Pictures open full size: any content image the layout crops or shrinks (motion.tsx marks it data-ss-zoom).
  `${L} img[data-ss-zoom]{cursor:zoom-in}`,
  `.ss-zoom{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px;background:rgba(0,0,0,.88);cursor:zoom-out;opacity:0;transition:opacity .16s ease-out}`,
  `.ss-zoom.is-on{opacity:1}`,
  `.ss-zoom>img{display:block;max-width:min(100%,1800px);max-height:calc(100dvh - 32px);width:auto;height:auto;object-fit:contain;border-radius:4px;scale:.98;transition:scale .2s ${EASE}}`,
  `.ss-zoom.is-on>img{scale:1}`,
  `.ss-zoom>button{position:absolute;top:12px;right:12px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font:400 22px/1 system-ui,sans-serif;cursor:pointer}`,
  `.ss-zoom>button:hover{background:rgba(255,255,255,.24)}`,

  `@media (prefers-reduced-motion:reduce){.ss-code [data-ss-reveal]{opacity:1!important;translate:none!important;scale:none!important;clip-path:none!important}.ss-code .ss-w>span{translate:none!important}.ss-code .ss-code-body>section h1{opacity:1!important;animation:none!important}.ss-code .ss-pulse{display:none}.ss-zoom,.ss-zoom>img{transition:none}}`,
].join("");
