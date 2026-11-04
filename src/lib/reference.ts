import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicHttps } from "./net";
import type { RefRead, RefSection, ThemeFx } from "./spec";
export { refsIn, withoutRefs } from "./reference-urls";

// Reads a reference site the team gave ("ref: https://nearbatman.com") for its look and motion: palette, type,
// corners, surfaces, how sections come in on scroll, what cards and buttons do on hover, parallax, marquees,
// smooth scrolling, and the order and shape of its sections across a few of its pages. Never its words or pictures:
// the read keeps no copy and no image addresses, so the site built from it can only borrow the feel.
//
// A real browser (playwright-core with the Chromium already installed) reads it rendered: it scrolls the page and
// watches what moves, and hovers a button and a card to see what changes. Without a browser (a server that has
// none), the HTML and its stylesheets are read instead, which finds the palette, type, hover rules and animation
// libraries but not what scrolling does.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const PAGE_MS = 15_000;
const MAX_PAGES = 4;

const PRIVATE_V4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** A host that resolves only to public addresses: the browser fetches what the page asks for, so every request is checked. */
async function publicHost(host: string, cache: Map<string, boolean>): Promise<boolean> {
  const known = cache.get(host);
  if (known !== undefined) return known;
  let ok = false;
  try {
    if (isIP(host)) ok = false;
    else {
      const addrs = await lookup(host, { all: true });
      ok = addrs.length > 0 && addrs.every((a) => (a.family === 4 ? !PRIVATE_V4.test(a.address) : !/^(::1|fc|fd|fe80|::ffff:)/i.test(a.address)));
    }
  } catch { ok = false; }
  cache.set(host, ok);
  return ok;
}

// ---------- the in-page read (runs inside the reference page) ----------

interface PageRead {
  title: string | null;
  palette: RefRead["palette"];
  fonts: { display: string | null; body: string | null };
  uppercase: boolean;
  radius: number | null;
  surface: RefRead["surface"];
  sections: RefSection[];
  hoverRules: string[];
  keyframes: string[];
  libraries: string[];
  smoothScroll: boolean;
  marquee: boolean;
  sticky: boolean;
  links: string[];
}

