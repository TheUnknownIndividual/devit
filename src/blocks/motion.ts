// The motion kit every generated-code site gets, whatever the model wrote. Models vary a lot in how much motion they
// write (one site came out with none at all), so the floor is ours: scroll reveals, word-by-word headlines, hover
// response on everything clickable, live numbers that count and flash, and a pulse when the token really trades.
//
// Rules of the kit:
//  - Live view only. The builder's preview and the reviewer's screenshots show the finished state.
//  - Hover uses the individual `translate`/`scale` properties, so it composes with the reveal's `transform`.
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
const EASE = "cubic-bezier(.2,.8,.2,1)";

export const MOTION_CSS = [
  // Reveal: hidden until scrolled to, then in. Stagger with style="--i:N".
  `${L} [data-ss-reveal]{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .8s ${EASE},clip-path .9s ${EASE};transition-delay:calc(var(--i,0)*80ms)}`,
  // Explicit variants the model can ask for.
  `${L} [data-ss-reveal=mask]{opacity:1;transform:none;clip-path:inset(0 0 100% 0)}`,
  `${L} [data-ss-reveal=scale]{transform:scale(.94)}`,
  `${L} [data-ss-reveal=left]{transform:translateX(-28px)}`,
  `${L} [data-ss-reveal=right]{transform:translateX(28px)}`,
  // The archetype's own entrance for plain reveals.
  `${L}[data-ss-motion=type] [data-ss-reveal=""]{opacity:1;transform:none;clip-path:inset(0 100% 0 0);transition:clip-path .7s steps(18,end);transition-delay:calc(var(--i,0)*90ms)}`,
  `${L}[data-ss-motion=slam] [data-ss-reveal=""]{transform:scale(1.08) rotate(-1.2deg);transition:opacity .35s ease,transform .5s cubic-bezier(.3,1.5,.5,1);transition-delay:calc(var(--i,0)*70ms)}`,
  `${L}[data-ss-motion=wipe] [data-ss-reveal=""]{opacity:1;transform:none;clip-path:inset(0 0 100% 0);transition:clip-path 1s ${EASE};transition-delay:calc(var(--i,0)*90ms)}`,
  `${L}[data-ss-motion=float] [data-ss-reveal=""]{transform:translateY(32px);transition:opacity 1.1s ease,transform 1.3s ${EASE};transition-delay:calc(var(--i,0)*110ms)}`,
  // Shown: after every variant and preset so it always wins.
  `${L} [data-ss-reveal].is-in{opacity:1;transform:none;clip-path:inset(0 0 0 0)}`,

  // Headlines word by word: each word slides up from behind its own mask.
  `${L} .ss-w{display:inline-block;overflow:clip;vertical-align:top;padding-bottom:.12em;margin-bottom:-.12em}`,
  `${L} .ss-w>span{display:inline-block;transform:translateY(108%);transition:transform .9s ${EASE};transition-delay:calc(var(--w,0)*45ms + var(--i,0)*80ms)}`,
  `${L}[data-ss-motion=slam] .ss-w>span{transform:translateY(108%) rotate(6deg);transition:transform .6s cubic-bezier(.3,1.4,.5,1);transition-delay:calc(var(--w,0)*60ms)}`,
  `${L}[data-ss-motion=type] .ss-w>span{transition:transform .01s steps(1);transition-delay:calc(var(--w,0)*70ms)}`,
  `${L} [data-ss-split].is-in .ss-w>span{transform:none}`,
  // Until the kit is ready the h1 (the hero headline) waits, so it never shows, vanishes and slides back in (never more than 1.2s, in case scripts don't run).
  `${L}:not([data-ss-ready]) .ss-code-body>section h1{opacity:0;animation:ssShow 0s 1.2s forwards}`,
  `@keyframes ssShow{to{opacity:1}}`,

  // Hover floor: everything clickable answers the pointer. Zero specificity, so the model's own hover wins.
  `:where(${L}) :where(a[href],button):not(:where([data-ss-widget] *)){transition:translate .2s ${EASE},scale .2s ${EASE},color .2s,background-color .2s,border-color .2s,opacity .2s}`,
  `:where(${L}) :where(a[href],button):not(:where([data-ss-widget] *)):hover{translate:0 -2px}`,
  `:where(${L}) :where(a[href],button):not(:where([data-ss-widget] *)):active{translate:0 0;scale:.97}`,
  `:where(${L}) :where(article,[data-ss-card]){transition:translate .35s ${EASE},border-color .35s,box-shadow .35s}`,
  `:where(${L}) :where(article,[data-ss-card]):hover{translate:0 -4px;border-color:color-mix(in oklab,var(--accent) 70%,transparent)}`,
  // Pointer tilt for hero art (the kit sets --rx/--ry); don't combine with data-ss-reveal on the same element.
  `${L} [data-ss-tilt]{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .4s ${EASE};will-change:transform}`,
  // Parallax: the kit sets translate from scroll position.
  `${L} [data-ss-parallax]{will-change:translate}`,

  // Live numbers flash when they move (classes set by the kit).
  `${L} [data-ss-bind].ss-flash-up{animation:ssFlashUp .9s ease-out}`,
  `${L} [data-ss-bind].ss-flash-down{animation:ssFlashDown .9s ease-out}`,

  // Scroll progress, and the market pulse: a sweep along the bottom edge each time the token really trades.
  `.ss-code .ss-progress{height:2px}`,
  `.ss-code .ss-pulse{position:fixed;left:0;right:0;bottom:0;height:3px;z-index:31;pointer-events:none;background:var(--accent);transform-origin:0 50%;transform:scaleX(0);opacity:0}`,
  `${L}[data-ss-pulse=buy] .ss-pulse{animation:ssPulseBar 1.4s ${EASE}}`,
  `${L}[data-ss-pulse=sell] .ss-pulse{background:var(--muted);animation:ssPulseBar 1.4s ${EASE}}`,
  `@keyframes ssPulseBar{0%{transform:scaleX(0);opacity:1}60%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}`,

  `@media (prefers-reduced-motion:reduce){.ss-code [data-ss-reveal]{opacity:1!important;transform:none!important;clip-path:none!important}.ss-code .ss-w>span{transform:none!important}.ss-code .ss-code-body>section h1{opacity:1!important;animation:none!important}.ss-code .ss-pulse{display:none}}`,
].join("");
