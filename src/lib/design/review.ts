import type { LocalImage } from "../llm";
import { cleanFontParam } from "../sanitize";
import type { Block, SiteCode } from "../spec";

// Pass 4: look at what was built. The page is rendered in a headless Chromium at desktop (1280) and phone (390)
// width, measured for the layout faults a person spots at once (something wider than the screen, art spilling out of
// its section, split columns that don't line up, panels of different heights side by side, big empty bands, text
// cut off), and photographed. The findings and the screenshots go to the editor as one review request
// (lib/design/edit.ts), which fixes them in the site's own CSS/HTML.

/** Live widgets as boxes of about their real size, so the layout measures like the published page. */
const WIDGET_STUB = `[data-ss-widget]{display:grid;place-items:center;min-height:120px;border:1px dashed color-mix(in oklab,var(--accent) 60%,transparent);border-radius:var(--r-sm,10px);background:color-mix(in oklab,var(--surface) 70%,transparent);color:var(--muted);font:12px/1.2 var(--font-mono);text-transform:uppercase;letter-spacing:.08em}
[data-ss-widget]::before{content:"live " attr(data-ss-widget)}
[data-ss-widget=buy]{min-height:430px}[data-ss-widget=chart]{min-height:380px}[data-ss-widget=trades]{min-height:360px}
[data-ss-widget=holders],[data-ss-widget=leaderboard],[data-ss-widget=posts]{min-height:300px}[data-ss-widget=whatif]{min-height:240px}
[data-ss-widget=stats]{min-height:96px}[data-ss-widget=ca]{min-height:52px}[data-ss-widget=wallet]{min-height:40px;min-width:140px}
[data-ss-widget=signup]{min-height:110px}[data-ss-widget=milestones]{min-height:150px}[data-ss-widget=socials]{min-height:44px}[data-ss-widget=toasts]{display:none}
[data-ss-bind]::after{content:"$0.00042"}
[data-ss-reveal]{opacity:1!important;transform:none!important}
*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;scroll-behavior:auto!important}`;