/* eslint-disable */
// Serialised into the page, so it must not close over anything.
function readPage(): PageRead {
  const css = (el: Element | null) => (el ? getComputedStyle(el) : null);
  const parse = (c: string | null | undefined): [number, number, number, number] | null => {
    const m = c?.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const hex = (c: string | null | undefined): string | null => {
    const p = parse(c);
    if (!p || p[3] < 0.5) return null;
    return "#" + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  };
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const sat = (h: string) => { const n = parseInt(h.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none"; };
  const family = (f: string | undefined) => (f ? f.split(",")[0].replace(/["']/g, "").trim() : null);

  // Background: the first opaque one from body inward.
  let bg = hex(css(document.body)?.backgroundColor) ?? hex(css(document.documentElement)?.backgroundColor);
  if (!bg) for (const el of Array.from(document.querySelectorAll("main, #__next > *, body > div")).slice(0, 6)) { bg = hex(css(el)?.backgroundColor); if (bg) break; }
  bg = bg ?? "#ffffff";
  const text = hex(css(document.querySelector("p") ?? document.body)?.color);
  const h = document.querySelector("h1") ?? document.querySelector("h2");
  const hs = css(h);
  const ps = css(document.querySelector("p"));

  // Buttons: the most saturated fill among clickable things is the accent.
  const clickables = Array.from(document.querySelectorAll("a, button, [role=button]")).filter(visible).slice(0, 120);
  const fills = clickables.map((el) => ({ el, fill: hex(css(el)?.backgroundColor) })).filter((x) => x.fill && x.fill !== bg) as Array<{ el: Element; fill: string }>;
  fills.sort((a, b) => sat(b.fill) - sat(a.fill));
  let accent = fills[0]?.fill ?? null;
  if (!accent) {
    const colored = clickables.map((el) => hex(css(el)?.color)).filter((c): c is string => !!c && sat(c) > 0.35);
    accent = colored[0] ?? null;
  }

  // Cards: boxes with their own fill or border inside sections.
  const boxes = Array.from(document.querySelectorAll("div, article, li, section > *")).filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 80 || r.width > innerWidth * 0.9) return false;
    const s = getComputedStyle(el);
    return (hex(s.backgroundColor) && hex(s.backgroundColor) !== bg) || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none" || s.backdropFilter !== "none";
  }).slice(0, 80);
  const radii = boxes.map((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)).filter((n) => Number.isFinite(n) && n < 200);
  radii.sort((a, b) => a - b);
  const radius = radii.length ? radii[Math.floor(radii.length / 2)] : null;
  const surfaceFill = boxes.map((el) => hex(getComputedStyle(el).backgroundColor)).find((c) => c && c !== bg) ?? null;
  let glass = 0, offset = 0, soft = 0, outline = 0;
  for (const el of [...boxes, ...fills.map((f) => f.el)]) {
    const s = getComputedStyle(el);
    if (s.backdropFilter && s.backdropFilter !== "none") glass++;
    const sh = s.boxShadow;
    if (sh && sh !== "none") { if (/\b\d+px \d+px 0px\b/.test(sh) && !/rgba\([^)]*0\.[0-3]\)/.test(sh)) offset++; else soft++; }
    else if (parseFloat(s.borderTopWidth) > 0) outline++;
  }
  const surface: PageRead["surface"] = glass >= 2 ? "glass" : offset >= 2 ? "offset" : soft > outline ? "soft" : outline ? "outline" : null;

  // Stylesheets we can read: hover rules and keyframe names.
  const hoverRules: string[] = [];
  const keyframes: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list: CSSRuleList) => {
      for (const r of Array.from(list)) {
        if ((r as CSSKeyframesRule).type === 7) keyframes.push((r as CSSKeyframesRule).name);
        else if ((r as CSSStyleRule).selectorText?.includes(":hover") && hoverRules.length < 60) hoverRules.push((r as CSSStyleRule).style.cssText.slice(0, 160));
        else if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
      }
    };
    walk(rules);
  }

  const w = window as unknown as Record<string, unknown>;
  const html = document.documentElement;
  const libraries = [
    w.gsap ? "GSAP" : null, w.ScrollTrigger || (w.gsap as { plugins?: Record<string, unknown> } | undefined)?.plugins?.scrollTrigger ? "ScrollTrigger" : null,
    w.AOS || document.querySelector("[data-aos]") ? "AOS" : null,
    w.lenis || w.Lenis || html.classList.contains("lenis") ? "Lenis" : null,
    w.LocomotiveScroll || html.classList.contains("has-scroll-smooth") || document.querySelector("[data-scroll-container]") ? "Locomotive Scroll" : null,
    document.querySelector("[data-framer-name], [data-framer-component-type]") ? "Framer" : null,
    w.Swiper || document.querySelector(".swiper") ? "Swiper" : null,
    w.THREE || Array.from(document.querySelectorAll("canvas")).some((c) => { try { return !!(c as HTMLCanvasElement).getContext("webgl2") || !!(c as HTMLCanvasElement).getContext("webgl"); } catch { return false; } }) ? "WebGL" : null,
    w.lottie || document.querySelector("lottie-player, dotlottie-player") ? "Lottie" : null,
    document.querySelector("[data-wf-page]") ? "Webflow interactions" : null,
  ].filter((x): x is string => !!x);
  const smoothScroll = libraries.some((l) => l === "Lenis" || l === "Locomotive Scroll") || getComputedStyle(html).scrollBehavior === "smooth";
  const marquee = Array.from(document.querySelectorAll("*")).slice(0, 2500).some((el) => { const s = getComputedStyle(el); return s.animationIterationCount === "infinite" && /marquee|scroll|ticker|slide/i.test(s.animationName + " " + el.className); }) || !!document.querySelector("marquee, [class*=marquee], [class*=ticker]");
  const sticky = Array.from(document.querySelectorAll("section, div")).slice(0, 1500).some((el) => getComputedStyle(el).position === "sticky" && el.getBoundingClientRect().height > innerHeight * 0.5);

  // Sections: the tall direct blocks of the page, as kinds and shapes only.
  const top = Array.from(document.querySelectorAll("header, nav, section, footer, main > div, body > div > div, [class*=section]")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > innerWidth * 0.6 && r.height > 120 && visible(el);
  });
  const outer = top.filter((el) => !top.some((o) => o !== el && o.contains(el) && o.tagName === "SECTION"));
  const kindOf = (el: Element): string => {
    const t = (el.textContent ?? "").toLowerCase().slice(0, 1500);
    const tag = el.tagName.toLowerCase();
    if (tag === "nav" || (tag === "header" && el.getBoundingClientRect().height < 140)) return "nav";
    if (tag === "footer") return "footer";
    if (/tokenomics|supply|allocation|distribution/.test(t)) return "tokenomics";
    if (/roadmap|phase \d|milestones?|q[1-4] 20/.test(t)) return "roadmap";
    if (/how to buy|step \d|get a wallet|swap .* for/.test(t)) return "how";
    if (/\bfaq\b|frequently asked|questions/.test(t)) return "faq";
    if (/\b(buy|swap)\b/.test(t) && el.querySelector("input")) return "buy";
    if (/\bchart\b|dexscreener|price/.test(t) && el.querySelector("iframe, canvas")) return "chart";
    if (/about|story|lore|who is|origin/.test(t)) return "story";
    if (/community|join|telegram|twitter|discord/.test(t) && el.querySelectorAll("a").length >= 2) return "socials";
    if (/contract|copy|\bca\b/.test(t) && t.length < 400) return "contract";
    if (el.getBoundingClientRect().top < innerHeight * 0.4) return "hero";
    if (el.querySelectorAll("img").length >= 6) return "gallery";
    return "content";
  };
  const colsOf = (el: Element): number => {
    let best = 1;
    for (const c of Array.from(el.querySelectorAll("*")).slice(0, 400)) {
      const s = getComputedStyle(c);
      if (s.display.includes("grid")) best = Math.max(best, s.gridTemplateColumns.split(" ").filter(Boolean).length);
      else if (s.display.includes("flex") && s.flexDirection.startsWith("row")) best = Math.max(best, Array.from(c.children).filter((k) => k.getBoundingClientRect().width > 120).length);
    }
    return Math.min(best, 6);
  };
  const sections: RefSection[] = outer.slice(0, 16).map((el) => ({
    kind: kindOf(el), cols: colsOf(el),
    media: !!el.querySelector("img, video, canvas, svg[width]"),
    buttons: el.querySelectorAll("a[class*=btn], a[class*=button], button").length,
    heightPx: Math.round(el.getBoundingClientRect().height),
  }));

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a[href], header a[href]"))
    .map((a) => a.href).filter((u) => { try { const x = new URL(u); return x.host === location.host && x.pathname !== location.pathname && !x.hash; } catch { return false; } });

  const dark = lum(bg) < 0.45;
  const muted = hex(css(document.querySelector("small, [class*=muted], [class*=subtitle], footer p"))?.color);
  return {
    title: document.title || null,
    palette: { bg, surface: surfaceFill, text, muted: muted && muted !== text ? muted : null, accent, dark },
    fonts: { display: family(hs?.fontFamily), body: family(ps?.fontFamily ?? css(document.body)?.fontFamily) },
    uppercase: hs?.textTransform === "uppercase",
    radius, surface, sections, hoverRules, keyframes: [...new Set(keyframes)].slice(0, 30), libraries, smoothScroll, marquee, sticky,
    links: [...new Set(links)].slice(0, 12),
  };
}

