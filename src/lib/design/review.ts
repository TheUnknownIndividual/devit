import type { LocalImage } from "../llm";
import { SITE_CSS } from "../../blocks/css";
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

/** A standalone page of the site: the renderer's own base CSS (so it measures like the live page), fonts, the site's CSS, sections and widget boxes. Also used by the demo script. */
export function staticPage(code: SiteCode, blocks: Block[]): string {
  const fonts = code.fonts.map(cleanFontParam).filter((p): p is string => !!p).map((p) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${p}&display=swap">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}<style>html,body{margin:0}${SITE_CSS}\n${code.css}\n${WIDGET_STUB}</style></head><body><div class="ss ss-code" style="background:var(--bg);min-height:100vh"><div class="ss-code-body">${blocks.map((b) => String(b.props.html ?? "")).join("\n")}</div></div></body></html>`;
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
    const art = all.filter((el) => el.tagName === "IMG").map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width * r.height > 40_000).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
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

    // 5. Text cut off by its box. A scrolling band (marquee/ticker: an animated track inside a clipping box) is
    // clipped on purpose, so it doesn't count.
    const moving = (el: Element) => [el, ...el.querySelectorAll("*")].slice(0, 40).some((x) => {
      const c = getComputedStyle(x);
      return (c.animationName !== "none" && c.animationName !== "") || /marquee|ticker|scroll|track|loop/i.test(x.getAttribute("class") ?? "");
    });
    const cut = all.find((el) => {
      const cs = getComputedStyle(el);
      return /(hidden|clip)/.test(cs.overflowX + cs.overflow) && el.scrollWidth > el.clientWidth + 4 && (el.textContent ?? "").trim().length > 3 && el.children.length < 3 && !/ellipsis/.test(cs.textOverflow) && !moving(el);
    });
    if (cut) out.push(`At ${vw}px in #${id}, text is cut off: ${name(cut)}.`);
  }

  // 5a. Headlines wider than their own box: with background-clip:text (chrome/gradient type) the overflow is invisible,
  // otherwise it spills over the next column.
  for (const hd of [...document.querySelectorAll(".ss-code-body h1, .ss-code-body h2, .ss-code-body [data-el=headline]")].filter(visible).slice(0, 30)) {
    const over = hd.scrollWidth - hd.clientWidth;
    if (over > 3 && hd.clientWidth > 0) {
      const cs = getComputedStyle(hd);
      const clipText = /text/.test(cs.backgroundClip + (cs as unknown as Record<string, string>).webkitBackgroundClip);
      out.push(`At ${vw}px in #${hd.closest("section")?.getAttribute("data-block-id")}, the headline ${name(hd)} is ${Math.round(over)}px wider than its box${clipText ? " and, because it is painted with background-clip:text, the overflowing letters are invisible (the last letters look cut off)" : ", so it spills past its column"}. Reduce its font-size (clamp/vw) or widen its box so the whole word fits.`);
      break;
    }
  }

  // 5b. Headline words broken in the middle (a name split across lines reads as a bug).
  for (const hd of [...document.querySelectorAll(".ss-code-body h1, .ss-code-body h2, .ss-code-body [data-el=headline]")].filter(visible).slice(0, 30)) {
    const walker = document.createTreeWalker(hd, NodeFilter.SHOW_TEXT);
    let broken: string | null = null;
    for (let n = walker.nextNode(); n && !broken; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      for (const m of text.matchAll(/\S{3,}/g)) {
        const range = document.createRange();
        range.setStart(n, m.index ?? 0);
        range.setEnd(n, (m.index ?? 0) + m[0].length);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top)));
        if (tops.size > 1) { broken = m[0]; break; }
      }
    }
    if (broken) out.push(`At ${vw}px in #${hd.closest("section")?.getAttribute("data-block-id")}, the headline word "${broken}" breaks in the middle across two lines. Size the headline so its longest word fits the column (no overflow-wrap/word-break on display type).`);
  }

  // 5c. Boxes squeezed so narrow that ordinary words break letter by letter (a grid track or flex item collapsed to a
  // sliver: "P / r / i / c / e" stacked down a tile).
  {
    const seen = new Set<string>();
    const walker = document.createTreeWalker(document.querySelector(".ss-code-body") ?? document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const host = n.parentElement;
      const sid = host?.closest("section")?.getAttribute("data-block-id");
      if (!host || !sid || seen.has(sid) || host.closest("h1,h2,[data-el=headline]") || !visible(host)) continue;
      for (const m of (n.textContent ?? "").matchAll(/[A-Za-z]{4,20}/g)) {
        const range = document.createRange();
        range.setStart(n, m.index ?? 0);
        range.setEnd(n, (m.index ?? 0) + m[0].length);
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top)));
        if (lines.size >= 3) {
          seen.add(sid);
          const box = host.getBoundingClientRect();
          out.push(`At ${vw}px in #${sid}, ${name(host)} is squeezed to ${Math.round(box.width)}px wide, so the word "${m[0]}" breaks letter by letter over ${lines.size} lines. Its grid track or flex item has collapsed: give it a real width (minmax(<min>,1fr), flex-basis, or fewer columns).`);
          break;
        }
      }
    }
  }

  // 5d. Text drawn on top of other text: two pieces of copy (including ::before/::after labels such as an
  // "EVIDENCE" tab pulled up with a negative top) whose lines overlap. Faint or aria-hidden ghost words don't count.
  {
    type Box = { l: number; t: number; r: number; b: number; label: string; el: Element };
    const faint = (el: Element) => {
      if (el.closest("[aria-hidden=true]")) return true;
      let o = 1;
      for (let a: Element | null = el; a; a = a.parentElement) o *= Number(getComputedStyle(a).opacity) || 0;
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).color);
      const alpha = m ? Number(m[1].split(/[ ,/]+/).filter(Boolean)[3] ?? 1) : 1;
      return o * alpha < 0.4;
    };
    const bySection = new Map<string, Box[]>();
    // A text rect is the font's whole content area, much taller than the glyphs (and than the line, when display
    // type is set tight), so each line counts only as a band of 0.7em around its middle: stacked headlines with
    // leading under 1 pass, a label sitting on a kicker doesn't.
    const add = (sid: string, b: Box, fs: number) => {
      const c = (b.t + b.b) / 2;
      const l = bySection.get(sid) ?? [];
      l.push({ ...b, t: c - fs * 0.35, b: c + fs * 0.35 });
      bySection.set(sid, l);
    };
    // A stamp or sticker turned at an angle is meant to sit over the copy.
    const tilted = (el: Element) => {
      for (let a: Element | null = el, i = 0; a && i < 3; a = a.parentElement, i++) {
        const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(a).transform);
        if (m && Math.abs(Number(m[1].split(",")[1])) > 0.02) return true;
        if (getComputedStyle(a).rotate !== "none" && getComputedStyle(a).rotate !== "0deg") return true;
      }
      return false;
    };
    // What part of the page an element can show through: its overflow-clipping ancestors' boxes intersected.
    const window_ = (el: Element) => {
      let l = -1e9, t = -1e9, r = 1e9, b = 1e9;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (!/(hidden|clip|auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
        const ar = a.getBoundingClientRect();
        l = Math.max(l, ar.left); t = Math.max(t, ar.top); r = Math.min(r, ar.right); b = Math.min(b, ar.bottom);
      }
      return { l, t, r, b };
    };
    for (const el of document.querySelectorAll(".ss-code-body section[data-block-id] *")) {
      const sid = el.closest("section")?.getAttribute("data-block-id");
      if (!sid || el.closest("[data-ss-widget]") || getComputedStyle(el).position === "fixed" || !visible(el) || faint(el) || tilted(el)) continue;
      // Answers inside a closed <details> aren't on the page.
      const shut = el.closest("details:not([open])");
      if (shut && !el.closest("summary")) continue;
      const win = window_(el);
      // The element's own text, line by line.
      for (const t of el.childNodes) {
        if (t.nodeType !== 3 || !(t.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
        for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2 && r.right > win.l + 2 && r.left < win.r - 2 && r.bottom > win.t + 2 && r.top < win.b - 2) add(sid, { l: r.left, t: r.top, r: r.right, b: r.bottom, label: `"${(t.textContent ?? "").trim().slice(0, 32)}" (${name(el).split(">")[0]}>)`, el }, fs);
      }
      // Text in its ::before / ::after, placed from the pseudo-element's own offsets.
      for (const ps of ["::before", "::after"]) {
        const cs = getComputedStyle(el, ps);
        const txt = /^["'](.+)["']$/.exec(cs.content)?.[1]?.trim();
        if (!txt || cs.display === "none" || Number(cs.opacity) < 0.4) continue;
        const er = el.getBoundingClientRect();
        const fsz = parseFloat(cs.fontSize) || 12;
        const w = txt.length * fsz * 0.62 + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const h = (parseFloat(cs.lineHeight) || fsz * 1.25) + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        let l = er.left, t = er.top;
        if (cs.position === "absolute" || cs.position === "fixed") {
          if (cs.left !== "auto") l = er.left + parseFloat(cs.left);
          else if (cs.right !== "auto") l = er.right - parseFloat(cs.right) - w;
          if (cs.top !== "auto") t = er.top + parseFloat(cs.top);
          else if (cs.bottom !== "auto") t = er.bottom - parseFloat(cs.bottom) - h;
        } else continue; // in-flow pseudo text pushes its neighbours; it can't overlap them
        add(sid, { l, t, r: l + w, b: t + h, label: `"${txt.slice(0, 32)}" (a ${ps} label on ${name(el).split(">")[0]}>)`, el }, fsz);
      }
    }
    for (const [sid, boxes] of bySection) {
      let hit: string | null = null;
      for (let a = 0; a < boxes.length && !hit; a++) for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a], B = boxes[b];
        if (A.el === B.el) continue;
        const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l), oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (ox > 4 && oy > 1) { hit = `${A.label} and ${B.label}`; break; }
      }
      if (hit) out.push(`At ${vw}px in #${sid}, text is drawn on top of other text: ${hit} overlap. Give the label its own space (padding or margin on its parent, or move it) so no copy sits on other copy.`);
    }
  }

  // 6. Hero fits the first screen at desktop.
  const hero = sections.find((s) => /hero/i.test(s.getAttribute("data-block-id") ?? "")) ?? sections[1];
  if (hero && vw >= 900) {
    const h1 = hero.querySelector("h1, [data-el=headline]");
    const r = h1?.getBoundingClientRect();
    if (r && r.bottom + sy > 900) out.push(`At ${vw}×900 the hero headline ends ${Math.round(r.bottom + sy)}px down, below the first screen; tighten the hero so headline and action show without scrolling.`);
  }
  // 7. Text that is hard to read: the text colour (with its alpha and every ancestor's opacity) against the colour
  // behind it (ancestor background colours and gradient stops, composited from the page down), scored by WCAG:
  // 4.5:1 for body text, 3:1 for large text. Text over a picture can't be measured this way and is left to the
  // screenshots; decorative text marked aria-hidden doesn't count.
  if (vw >= 900) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    type C = [number, number, number, number];
    const memo = new Map<string, C | null>();
    const rgba = (s: string): C | null => {
      if (memo.has(s)) return memo.get(s)!;
      let v: C | null = null;
      if (cx) {
        cx.clearRect(0, 0, 1, 1);
        cx.fillStyle = "#000";
        cx.fillStyle = s;
        cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        v = [d[0], d[1], d[2], d[3] / 255];
      }
      memo.set(s, v);
      return v;
    };
    const over = (top: C, under: C): C => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as C;
    const lum = (c: C) => {
      const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: C, b: C) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = (c: C) => `#${c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
    const COLOR = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
    const bgMemo = new Map<Element, C | null>();
    // The colour behind an element's content, or null when a picture is part of it.
    const behind = (el: Element | null): C | null => {
      if (!el) return [255, 255, 255, 1];
      if (bgMemo.has(el)) return bgMemo.get(el)!;
      const under = behind(el.parentElement);
      let c: C | null = under;
      if (c) {
        const cs = getComputedStyle(el);
        const own = rgba(cs.backgroundColor);
        if (own && own[3] > 0) c = over(own, c);
        const img = cs.backgroundImage;
        if (img && img !== "none") {
          if (/url\(/.test(img)) c = null;
          else {
            const stops = (img.match(COLOR) ?? []).map(rgba).filter((x): x is C => !!x);
            if (stops.length) {
              const avg = [0, 1, 2, 3].map((i) => stops.reduce((s, x) => s + x[i], 0) / stops.length) as C;
              c = over(avg, c);
            }
          }
        }
      }
      bgMemo.set(el, c);
      return c;
    };
    const fails: Array<{ el: Element; r: number; need: number; fg: C; bg: C }> = [];
    const texts = [...document.querySelectorAll(".ss-code-body *")].filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && /\S{2,}/.test(n.textContent ?? "")) && !el.closest("[aria-hidden=true]") && visible(el)).slice(0, 700);
    for (const el of texts) {
      const cs = getComputedStyle(el);
      if (/text/.test(cs.backgroundClip + ((cs as unknown as Record<string, string>).webkitBackgroundClip ?? ""))) continue;
      const fill = rgba((cs as unknown as Record<string, string>).webkitTextFillColor || cs.color);
      if (!fill || fill[3] === 0) continue;
      const bg = behind(el);
      if (!bg) continue;
      let alpha = fill[3];
      for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) alpha *= Number(getComputedStyle(a).opacity);
      const fg = over([fill[0], fill[1], fill[2], alpha], bg);
      const size = parseFloat(cs.fontSize);
      const need = size >= 24 || (size >= 18.6 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
      const r = ratio(fg, bg);
      // A near miss (4.2:1) still reads fine; flag what a person would struggle with.
      if (r < need * 0.9) fails.push({ el, r, need, fg, bg });
    }
    // One line per section, worst first, so a whole low-contrast band reads as one fault with examples.
    const bySec = new Map<string, typeof fails>();
    for (const f of fails) {
      const id = f.el.closest("section")?.getAttribute("data-block-id") ?? "page";
      bySec.set(id, [...(bySec.get(id) ?? []), f]);
    }
    for (const [id, fs] of [...bySec].sort((a, b) => Math.min(...a[1].map((f) => f.r)) - Math.min(...b[1].map((f) => f.r))).slice(0, 4)) {
      fs.sort((a, b) => a.r - b.r);
      const ex = fs.slice(0, 3).map((f) => `${name(f.el)} is ${hex(f.fg)} on ${hex(f.bg)} (${f.r.toFixed(1)}:1, needs ${f.need}:1)`).join("; ");
      out.push(`In #${id}, ${fs.length} text ${fs.length === 1 ? "element is" : "elements are"} hard to read: ${ex}. Change the text colour (or that background) so every pair reaches at least 4.5:1 for body text and 3:1 for large headings; use a dark text colour on a bright or light background, and don't fade text with opacity.`);
    }
  }

  const tiny = [...document.querySelectorAll(".ss-code-body *")].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 2) && parseFloat(getComputedStyle(el).fontSize) < 10.5 && visible(el)).length;
  if (tiny > 3) out.push(`At ${vw}px, ${tiny} text elements are smaller than 11px; raise them to at least 11px.`);
  return out;
}