/** A standalone page of the site (fonts, CSS, sections, widget boxes). Also used by the demo script. */
export function staticPage(code: SiteCode, blocks: Block[]): string {
  const fonts = code.fonts.map(cleanFontParam).filter((p): p is string => !!p).map((p) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${p}&display=swap">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}<style>html,body{margin:0}${code.css}\n${WIDGET_STUB}</style></head><body><div class="ss ss-code" style="background:var(--bg);min-height:100vh"><div class="ss-code-body">${blocks.map((b) => String(b.props.html ?? "")).join("\n")}</div></div></body></html>`;
}

export interface Inspection {
  /** Plain-language faults, each naming the section id. */
  issues: string[];
  shots: LocalImage[];
}

/** Runs in the page. Returns faults found at this width. Kept free of closures so it serialises. */
function lint(vw: number): string[] {
  const out: string[] = [];
  const name = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    const txt = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}>${txt ? ` ("${txt}")` : ""}`;
  };
  const clips = (el: Element, stop: Element) => {
    for (let a = el.parentElement; a && a !== stop.parentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) return true;
    }
    return false;
  };
  const visible = (el: Element) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 && r.width > 2 && r.height > 2;
  };
  const sections = [...document.querySelectorAll("section[data-block-id]")];
  const sy = window.scrollY;

  // 1. Wider than the screen.
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const wide = [...document.querySelectorAll(".ss-code-body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > vw + 2 && visible(el) && !clips(el, document.body);
    }).slice(0, 3);
    out.push(`At ${vw}px the page is ${sw}px wide (sideways scroll). Too wide: ${wide.map((el) => `${name(el)} in #${el.closest("section")?.getAttribute("data-block-id")}`).join("; ") || "unknown element"}.`);
  }

  let prevBottom: number | null = null, prevId: string | null = null;
  for (const sec of sections) {
    const id = sec.getAttribute("data-block-id");
    const sr = sec.getBoundingClientRect();
    const all = [...sec.querySelectorAll("*")].filter(visible);

    // 2. Spilling out of the section (behind the nav or into the next section).
    let worst: { el: Element; px: number; dir: string } | null = null;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24 || getComputedStyle(el).position === "fixed") continue;
      if (clips(el, sec)) continue;
      const up = sr.top - r.top, down = r.bottom - sr.bottom;
      const px = Math.max(up, down);
      if (px > 12 && (!worst || px > worst.px)) worst = { el, px, dir: up > down ? "above the top of" : "below the bottom of" };
    }
    if (worst) out.push(`At ${vw}px, ${name(worst.el)} sticks out ${Math.round(worst.px)}px ${worst.dir} section #${id}, so it overlaps the neighbouring section.`);

    // 2b. Round shapes framing the art (moon, halo, glow, disc) that overlap without sharing a centre.
    const round = all.filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const rad = parseFloat(cs.borderTopLeftRadius);
      return r.width > 120 && Math.abs(r.width - r.height) < r.width * 0.2 && (rad >= r.width * 0.4 || cs.borderTopLeftRadius.includes("%") && rad >= 40) && el.tagName !== "IMG";
    }).map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (let a = 0; a < round.length; a++) for (let b = a + 1; b < round.length; b++) {
      const A = round[a].r, B = round[b].r;
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ox <= 0 || oy <= 0 || round[a].el.contains(round[b].el) || round[b].el.contains(round[a].el)) continue;
      const d = Math.hypot(A.left + A.width / 2 - (B.left + B.width / 2), A.top + A.height / 2 - (B.top + B.height / 2));
      if (d > Math.min(A.width, B.width) * 0.18) {
        out.push(`At ${vw}px in #${id}, two round shapes overlap off-centre (${name(round[a].el)} and ${name(round[b].el)}, centres ${Math.round(d)}px apart): one sits higher/lower than the other. Centre them on the same point (or on the art) or separate them clearly.`);
        a = round.length;
        break;
      }
    }

    // 2c. A decorative shape behind the art that is placed against the section instead of centred on the art.
    const art = all.filter((el) => el.tagName === "IMG" || (el.tagName.toLowerCase() === "svg" && el.getAttribute("aria-hidden") !== "true")).map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width * r.height > 40_000).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    if (art) {
      const deco = all.filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.position === "absolute" && !(el.textContent ?? "").trim() && !el.querySelector("img") && r.width > 140 && r.height > 140 && r.width < sr.width * 0.8 && !el.contains(art.el) && el.tagName.toLowerCase() !== "svg";
      });
      for (const el of deco) {
        const r = el.getBoundingClientRect(), A = art.r;
        const ox = Math.min(A.right, r.right) - Math.max(A.left, r.left), oy = Math.min(A.bottom, r.bottom) - Math.max(A.top, r.top);
        if (ox <= 0 || oy <= 0 || ox * oy < Math.min(A.width * A.height, r.width * r.height) * 0.25) continue;
        const d = Math.hypot(A.left + A.width / 2 - (r.left + r.width / 2), A.top + A.height / 2 - (r.top + r.height / 2));
        if (d > Math.min(r.width, A.width) * 0.2) {
          out.push(`At ${vw}px in #${id}, the decorative ${name(el)} sits behind the picture ${name(art.el)} but is ${Math.round(d)}px off its centre (it is positioned against the section, not the picture), so the two look misaligned. Make it a ::before of the picture's frame, centred on it, or move it clear of the picture.`);
          break;
        }
      }
    }

    // 3. Side-by-side columns/panels that don't line up.
    for (const box of [sec, ...all]) {
      const cs = getComputedStyle(box);
      if (!/(grid|flex)/.test(cs.display) || (cs.display.includes("flex") && cs.flexDirection.startsWith("column"))) continue;
      const kids = [...box.children].filter((k) => visible(k) && !["absolute", "fixed"].includes(getComputedStyle(k).position));
      const br = box.getBoundingClientRect();
      if (kids.length < 2 || br.width < vw * 0.5) continue;
      // Bento grids (items spanning rows) are uneven on purpose.
      if (kids.some((k) => { const c = getComputedStyle(k); return /span|\d/.test(c.gridRowEnd) || /span|\d/.test(c.gridRowStart); })) break;
      const rs = kids.map((k) => k.getBoundingClientRect());
      // Only pairs/rows that really sit beside each other and are big enough to read as columns.
      const row = rs.filter((r) => Math.abs(r.top - rs[0].top) < Math.max(r.height, rs[0].height) && r.left !== rs[0].left);
      if (row.length < 1 || rs[0].width < br.width * 0.22) continue;
      // Compare the first column with the neighbour whose top is closest (a tall item beside a stack is fine).
      const next = row.filter((r) => r.left > rs[0].left).sort((x, y) => Math.abs(x.top - rs[0].top) - Math.abs(y.top - rs[0].top))[0];
      const pair = (next ? [rs[0], next] : []).filter((r) => r.height > 100 && r.width > br.width * 0.22);
      if (pair.length < 2) continue;
      const centres = pair.map((r) => r.top + r.height / 2), tops = pair.map((r) => r.top), hs = pair.map((r) => r.height);
      const dc = Math.max(...centres) - Math.min(...centres), dt = Math.max(...tops) - Math.min(...tops);
      const isHero = /hero/i.test(id ?? "") || sections.indexOf(sec) <= 1;
      if (dc > 48 && dt > 48) out.push(`At ${vw}px in #${id}, the columns of ${name(box)} are not aligned: their vertical centres differ by ${Math.round(dc)}px and tops by ${Math.round(dt)}px${isHero ? " (this is the hero; centre the columns on one axis)" : ""}.`);
      const panels = kids.filter((k) => { const c = getComputedStyle(k); return c.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(c.borderTopWidth) > 0; });
      if (panels.length >= 2 && panels.length === kids.length && Math.max(...hs) > Math.min(...hs) * 1.18 && Math.max(...hs) - Math.min(...hs) > 40)
        out.push(`At ${vw}px in #${id}, the side-by-side panels in ${name(box)} have different heights (${hs.map((h) => Math.round(h)).join("px / ")}px); make them equal or line their contents up.`);
      break;
    }

    // 4. Empty bands: space between the section edge and its first/last visible content, and between this section's
    // content and the next one's.
    const content = all.filter((el) => el.children.length === 0 || ["IMG", "SVG", "svg", "PICTURE"].includes(el.tagName) || el.hasAttribute("data-ss-widget"));
    if (content.length) {
      const top = Math.min(...content.map((el) => el.getBoundingClientRect().top)), bot = Math.max(...content.map((el) => el.getBoundingClientRect().bottom));
      if (prevBottom != null && prevId) {
        const gap = top - prevBottom, lim2 = vw >= 900 ? 300 : 200;
        if (gap > lim2) out.push(`At ${vw}px there are ${Math.round(gap)}px of empty space between the content of #${prevId} and #${id}; tighten the section padding so the rhythm stays even (about ${vw >= 900 ? "120–200" : "80–140"}px).`);
      }
      prevBottom = bot;
      prevId = id;
      const lim = vw >= 900 ? 220 : 150;
      const gTop = top - sr.top, gBot = sr.bottom - bot;
      if (gTop > lim) out.push(`At ${vw}px, #${id} has ${Math.round(gTop)}px of empty space above its content.`);
      if (gBot > lim) out.push(`At ${vw}px, #${id} has ${Math.round(gBot)}px of empty space below its content.`);
    }

    // 5. Text cut off by its box.
    const cut = all.find((el) => {
      const cs = getComputedStyle(el);
      return /(hidden|clip)/.test(cs.overflowX + cs.overflow) && el.scrollWidth > el.clientWidth + 4 && (el.textContent ?? "").trim().length > 3 && el.children.length < 3 && !/ellipsis/.test(cs.textOverflow);
    });
    if (cut) out.push(`At ${vw}px in #${id}, text is cut off: ${name(cut)}.`);
  }

  // 6. Hero fits the first screen at desktop.
  const hero = sections.find((s) => /hero/i.test(s.getAttribute("data-block-id") ?? "")) ?? sections[1];
  if (hero && vw >= 900) {
    const h1 = hero.querySelector("h1, [data-el=headline]");
    const r = h1?.getBoundingClientRect();
    if (r && r.bottom + sy > 900) out.push(`At ${vw}×900 the hero headline ends ${Math.round(r.bottom + sy)}px down, below the first screen; tighten the hero so headline and action show without scrolling.`);
  }
  const tiny = [...document.querySelectorAll(".ss-code-body *")].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 2) && parseFloat(getComputedStyle(el).fontSize) < 10.5 && visible(el)).length;
  if (tiny > 3) out.push(`At ${vw}px, ${tiny} text elements are smaller than 11px; raise them to at least 11px.`);
  return out;
}