/** Elements below the fold, marked so the scroll pass can watch them; returns how many. */
function markBelow(): number {
  const els = Array.from(document.querySelectorAll("section *, main *, [class*=section] *")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top > innerHeight * 1.05 && r.width > 60 && r.height > 24 && el.children.length <= 12;
  }).slice(0, 400);
  // Spread the sample down the page.
  const step = Math.max(1, Math.floor(els.length / 80));
  els.filter((_, i) => i % step === 0).slice(0, 80).forEach((el, i) => {
    el.setAttribute("data-ss-watch", String(i));
    const s = getComputedStyle(el);
    el.setAttribute("data-ss-before", JSON.stringify({ o: s.opacity, t: s.transform, f: s.filter, c: s.clipPath }));
  });
  return Math.min(80, els.length);
}

/** After the scroll pass: what the watched elements did as they came into view. */
function readReveal(): { reveal: string | null; seen: number; moved: number } {
  const counts: Record<string, number> = { rise: 0, fade: 0, scale: 0, blur: 0, slide: 0 };
  let seen = 0, moved = 0;
  for (const el of Array.from(document.querySelectorAll("[data-ss-watch]"))) {
    seen++;
    const b = JSON.parse(el.getAttribute("data-ss-before") || "{}") as { o: string; t: string; f: string; c: string };
    const s = getComputedStyle(el);
    const was = parseFloat(b.o), now = parseFloat(s.opacity);
    const tChanged = b.t !== s.transform && b.t !== "none";
    const fChanged = b.f !== s.filter && /blur/.test(b.f);
    if (!(was < 0.6 && now > was + 0.3) && !tChanged && !fChanged && b.c === s.clipPath) continue;
    moved++;
    if (fChanged) { counts.blur++; continue; }
    const m = b.t.match(/matrix\(([^)]+)\)/);
    if (m) {
      const [a, , , d, tx, ty] = m[1].split(",").map(Number);
      if (Math.abs(a - 1) > 0.02 || Math.abs(d - 1) > 0.02) counts.scale++;
      else if (Math.abs(tx) > Math.abs(ty) && Math.abs(tx) > 4) counts.slide++;
      else if (Math.abs(ty) > 4) counts.rise++;
      else counts.fade++;
    } else counts.fade++;
  }
  const best = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
  return { reveal: moved >= 2 && best[1] > 0 ? best[0] : null, seen, moved };
}
/* eslint-enable */