/**
 * Renders and measures the page (HTML, or a URL to load). Null when no browser is available. `shots: false` only
 * measures (quick, for checking an edit); `full: false` keeps the two first-screen shots and skips the long page.
 */
export async function inspect(html: string, opts: { shots?: boolean; full?: boolean } = {}): Promise<Inspection | null> {
  const wantShots = opts.shots !== false;
  const wantFull = wantShots && opts.full !== false;
  let chromium: typeof import("playwright-core").chromium;
  try { ({ chromium } = await import("playwright-core")); } catch { return null; }
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try { browser = await chromium.launch({ headless: true }); } catch { return null; }
  const issues: string[] = [];
  const shots: LocalImage[] = [];
  try {
    // One page, loaded once and resized for the phone pass: loading fonts and pictures twice was most of the time.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      if (/^https?:\/\//.test(html)) await page.goto(html, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
      else await page.setContent(html, { waitUntil: "load", timeout: 20_000 }).catch(() => {});
      for (const [w, h] of [[1280, 900], [390, 844]] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        // Web fonts load lazily; measuring with a fallback font hides real overflow, so load every face in use first.
        await page.evaluate(async () => {
          const faces = new Set<string>();
          for (const el of document.querySelectorAll(".ss-code-body h1, .ss-code-body h2, .ss-code-body h3, .ss-code-body p, .ss-code-body [data-el], .ss-code-body a")) {
            const cs = getComputedStyle(el);
            faces.add(`${cs.fontStyle} ${cs.fontWeight} 32px ${cs.fontFamily}`);
          }
          await Promise.all([...faces].slice(0, 24).map((f) => document.fonts.load(f).catch(() => null)));
          await document.fonts.ready;
        }).catch(() => {});
        await page.waitForTimeout(w === 1280 ? 300 : 200);
        issues.push(...(await page.evaluate(lint, w)));
        if (!wantShots) continue;
        const first = await page.screenshot({ type: "jpeg", quality: 70 });
        shots.push({ media: "image/jpeg", data: first.toString("base64"), label: `Review screenshot: the first screen at ${w}×${h}` });
        if (w === 1280 && wantFull) {
          // The whole page, scaled so it stays legible to the model (tall pages are split in two).
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          const step = Math.min(Math.max(height / 2, 2400), 4000);
          for (let y = h, n = 0; y < height && n < 2; y += step, n++) {
            const part = await page.screenshot({ type: "jpeg", quality: 60, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(step, height - y) } });
            shots.push({ media: "image/jpeg", data: part.toString("base64"), label: `Review screenshot: the page from ${y}px to ${Math.round(Math.min(y + step, height))}px at ${w}px wide` });
          }
        }
      }
    } finally {
      await page.close().catch(() => {});
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
