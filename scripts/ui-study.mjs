// UI study: captures how a live site looks, moves and responds, for the design notes in docs/ui-study.md.
// node scripts/ui-study.mjs <url> [more urls...]   → data/ui-study/<host-path>/{desk.jpg,full.jpg,phone.jpg,flow-*.jpg,study.json}
// Reads only what any visitor sees. No sign-ins, no wallet connects, no form submits.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "data", "ui-study");

const slug = (u) => { const x = new URL(u); return (x.host + x.pathname).replace(/\/+$/, "").replace(/[^a-z0-9.]+/gi, "-"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Everything measurable from the page's computed styles. */
function measure() {
  const first = (v) => { let d = 0; for (let i = 0; i < v.length; i++) { const c = v[i]; if (c === "(") d++; else if (c === ")") d--; else if (c === "," && !d) return v.slice(0, i); } return v; };
  const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ×${v}`);
  const inc = (m, k) => k && m.set(k, (m.get(k) || 0) + 1);
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll("body *")].filter(vis).slice(0, 4000);
  const fonts = new Map(), sizes = new Map(), radii = new Map(), shadows = new Map(), bgs = new Map(), colors = new Map(),
    trans = new Map(), easings = new Map(), anims = new Map(), blur = new Map(), weights = new Map();
  for (const el of all) {
    const s = getComputedStyle(el);
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (text) { inc(fonts, s.fontFamily.split(",")[0].replace(/["']/g, "").trim()); inc(sizes, s.fontSize); inc(colors, s.color); inc(weights, s.fontWeight); }
    if (s.borderRadius !== "0px") inc(radii, s.borderRadius);
    if (s.boxShadow !== "none") inc(shadows, s.boxShadow.slice(0, 120));
    if (s.backgroundColor !== "rgba(0, 0, 0, 0)") inc(bgs, s.backgroundColor);
    if (s.backdropFilter && s.backdropFilter !== "none") inc(blur, s.backdropFilter);
    if (s.transitionDuration !== "0s") {
      inc(trans, `${s.transitionProperty.slice(0, 60)} ${s.transitionDuration.split(",")[0]}`);
      inc(easings, first(s.transitionTimingFunction));
    }
    if (s.animationName !== "none") inc(anims, `${s.animationName} ${s.animationDuration} ${first(s.animationTimingFunction)} ${s.animationIterationCount}`);
  }
  const keyframes = [];
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.type === 7) keyframes.push(r.name); } catch {} }
  const rootVars = [];
  const rs = getComputedStyle(document.documentElement);
  for (let i = 0; i < rs.length && rootVars.length < 60; i++) {
    const k = rs[i];
    if (k.startsWith("--") && /ease|duration|radius|shadow|accent|primary|brand|surface|background|spring|motion/i.test(k)) rootVars.push(`${k}: ${rs.getPropertyValue(k).trim().slice(0, 80)}`);
  }
  const h = (sel) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { text: el.textContent.trim().slice(0, 90), font: s.fontFamily.split(",")[0], size: s.fontSize, weight: s.fontWeight, tracking: s.letterSpacing, lh: s.lineHeight }; };
  const scripts = [...document.scripts].map((x) => x.src).filter(Boolean).join(" ") + " " + [...document.querySelectorAll("link[rel=preload],link[rel=modulepreload]")].map((l) => l.href).join(" ");
  const html = document.documentElement.outerHTML.slice(0, 400000);
  const libs = {
    framer: /framer-motion|data-framer|framerusercontent/i.test(html + scripts),
    gsap: /gsap|ScrollTrigger/i.test(scripts) || !!window.gsap,
    lenis: document.documentElement.classList.contains("lenis") || /lenis/i.test(scripts),
    lottie: /lottie|bodymovin|dotlottie/i.test(html + scripts),
    rive: /rive\.app|@rive-app|\.riv\b/i.test(html + scripts),
    three: /three(\.module)?\.js|three\.min|webgl/i.test(scripts) || !!document.querySelector("canvas"),
    spline: /spline/i.test(html + scripts),
    tailwind: /\b(px|py|mt|flex|grid)-\d|\btext-(sm|lg|xl)\b/.test(html.slice(0, 50000)),
    webflow: /webflow/i.test(html.slice(0, 20000)),
    nextjs: !!document.getElementById("__next") || /_next\/static/.test(scripts),
    video: document.querySelectorAll("video").length,
    canvas: document.querySelectorAll("canvas").length,
    svgs: document.querySelectorAll("svg").length,
  };
  const header = document.querySelector("header, nav, [role=banner]");
  const nav = header ? [...header.querySelectorAll("a, button")].filter(vis).slice(0, 24).map((a) => `${(a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 40)} → ${a.getAttribute("href") || "(button)"}`) : [];
  const outline = [...document.querySelectorAll("h1,h2,h3")].filter(vis).slice(0, 40).map((x) => `${x.tagName} ${x.textContent.trim().replace(/\s+/g, " ").slice(0, 80)}`);
  const ctas = [...document.querySelectorAll("a,button")].filter(vis).filter((b) => { const s = getComputedStyle(b); return s.backgroundColor !== "rgba(0, 0, 0, 0)" && b.textContent.trim().length > 1 && b.textContent.trim().length < 40; }).slice(0, 14).map((b) => { const s = getComputedStyle(b); return `${b.textContent.trim()} [bg ${s.backgroundColor} r ${s.borderRadius} h ${Math.round(b.getBoundingClientRect().height)} ${s.fontSize}/${s.fontWeight}]`; });
  const hs = header ? getComputedStyle(header) : null;
  return {
    title: document.title, pageHeight: document.documentElement.scrollHeight,
    h1: h("h1"), h2: h("h2"), body: (() => { const s = getComputedStyle(document.body); return { font: s.fontFamily.split(",")[0], size: s.fontSize, bg: s.backgroundColor, color: s.color }; })(),
    fonts: top(fonts), sizes: top(sizes, 12), weights: top(weights, 6), colors: top(colors), backgrounds: top(bgs, 10), radii: top(radii, 10), shadows: top(shadows, 6), backdrop: top(blur, 4),
    transitions: top(trans, 12), easings: top(easings, 6), animations: top(anims, 10), keyframes: [...new Set(keyframes)].slice(0, 40), rootVars,
    libs, nav, ctas, outline,
    header: hs ? { position: hs.position, bg: hs.backgroundColor, backdrop: hs.backdropFilter, height: Math.round(header.getBoundingClientRect().height) } : null,
  };
}

/** Style snapshot of an element, for hover/press diffs. */
function snap(el) {
  const s = getComputedStyle(el);
  return { bg: s.backgroundColor, color: s.color, transform: s.transform, shadow: s.boxShadow.slice(0, 90), opacity: s.opacity, border: s.borderColor, outline: s.outlineStyle + " " + s.outlineColor, filter: s.filter, scale: s.scale, translate: s.translate };
}

async function interactions(p) {
  const out = [];
  const handles = await p.$$("header a, header button, nav a, main a, main button, a[class*=button], a[class*=btn], button");
  const seen = new Set();
  for (const hnd of handles) {
    if (out.length >= 8) break;
    const box = await hnd.boundingBox().catch(() => null);
    if (!box || box.width < 30 || box.height < 20 || box.y > 2400 || box.y < 0) continue;
    const label = ((await hnd.innerText().catch(() => "")) || (await hnd.getAttribute("aria-label")) || "").trim().slice(0, 40);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    await hnd.scrollIntoViewIfNeeded().catch(() => {});
    const b2 = await hnd.boundingBox().catch(() => null); if (!b2) continue;
    const cx = b2.x + b2.width / 2, cy = b2.y + b2.height / 2;
    await p.mouse.move(5, 5); await sleep(350);
    const before = await hnd.evaluate(snap).catch(() => null);
    const trans = await hnd.evaluate((el) => { const s = getComputedStyle(el); return `${s.transitionProperty.slice(0, 70)} | ${s.transitionDuration} | ${s.transitionTimingFunction.slice(0, 60)}`; }).catch(() => "");
    await p.mouse.move(cx, cy); await sleep(60);
    const hover60 = await hnd.evaluate(snap).catch(() => null);
    await sleep(500);
    const hover = await hnd.evaluate(snap).catch(() => null);
    await p.mouse.down(); await sleep(120);
    const press = await hnd.evaluate(snap).catch(() => null);
    // Release off the element so nothing gets clicked.
    await p.mouse.move(2, 2); await p.mouse.up(); await sleep(150);
    const diff = (a, b) => a && b ? Object.fromEntries(Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, `${a[k]} → ${b[k]}`])) : null;
    out.push({ label, transition: trans, hover: diff(before, hover), hoverMidway: diff(before, hover60), press: diff(hover, press) });
  }
  return out;
}

/** Scroll the page; count elements that fade/slide in and whether the header changes. */
async function scrollStudy(p) {
  const pre = await p.evaluate(() => {
    window.__ss = new Map();
    const els = [...document.querySelectorAll("section *, main *")].slice(0, 3000);
    els.forEach((el, i) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); if (r.top > innerHeight) window.__ss.set(el, { o: s.opacity, t: s.transform }); });
    const hd = document.querySelector("header, nav"); return hd ? { bg: getComputedStyle(hd).backgroundColor, bd: getComputedStyle(hd).backdropFilter, h: hd.getBoundingClientRect().height, sh: getComputedStyle(hd).boxShadow, bb: getComputedStyle(hd).borderBottomColor } : null;
  });
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(H, 9000); y += 500) { await p.mouse.wheel(0, 500); await sleep(180); }
  await sleep(600);
  const post = await p.evaluate(() => {
    let reveal = 0, slide = 0;
    for (const [el, v] of window.__ss) { const s = getComputedStyle(el); if (v.o !== s.opacity && Number(v.o) < 0.5) reveal++; if (v.t !== s.transform) slide++; }
    const hd = document.querySelector("header, nav");
    return { reveal, slide, header: hd ? { bg: getComputedStyle(hd).backgroundColor, bd: getComputedStyle(hd).backdropFilter, h: hd.getBoundingClientRect().height, sh: getComputedStyle(hd).boxShadow, bb: getComputedStyle(hd).borderBottomColor, top: hd.getBoundingClientRect().top } : null };
  });
  return { headerBefore: pre, ...post };
}

/** DEX/bridge flows: open the token picker, type an amount, open settings. Never confirms anything. */
async function dexFlows(p, dir) {
  const flows = [];
  const shot = async (name) => { await p.screenshot({ path: path.join(dir, `flow-${name}.jpg`), type: "jpeg", quality: 62 }); flows.push(name); };
  const tryClick = async (re, name) => {
    const el = p.getByRole("button", { name: re }).first();
    if (!(await el.isVisible().catch(() => false))) return false;
    await el.click({ timeout: 3000 }).catch(() => {}); await sleep(250); await shot(name + "-250ms"); await sleep(900); await shot(name);
    return true;
  };
  const input = p.locator("input[inputmode=decimal], input[placeholder='0'], input[placeholder='0.0'], input[placeholder='0.00']").first();
  if (await input.isVisible().catch(() => false)) {
    await input.click().catch(() => {}); await p.keyboard.type("1.5", { delay: 90 }); await sleep(300); await shot("amount-300ms"); await sleep(2500); await shot("amount-quoted");
  }
  if (await tryClick(/select( a)? token|select|choose token/i, "token-picker")) { await p.keyboard.press("Escape"); await sleep(400); }
  if (await tryClick(/settings|slippage|gear/i, "settings")) { await p.keyboard.press("Escape"); await sleep(400); }
  return flows;
}

async function study(browser, url, dex) {
  const dir = path.join(OUT, slug(url)); fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", locale: "en-US" });
  const p = await ctx.newPage();
  const t0 = Date.now();
  const res = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
  await p.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await sleep(1500);
  const loadMs = Date.now() - t0;
  // Decline cookie banners (most privacy-preserving choice) so they don't cover the page.
  for (const re of [/reject all|decline|only necessary|necessary only|reject/i]) { const b = p.getByRole("button", { name: re }).first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}); }
  await p.screenshot({ path: path.join(dir, "desk.jpg"), type: "jpeg", quality: 62 });
  const m = await p.evaluate(measure).catch((e) => ({ error: String(e).slice(0, 200) }));
  const inter = await interactions(p).catch((e) => [{ error: String(e).slice(0, 120) }]);
  let flows = [];
  if (dex) { await p.evaluate(() => scrollTo(0, 0)); await sleep(300); flows = await dexFlows(p, dir).catch(() => flows); }
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}); await sleep(2000);
  const scroll = await scrollStudy(p).catch((e) => ({ error: String(e).slice(0, 120) }));
  await p.evaluate(() => scrollTo(0, 0)); await sleep(500);
  await p.screenshot({ path: path.join(dir, "full.jpg"), type: "jpeg", quality: 50, fullPage: true, clip: undefined }).catch(() => {});
  await ctx.close();
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const pp = await ph.newPage();
  await pp.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}); await sleep(2500);
  await pp.screenshot({ path: path.join(dir, "phone.jpg"), type: "jpeg", quality: 62 });
  const phoneNav = await pp.evaluate(() => { const b = [...document.querySelectorAll("header button, nav button")].map((x) => x.getAttribute("aria-label") || x.textContent.trim()).filter(Boolean).slice(0, 6); return b; }).catch(() => []);
  await ph.close();
  const out = { url, status: typeof res?.status === "function" ? res.status() : null, loadMs, ...m, interactions: inter, scroll, flows, phoneNav };
  fs.writeFileSync(path.join(dir, "study.json"), JSON.stringify(out, null, 1));
  return { url, dir, status: out.status, h: m.pageHeight };
}

const args = process.argv.slice(2);
const dexHosts = /uniswap|relay\.link|jup\.ag|cow\.fi|matcha|across|jumper|1inch|rhea|intea|near-intents|defuse/i;
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const u of args) {
  try { const r = await study(browser, u, dexHosts.test(u)); console.log(`ok ${r.status} h=${r.h} ${u}`); }
  catch (e) { console.log(`FAIL ${u} ${String(e).slice(0, 120)}`); }
}
await browser.close();
