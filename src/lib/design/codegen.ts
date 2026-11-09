import { askRich } from "../llm";
import { sanitizeCss, sanitizeSection } from "../sanitize";
import type { Block, DesignBrief, Dossier, SiteCode, TokenInfo } from "../spec";
import { fontPair, fontStacks, FONT_PAIRS } from "./fonts";
import { INSPIRATIONS, INSPIRATION_RULES, inspirationShots, inspirationText, type Inspiration } from "./inspiration";
import { learnedRefs } from "./learned";
import { codegenSystem } from "./principles";
import { normalizeSection, openAttr, parseSite } from "./stream";

// Pass 3: the code. The writer gets the dossier (what it may say), the brief (how it should look and the section
// plan), the real links and pictures, and writes the whole site; finished sections are handed to `onSection` as they
// stream so the preview fills in. Then everything is sanitised, normalised and checked: buy + CA present when there
// is a token, tokens defined with safe contrast, unique ids.

export interface CodegenInput {
  dossier: Dossier;
  brief: DesignBrief;
  token: TokenInfo | null;
  name: string;
  ticker: string;
  links: Array<{ label: string; url: string }>;
  images: string[];
}

export interface CodegenOut { code: SiteCode; blocks: Block[] }

const citedIn = (b: DesignBrief, all: Inspiration[]) => all.filter((r) => (b.inspiration ?? []).some((x) => x.ref === r.id));