// ---------- browser read ----------

type HoverKind = NonNullable<ThemeFx["hover"]>;

function hoverFrom(before: Record<string, string>, after: Record<string, string>): HoverKind | null {
  if (before.transform !== after.transform && after.transform !== "none") {
    const m = after.transform.match(/matrix\(([^)]+)\)/);
    if (m) {
      const [a, , , d, , ty] = m[1].split(",").map(Number);
      if (Math.abs(a - 1) > 0.01 || Math.abs(d - 1) > 0.01) return "scale";
      if (ty < -0.5) return "lift";
    }
  }
  if (before.boxShadow !== after.boxShadow && after.boxShadow !== "none") return /0px 0px/.test(after.boxShadow) ? "glow" : "lift";
  if (before.filter !== after.filter || before.backgroundColor !== after.backgroundColor) return "glow";
  return null;
}

async function viaBrowser(url: string, shot?: string): Promise<RefRead | null> {
  let chromium: typeof import("playwright-core").chromium;
  try { ({ chromium } = await import("playwright-core")); } catch { return null; }
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try { browser = await chromium.launch({ headless: true }); } catch { return null; }
  const hosts = new Map<string, boolean>();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, reducedMotion: "no-preference", serviceWorkers: "block", acceptDownloads: false });
    // Every request the page makes is checked: public https hosts only, and no video or audio (not needed for a look).
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      let u: URL;
      try { u = new URL(req.url()); } catch { return route.abort(); }
      if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
      if (u.protocol !== "https:" || req.resourceType() === "media" || !(await publicHost(u.hostname, hosts))) return route.abort();
      return route.continue();
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(PAGE_MS);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_MS });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const first = await page.evaluate(readPage);
    // The style library keeps a small picture of the first screen (jpeg, never reused on a built site).
    if (shot) await page.screenshot({ path: shot, type: "jpeg", quality: 35 }).catch(() => undefined);

    // Scroll down in steps, as a person would, then see what the watched elements did.
    await page.evaluate(markBelow);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    let parallax = false;
    const probe = () => page.evaluate(() => Array.from(document.querySelectorAll("img, [class*=parallax], [data-speed], [data-scroll-speed]")).slice(0, 30).map((el) => getComputedStyle(el).transform + "|" + Math.round(el.getBoundingClientRect().top)));
    for (let y = 0, i = 0; y < Math.min(height, 14_000) && i < 28; y += 600, i++) {
      const a = i === 2 ? await probe() : null;
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(260);
      if (a) {
        const b = await probe();
        // An element whose transform changes while the page scrolls, or that moves a different distance than the scroll.
        parallax = a.some((v, k) => { const [ta, pa] = v.split("|"); const [tb, pb] = (b[k] ?? "|").split("|"); return (ta !== tb && ta !== "none") || Math.abs((+pa - +pb) - 600) > 40 && Math.abs(+pa - +pb) > 40; });
      }
    }
    await page.waitForTimeout(700);
    const scroll = await page.evaluate(readReveal);

    // Hover a button and a card.
    await page.mouse.wheel(0, -100_000);
    await page.waitForTimeout(400);
    const hovers: HoverKind[] = [];
    for (const sel of ["a[class*=btn], a[class*=button], button", "[class*=card], article, li[class]"]) {
      const el = (await page.$$(sel)).slice(0, 6);
      for (const h of el) {
        if (!(await h.isVisible().catch(() => false))) continue;
        const read = () => h.evaluate((n) => { const s = getComputedStyle(n); return { transform: s.transform, boxShadow: s.boxShadow, filter: s.filter, backgroundColor: s.backgroundColor }; });
        const before = await read().catch(() => null);
        if (!before) continue;
        await h.hover({ timeout: 2_000 }).catch(() => undefined);
        await page.waitForTimeout(450);
        const after = await read().catch(() => null);
        await page.mouse.move(2, 2);
        const kind = after ? hoverFrom(before, after) : null;
        if (kind) { hovers.push(kind); break; }
      }
    }

    // A few more pages from its navigation: their section shapes only.
    const pages: RefRead["pages"] = [{ url, title: first.title, sections: first.sections }];
    for (const link of first.links.slice(0, MAX_PAGES - 1)) {
      if (!isPublicHttps(link)) continue;
      try {
        await page.goto(link, { waitUntil: "domcontentloaded", timeout: 10_000 });
        await page.waitForTimeout(600);
        const r = await page.evaluate(readPage);
        pages.push({ url: link, title: r.title, sections: r.sections });
      } catch { /* skip that page */ }
    }

    const durations = await page.evaluate(() => Array.from(document.querySelectorAll("a, button, [class*=card]")).slice(0, 60).map((el) => parseFloat(getComputedStyle(el).transitionDuration) || 0).filter((n) => n > 0));
    return finish(url, "browser", first, { reveal: scroll.reveal as RefRead["motion"]["reveal"], hover: hovers[0] ?? hoverFromRules(first.hoverRules), parallax, durations, pages });
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function hoverFromRules(rules: string[]): HoverKind | null {
  const all = rules.join(" ");
  if (/scale\(/.test(all)) return "scale";
  if (/translateY\(-|translate\(0(px)?, ?-/.test(all)) return "lift";
  if (/box-shadow|filter|brightness/.test(all)) return "glow";
  return null;
}

// ---------- html read (no browser) ----------

async function fetchCapped(url: string, max: number): Promise<string | null> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isPublicHttps(at)) return null;
    let r: Response;
    try { r = await fetch(at, { redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8_000), cache: "no-store" }); } catch { return null; }
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); if (!loc) return null; at = new URL(loc, at).toString(); continue; }
    if (!r.ok) return null;
    const text = await r.text().catch(() => "");
    return text.slice(0, max);
  }
  return null;
}

