import { askRich, type LocalImage } from "../llm";
import { sanitizeCss, sanitizeSection } from "../sanitize";
import type { Asset, Block, PendingComment, Project, SiteSpec } from "../spec";
import { WIDGET_DOC } from "./principles";
import { normalizeSection, openAttr, parseSite } from "./stream";
import { repair } from "./codegen";

// Edits on a generated-code site. The editor sees the brief, the facts it may use, the stylesheet and the sections
// the comments are about (every section for a whole-page request), and answers in the same tag format the site was
// written in, so HTML never has to be escaped inside JSON:
//   <edit><summary>…</summary><css mode="append|replace">…</css><section data-block-id="hero">…</section>
//   <section data-block-id="new-id" data-block-label="Label" data-after="hero">…</section><remove id="faq"/></edit>

const WHOLE = /\b(whole|entire|every|all|site|page|overall|everything|darker|lighter|colou?rs?|palette|fonts?|type(face)?|style|vibe|look|feel|theme|redesign|restyle|animation|motion)\b/i;

function system(spec: SiteSpec, knowledge: string | undefined): string {
  const b = spec.code?.brief;
  return `You edit a one-page token website that devit designed and wrote as HTML + CSS. Keep its art direction unless the request changes it.
${b ? `Its concept: ${b.concept}\nArchetype: ${b.archetype}. Signature: ${b.signature}` : ""}

Answer in this exact format and nothing else:
<edit>
<summary>one or two sentences on what you changed, in plain words</summary>
<css mode="append">…only new or overriding rules…</css>            (or mode="replace" with the full stylesheet when the look changes broadly; omit when CSS is unchanged)
<section data-block-id="EXISTING_ID">…the full new HTML of that section…</section>   (only sections you change)
<section data-block-id="NEW_ID" data-block-label="Label" data-after="EXISTING_ID">…</section>   (a new section, placed after that one)
<remove id="EXISTING_ID"/>   (removes a section)
</edit>

Rules (a sanitiser enforces them): plain HTML/CSS, no scripts, no event handlers, no forms or iframes. Every CSS selector starts with .ss-code; own classes use an x- prefix; never style .ss-* classes. Keep data-el on editable text. Images only from the allowed list; links only real https URLs already on the page or given. Never invent numbers, partners or dates; live figures use widgets/binds. Palette changes go through the tokens (.ss-code{--bg:…;--text:…;--accent:…}) so the widgets follow. Keep it working at 360px wide.
${WIDGET_DOC}
${knowledge?.trim() ? `The team's standing instructions (always follow): ${knowledge.trim().slice(0, 1500)}` : ""}`;
}

export interface CodeEditResult { spec: SiteSpec; message: string; via: string }

/**
 * Applies comments to a code site. Null when no model answered usably (or it changed nothing). `review` is the
 * post-build design review: a whole-page request with screenshots instead of a person's comments.
 */
export async function editCode(project: Project, comments: PendingComment[], wholePage = false, review?: { request: string; shots: LocalImage[] }): Promise<CodeEditResult | null> {
  const spec = project.spec!;
  const code = spec.code!;
  const assets = new Map((project.assets ?? []).map((a) => [a.id, a]));
  const whole = wholePage || !!review || comments.some((c) => WHOLE.test(c.text) && c.text.split(/\s+/).length <= 40 && /\b(make|change|turn|use|more|less|redo|switch)\b/i.test(c.text));
  const ids = new Set(comments.map((c) => c.blockId));
  const shown = spec.blocks.filter((b) => b.type === "html" && (whole || ids.has(b.id)));
  const pics = comments.flatMap((c) => (c.assets ?? []).map((id) => assets.get(id)).filter((a): a is Asset => !!a));
  const images = [...new Set([...code.images, ...pics.map((a) => a.url)])];
  const d = code.dossier;
  const user = `${d ? `FACTS YOU MAY USE:\n${d.facts.map((f) => `- ${f.claim} (${f.source})`).join("\n")}\n\n` : ""}ALL SECTIONS (in order): ${spec.blocks.map((b) => `${b.id} "${String(b.props.label ?? b.type)}"`).join(", ")}

STYLESHEET:
${code.css.slice(0, 40_000)}

SECTIONS TO WORK ON:
${shown.map((b) => String(b.props.html)).join("\n\n")}

ALLOWED IMAGES: ${images.join(" ") || "none"}${pics.length ? `\nNEW UPLOADED IMAGES (use where asked): ${pics.map((a) => `${a.url} (${a.w}x${a.h})`).join(", ")}` : ""}

REQUESTS:
${review ? review.request : ""}${comments.map((c) => `- on "${c.blockLabel}" (${c.blockId})${c.element ? `, element ${c.element}` : ""}: ${c.text}${c.context ? `\n  context from their connectors: ${c.context}` : ""}`).join("\n")}`;
  const res = await askRich({ system: system(spec, project.knowledge), user, images: pics.map((a) => a.url), files: review?.shots, maxOut: review ? 24000 : 16000, timeoutMs: review ? 240_000 : 180_000, think: review ? "medium" : "low" }, (t) => /<\/edit>/i.test(t) || (/<section\b/i.test(t) && /<\/section>/i.test(t)) || /<css\b[\s\S]*<\/css>/i.test(t));
  if (!res) return null;
  const text = res.text;
  const next: SiteSpec = structuredClone(spec);
  const nextCode = next.code!;
  nextCode.images = images;
  const ctx = { images };

  const css = /<css\b([^>]*)>([\s\S]*?)<\/css>/i.exec(text);
  if (css) {
    const replace = /mode\s*=\s*["']?replace/i.test(css[1]);
    // Our authoritative token block stays last only on a full replace from the writer's own tokens.
    nextCode.css = sanitizeCss(replace ? css[2] : `${code.css}\n${css[2]}`, ctx);
  }
  for (const m of text.matchAll(/<remove\s+id\s*=\s*["']([^"']+)["']\s*\/?>/gi)) {
    const i = next.blocks.findIndex((b) => b.id === m[1]);
    if (i >= 0) next.blocks.splice(i, 1);
  }
  // parseSite wants a stylesheet before sections; give it an empty one so only the edit's sections are read.
  const { sections } = parseSite(`<style></style>${text.replace(/<css\b[\s\S]*?<\/css>/i, "")}`);
  let changed = 0;
  for (const raw of sections) {
    const id = (openAttr(raw, "data-block-id") ?? "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
    if (!id) continue;
    const at = next.blocks.findIndex((b) => b.id === id);
    if (at >= 0) {
      const label = String(next.blocks[at].props.label ?? "Section");
      next.blocks[at] = { ...next.blocks[at], props: { ...next.blocks[at].props, html: sanitizeSection(normalizeSection(raw, id, label), ctx) } };
    } else {
      const label = openAttr(raw, "data-block-label") || "Section";
      const after = openAttr(raw, "data-after");
      const clean = raw.replace(/\sdata-after\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
      const block: Block = { id, type: "html", props: { label, html: sanitizeSection(normalizeSection(clean, id, label), ctx) } };
      const ai = after ? next.blocks.findIndex((b) => b.id === after) : -1;
      next.blocks.splice(ai >= 0 ? ai + 1 : Math.max(0, next.blocks.length - 1), 0, block);
    }
    changed++;
  }
  if (!changed && !css && next.blocks.length === spec.blocks.length) return null;
  next.blocks = repair(next.blocks, !!next.token, next.ticker, images);
  const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(text)?.[1]?.trim() || "Done.";
  return { spec: next, message: summary, via: res.via };
}