function userMessage(i: CodegenInput, cited: Inspiration[]): string {
  const fp = fontPair(i.brief.fontPair) ?? FONT_PAIRS[0];
  const st = fontStacks(fp);
  const t = i.token;
  return `PROJECT: ${i.name} ($${i.ticker})${t ? `, contract ${t.address}` : ", no token yet"}

DOSSIER (the only source of facts):
${JSON.stringify({ ...i.dossier, via: undefined })}

BRIEF:
${JSON.stringify({ ...i.brief, via: undefined, sections: undefined })}

FONTS LOADED: display ${fp.display}, body ${fp.body}, mono ${fp.mono}. Token values: --font-display:${st.display}; --font-body:${st.body}; --font-mono:${st.mono}.

SECTION PLAN (build exactly these, in this order, with these data-block-id / data-block-label):
${i.brief.sections.map((s, n) => `${n + 1}. id="${s.id}" label="${s.label}" widgets=[${s.widgets.join(", ")}]\n   purpose: ${s.purpose}\n   content: ${s.content}\n   composition: ${s.composition}`).join("\n")}

LINKS (only these URLs):
${i.links.map((l) => `${l.label}: ${l.url}`).join("\n") || "none"}

${cited.length ? `REFERENCES THE ART DIRECTOR DREW ON (screenshots attached; the brief's "inspiration" says what to borrow):\n${inspirationText(cited)}\n${INSPIRATION_RULES}\n\n` : ""}IMAGES (only these URLs):
${i.images.map((u, n) => `${n === 0 ? "logo" : `image ${n + 1}`}: ${u}`).join("\n") || "none (draw everything in SVG/CSS)"}

Write the site now.`;
}

/** Our authoritative tokens appended last (double class beats the writer's), so contrast and widgets are always right. */
function tokenCss(b: DesignBrief): string {
  const fp = fontPair(b.fontPair) ?? FONT_PAIRS[0];
  const st = fontStacks(fp);
  const c = b.palette;
  return `\n.ss-code.ss-code{--bg:${c.bg};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--border:${c.border};--accent:${c.accent};--accent-text:${c.accentText};--radius:${Math.round(b.radius)}px;--r-sm:${Math.min(Math.round(b.radius), 12)}px;--font-display:${st.display};--font-body:${st.body};--font-mono:${st.mono};color:var(--text);font-family:var(--font-body)}\n.ss-code-body img{max-width:100%;height:auto}.ss-code-body *{min-width:0}`;
}

const hasWidget = (html: string, kind: string) => new RegExp(`data-ss-widget\\s*=\\s*["']${kind}["']`, "i").test(html);

/** Turns parsed sections into blocks: plan ids/labels, unique ids, sanitised. */
function toBlocks(sections: string[], brief: DesignBrief, images: string[]): Block[] {
  const seen = new Set<string>();
  return sections.map((raw, n) => {
    const plan = brief.sections.find((s) => s.id === openAttr(raw, "data-block-id")) ?? brief.sections[n];
    let id = (plan?.id ?? openAttr(raw, "data-block-id") ?? `section-${n + 1}`).replace(/[^a-z0-9-]/gi, "").toLowerCase() || `section-${n + 1}`;
    while (seen.has(id)) id = `${id}-${n + 1}`;
    seen.add(id);
    const label = plan?.label ?? openAttr(raw, "data-block-label") ?? `Section ${n + 1}`;
    const html = sanitizeSection(normalizeSection(raw, id, label), { images });
    return { id, type: "html", props: { label, html } } as Block;
  });
}

/** A buy area in the site's own tokens, for when the writer left it out. */
function buyFallback(ticker: string): string {
  return `<section data-block-id="buy" data-block-label="Buy"><div style="max-width:560px;margin:0 auto;padding:clamp(56px,8vw,96px) 20px;display:grid;gap:18px"><h2 data-el="headline" style="font-family:var(--font-display);font-size:clamp(32px,6vw,56px);line-height:1;margin:0">Get $${ticker}</h2><div data-ss-widget="buy"></div><div data-ss-widget="ca"></div></div></section>`;
}

const WALLET_SLOT = /<div\b[^>]*data-ss-widget=["']wallet["'][^>]*>\s*<\/div>/gi;

/**
 * One action in the header: a Buy link. A wallet button beside it made two competing calls to action (and the buy
 * box connects wallets anyway), so it goes; a header with only a wallet button gets a Buy link in its place.
 */
export function oneHeaderAction(blocks: Block[]): Block[] {
  const header = blocks.find((b, i) => i === 0 && (/head|nav|signal|top/i.test(`${b.id} ${String(b.props.label ?? "")}`) || /<nav\b/i.test(String(b.props.html ?? ""))));
  if (!header) return blocks;
  const html = String(header.props.html ?? "");
  if (!WALLET_SLOT.test(html)) return blocks;
  WALLET_SLOT.lastIndex = 0;
  const hasCta = /data-el=["']cta["']/i.test(html);
  const buyAt = blocks.find((b) => hasWidget(String(b.props.html ?? ""), "buy"))?.id;
  const link = buyAt && !hasCta
    ? `<a href="#${buyAt}" data-el="cta" style="display:inline-flex;align-items:center;padding:.65em 1.15em;background:var(--accent);color:var(--accent-text);border-radius:var(--r-sm,8px);font-weight:700;text-decoration:none">Buy</a>`
    : "";
  if (!hasCta && !link) return blocks; // nothing to buy with: the wallet button is the only action, keep it
  let first = true;
  header.props.html = html.replace(WALLET_SLOT, () => { const out = first ? link : ""; first = false; return out; });
  return blocks;
}

/** Makes sure the live parts a token site needs are there. Mutates and returns blocks. */
export function repair(blocks: Block[], hasToken: boolean, ticker: string, images: string[]): Block[] {
  if (!hasToken) return blocks;
  oneHeaderAction(blocks);
  const all = () => blocks.map((b) => String(b.props.html ?? "")).join("\n");
  if (!hasWidget(all(), "buy")) {
    const [b] = toBlocks([buyFallback(ticker)], { sections: [] } as unknown as DesignBrief, images);
    if (blocks.some((x) => x.id === "buy")) b.id = "buy-now";
    const footerAt = blocks.length > 1 && /foot/i.test(String(blocks[blocks.length - 1].props.label)) ? blocks.length - 1 : blocks.length;
    blocks.splice(footerAt, 0, b);
  }
  if (!hasWidget(all(), "ca")) {
    const host = blocks.find((b) => hasWidget(String(b.props.html), "buy"));
    if (host) host.props.html = String(host.props.html).replace(/(<div\b[^>]*data-ss-widget="buy"[^>]*>\s*<\/div>)/i, `$1<div data-ss-widget="ca" style="margin-top:14px"></div>`);
  }
  return blocks;
}

/**
 * Writes the site. `onSection` gets the sanitised blocks so far (and the CSS) each time a section finishes. Returns
 * null when no model produced at least a stylesheet and three sections.
 */
export async function writeSite(i: CodegenInput, onSection?: (soFar: CodegenOut, label: string) => void): Promise<(CodegenOut & { via: string }) | null> {
  const fonts = (fontPair(i.brief.fontPair) ?? FONT_PAIRS[0]).params;
  let shown = 0;
  const build = (css: string | null, sections: string[], via?: string): CodegenOut => {
    const blocks = toBlocks(sections, i.brief, i.images);
    return { code: { css: sanitizeCss((css ?? "") + tokenCss(i.brief), { images: i.images }), fonts, brief: i.brief, dossier: i.dossier, images: i.images, via }, blocks };
  };
  const cited = citedIn(i.brief, [...INSPIRATIONS, ...(await learnedRefs())]);
  const res = await askRich(
    {
      system: codegenSystem(),
      user: userMessage(i, cited),
      images: i.images.slice(0, 3),
      files: await inspirationShots(cited),
      maxOut: 24000,
      timeoutMs: 300_000,
      temperature: 0.8,
      // The thinking happened in the dossier and brief; the writer executes the plan and streams from the first token.
      think: "off",
      onText: (text) => {
        if (!onSection || text.lastIndexOf("</section") < 0) return;
        const p = parseSite(text);
        if (p.css == null || p.sections.length <= shown) return;
        shown = p.sections.length;
        const out = build(p.css, p.sections);
        onSection(out, String(out.blocks[out.blocks.length - 1]?.props.label ?? ""));
      },
    },
    (text) => {
      const p = parseSite(text);
      return p.css != null && p.sections.length >= 3;
    },
  );
  if (!res) return null;
  const p = parseSite(res.text);
  const out = build(p.css, p.sections, res.via);
  out.blocks = repair(out.blocks, !!i.token, i.ticker, i.images);
  return { ...out, via: res.via };
}