async function viaHtml(url: string): Promise<RefRead | null> {
  const host = new URL(url).hostname;
  if (!(await publicHost(host, new Map()))) return null;
  const html = await fetchCapped(url, 1_500_000);
  if (!html) return null;
  const sheets = [...html.matchAll(/<link[^>]+rel=["']?stylesheet[^>]*href=["']([^"']+)["']/gi)].map((m) => new URL(m[1], url).toString()).filter(isPublicHttps).slice(0, 4);
  const css = [html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join("\n") ?? "", ...(await Promise.all(sheets.map((s) => fetchCapped(s, 400_000))))].join("\n");
  const count = (re: RegExp) => (css.match(re) ?? []).length;
  const hexes = [...css.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => `#${m[1].toLowerCase()}`);
  const freq = new Map<string, number>();
  for (const h of hexes) freq.set(h, (freq.get(h) ?? 0) + 1);
  const ranked = [...freq].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const sat = (h: string) => { const n = parseInt(h.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{6})/i)?.[1]?.toLowerCase() ?? null;
  const bodyBg = css.match(/body\s*\{[^}]*background(?:-color)?:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase() ?? theme ?? ranked.find((h) => sat(h) < 0.15) ?? null;
  const accent = ranked.find((h) => sat(h) > 0.45 && lum(h) > 0.2) ?? null;
  const google = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"']+)/g)].flatMap((m) => [...m[1].matchAll(/family=([^:&]+)/g)].map((f) => decodeURIComponent(f[1].replace(/\+/g, " "))));
  const fam = [...css.matchAll(/font-family:\s*["']?([^"',;}]+)/gi)].map((m) => m[1].trim()).filter((f) => !/^(inherit|sans-serif|serif|monospace|system-ui|var\()/i.test(f));
  const radii = [...css.matchAll(/border-radius:\s*(\d+)px/gi)].map((m) => +m[1]).filter((n) => n < 200).sort((a, b) => a - b);
  const hoverRules = [...css.matchAll(/:hover[^{]*\{([^}]*)\}/g)].map((m) => m[1]).slice(0, 80);
  const libraries = [
    /gsap/i.test(html) ? "GSAP" : null, /ScrollTrigger/.test(html) ? "ScrollTrigger" : null, /aos(\.min)?\.js|data-aos=/i.test(html) ? "AOS" : null,
    /lenis/i.test(html) ? "Lenis" : null, /locomotive/i.test(html) ? "Locomotive Scroll" : null, /framer/i.test(html) ? "Framer" : null,
    /swiper/i.test(html) ? "Swiper" : null, /three(\.module)?(\.min)?\.js/i.test(html) ? "WebGL" : null, /lottie/i.test(html) ? "Lottie" : null,
  ].filter((x): x is string => !!x);
  const aos = html.match(/data-aos=["']([a-z-]+)/i)?.[1] ?? "";
  const reveal: RefRead["motion"]["reveal"] = /zoom/.test(aos) ? "scale" : /fade-(left|right)|slide-(left|right)/.test(aos) ? "slide" : /fade-up|slide-up/.test(aos) ? "rise" : aos ? "fade" : libraries.includes("ScrollTrigger") || libraries.includes("Framer") ? "rise" : null;
  const read: PageRead = {
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null,
    palette: { bg: bodyBg, surface: null, text: null, muted: null, accent, dark: bodyBg ? lum(bodyBg) < 0.45 : null },
    fonts: { display: google[0] ?? fam[0] ?? null, body: google[1] ?? fam[1] ?? google[0] ?? null },
    uppercase: /text-transform:\s*uppercase/i.test(css) && count(/text-transform:\s*uppercase/gi) > 3,
    radius: radii.length ? radii[Math.floor(radii.length / 2)] : null,
    surface: count(/backdrop-filter:\s*blur/gi) >= 2 ? "glass" : count(/box-shadow:\s*-?\d+px -?\d+px 0(px)?\s/gi) >= 2 ? "offset" : count(/box-shadow/gi) > count(/border:\s*1px/gi) ? "soft" : "outline",
    sections: [], hoverRules, keyframes: [...new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))].slice(0, 30), libraries,
    smoothScroll: libraries.includes("Lenis") || libraries.includes("Locomotive Scroll") || /scroll-behavior:\s*smooth/.test(css),
    marquee: /marquee|ticker/i.test(html), sticky: /position:\s*sticky/.test(css), links: [],
  };
  return finish(url, "html", read, { reveal, hover: hoverFromRules(hoverRules), parallax: /parallax|data-speed|data-scroll-speed/i.test(html), durations: [...css.matchAll(/transition[^;]*?(\d*\.?\d+)s/g)].map((m) => +m[1]), pages: [{ url, title: read.title, sections: [] }], google });
}

// ---------- shared ----------

function finish(url: string, how: RefRead["how"], r: PageRead, extra: { reveal: RefRead["motion"]["reveal"]; hover: HoverKind | null; parallax: boolean; durations: number[]; pages: RefRead["pages"]; google?: string[] }): RefRead {
  const d = extra.durations.sort((a, b) => a - b)[Math.floor(extra.durations.length / 2)] ?? null;
  const bouncy = r.keyframes.some((k) => /bounce|wobble|jelly|float|wiggle/i.test(k));
  const speed: RefRead["motion"]["speed"] = bouncy ? "bouncy" : d === null ? null : d <= 0.25 ? "snappy" : d >= 0.5 ? "calm" : "snappy";
  const notes: string[] = [];
  if (r.palette.dark !== null) notes.push(`${r.palette.dark ? "dark" : "light"} page${r.palette.accent ? ` with a ${r.palette.accent} accent` : ""}`);
  if (r.fonts.display) notes.push(`${r.fonts.display}${r.uppercase ? " in capitals" : ""} for headings${r.fonts.body && r.fonts.body !== r.fonts.display ? `, ${r.fonts.body} for text` : ""}`);
  if (r.radius !== null) notes.push(r.radius <= 2 ? "square corners" : r.radius >= 20 ? "very rounded corners" : `${Math.round(r.radius)} px corners`);
  if (r.surface) notes.push({ glass: "frosted glass panels", offset: "hard offset shadows", soft: "soft shadowed cards", outline: "outlined cards" }[r.surface]);
  if (extra.reveal) notes.push(`sections ${{ rise: "rise in", fade: "fade in", scale: "zoom in", blur: "come out of a blur", slide: "slide in from the side", none: "don't animate" }[extra.reveal]} on scroll`);
  if (extra.hover) notes.push(`${{ lift: "cards and buttons lift", scale: "cards and buttons grow", glow: "cards and buttons glow", none: "no hover change" }[extra.hover]} on hover`);
  if (extra.parallax) notes.push("parallax layers");
  if (r.marquee) notes.push("a scrolling marquee strip");
  if (r.smoothScroll) notes.push("smooth scrolling");
  if (r.sticky) notes.push("sticky sections");
  if (r.libraries.length) notes.push(`built with ${r.libraries.join(", ")}`);
  const pageCount = extra.pages.length;
  if (pageCount > 1) notes.push(`${pageCount} pages read`);
  return {
    url, host: new URL(url).hostname.replace(/^www\./, ""), how, title: r.title, pages: extra.pages,
    palette: r.palette, fonts: { ...r.fonts, google: extra.google ?? [] }, uppercase: r.uppercase, radius: r.radius, surface: r.surface,
    motion: { reveal: extra.reveal, hover: extra.hover, speed, parallax: extra.parallax, marquee: r.marquee, smoothScroll: r.smoothScroll, sticky: r.sticky, libraries: r.libraries },
    notes, at: Date.now(),
  };
}

/** Reads one reference site: rendered in a browser when one is installed, else from its HTML and CSS. Null if neither works. */
export async function readReference(raw: string, opts?: { shot?: string }): Promise<RefRead | null> {
  let url: string;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString().replace(/^http:/, "https:"); } catch { return null; }
  if (!isPublicHttps(url) || !(await publicHost(new URL(url).hostname, new Map()))) return null;
  if (process.env.SITESMITH_REF_BROWSER !== "0") {
    const r = await viaBrowser(url, opts?.shot);
    if (r) return r;
  }
  return viaHtml(url);
}