/** Renders and measures the page. Null when no browser is available. */
export async function inspect(html: string): Promise<Inspection | null> {
  let chromium: typeof import("playwright-core").chromium;
  try { ({ chromium } = await import("playwright-core")); } catch { return null; }
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try { browser = await chromium.launch({ headless: true }); } catch { return null; }
  const issues: string[] = [];
  const shots: LocalImage[] = [];
  try {
    for (const [w, h] of [[1280, 900], [390, 844]] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      try {
        await page.setContent(html, { waitUntil: "load", timeout: 20_000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await page.waitForTimeout(400);
        issues.push(...(await page.evaluate(lint, w)));
        const first = await page.screenshot({ type: "jpeg", quality: 70 });
        shots.push({ media: "image/jpeg", data: first.toString("base64"), label: `Review screenshot: the first screen at ${w}×${h}` });
        if (w === 1280) {
          // The whole page, scaled so it stays legible to the model (tall pages are split in two).
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          const step = Math.min(Math.max(height / 2, 2400), 4000);
          for (let y = h, n = 0; y < height && n < 2; y += step, n++) {
            const part = await page.screenshot({ type: "jpeg", quality: 60, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(step, height - y) } });
            shots.push({ media: "image/jpeg", data: part.toString("base64"), label: `Review screenshot: the page from ${y}px to ${Math.round(Math.min(y + step, height))}px at ${w}px wide` });
          }
        }
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { issues: [...new Set(issues)].slice(0, 14), shots };
}

/** What the editor is told when it reviews the build. */
export function reviewRequest(issues: string[]): string {
  return `Review the site you just built as a senior designer would, using the attached screenshots (first screen at desktop and phone, then the rest of the page) and the measured faults below. Fix every measured fault, then anything else that clearly looks broken or unfinished: misaligned columns, art or shapes spilling out of their section or not centred in their frame, uneven gaps between sections, panels of different heights side by side, a hero that doesn't fit the first screen, cramped or tiny text, weak contrast, empty boxes. Keep the concept, palette, fonts and copy; change only what fixes a problem. Prefer CSS (mode="append") and only rewrite a section when its structure is the problem. If nothing needs fixing, return <edit><summary>No changes needed.</summary></edit>.
MEASURED FAULTS:
${issues.length ? issues.map((x) => `- ${x}`).join("\n") : "- none measured; check the screenshots"}`;
}
