import { askRich, type LocalImage } from "../llm";
import { priorityModels } from "../keyscope";
import { sanitizeCss, sanitizeSection } from "../sanitize";
import type { Asset, Block, PendingComment, Project, SiteSpec } from "../spec";
import { WIDGET_DOC } from "./principles";
import { normalizeSection, openAttr, parseSite } from "./stream";
import { repair } from "./codegen";
import { inspect, staticPage } from "./review";

// Edits on a generated-code site. The editor sees the brief, the facts it may use, the stylesheet and the sections
// the comments are about (every section for a whole-page request), and answers in the same tag format the site was
// written in, so HTML never has to be escaped inside JSON:
//   <edit><summary>…</summary>
//     <patch target="hero"><find>exact text</find><replace>new text</replace></patch>   (small, surgical changes)
//     <patch target="css"><find>exact css</find><replace>new css</replace></patch>
//     <css mode="append|replace">…</css>
//     <section data-block-id="hero">…</section>                                           (a whole section rewritten)
//     <section data-block-id="new-id" data-block-label="Label" data-after="hero">…</section><remove id="faq"/>
//   </edit>
//
// The way the strongest builders edit:
// - Patches first (search-and-replace on the exact current text, like Lovable's edits): the reply is a few lines
//   instead of whole sections, so it's faster and can't quietly change parts nobody asked about. A patch that doesn't
//   match is never guessed at: the editor is asked again for those parts in full.
// - Small requests take a fast lane (like v0's quick edits): a one-line text, colour or size change on one or two
//   elements goes to each provider's small model with thinking off, patches only. Anything it can't apply cleanly
//   falls through to the full editor, so the fast lane can only save time, never lose a change.
// - Every edit is measured in a real browser afterwards. If it introduced a layout fault (overflow, a headline
//   breaking mid-word, panels misaligned…), one fix pass runs with screenshots before the person sees it.

const WHOLE = /\b(whole|entire|every|all|site|page|overall|everything|darker|lighter|colou?rs?|palette|fonts?|type(face)?|style|vibe|look|feel|theme|redesign|restyle|animation|motion)\b/i;
/** Requests that are too big for the fast lane: structure, several places, the overall look, new pictures. */
const BIG = /\b(add|new|another|insert|remove|delete|drop|move|reorder|rearrange|swap|redesign|rebuild|redo|restyle|rewrite|layout|section|animat\w*|motion|gallery|carousel|grid|columns?|whole|entire|every|all|site|page|overall|everything|darker|lighter|palette|fonts?|typeface|vibe|look|feel|theme|style)\b/i;

function system(spec: SiteSpec, knowledge: string | undefined, quick: boolean): string {
  const b = spec.code?.brief;
  return `You edit a one-page token website that devit designed and wrote as HTML + CSS. Keep its art direction unless the request changes it.
${b ? `Its concept: ${b.concept}\nArchetype: ${b.archetype}. Signature: ${b.signature}` : ""}

Answer in this exact format and nothing else:
<edit>
<summary>one or two sentences on what you changed, in plain words</summary>
<patch target="SECTION_ID"><find>exact text copied from that section</find><replace>what replaces it</replace></patch>   (repeat <find>/<replace> pairs inside one patch for several spots)
<patch target="css"><find>exact text copied from the stylesheet</find><replace>what replaces it</replace></patch>
${quick ? "" : `<css mode="append">…only new or overriding rules…</css>            (or mode="replace" with the full stylesheet when the look changes broadly)
<section data-block-id="EXISTING_ID">…the full new HTML of that section…</section>   (only when its structure changes)
<section data-block-id="NEW_ID" data-block-label="Label" data-after="EXISTING_ID">…</section>   (a new section, placed after that one)
<remove id="EXISTING_ID"/>   (removes a section)
`}</edit>

Change only what the request asks for. Never remove, reword or move other text or elements, even when they seem redundant after the change; if you think something else should change too, say so in the summary instead.

How to change things, smallest first:
- Text, a link, an attribute, one element, a class: a <patch> on that section.
- A colour, size, spacing or one rule: a <patch target="css"> on the rule${quick ? "" : `, or <css mode="append"> with an overriding rule`}. Site-wide colour changes go through the tokens (.ss-code{--bg:…;--text:…;--accent:…}) so the widgets follow.
${quick ? "- This is a quick edit: use patches only." : "- Rewrite a whole <section> only when its structure has to change. Never resend a section just to change a few words in it."}
- <find> must be copied character for character from what you were shown (same attributes, quotes, entities and spacing) and long enough to occur exactly once: a whole tag or a full line, not a single word. Patches you don't need: leave them out.

Rules (a sanitiser enforces them): plain HTML/CSS, no scripts, no event handlers, no forms or iframes. Every CSS selector starts with .ss-code; own classes use an x- prefix; never style .ss-* classes. Keep data-el on editable text. Images only from the allowed list; links only real https URLs already on the page or given. Never invent numbers, partners or dates; live figures use widgets/binds. Keep it working at 360px wide.
${WIDGET_DOC}
${knowledge?.trim() ? `The team's standing instructions (always follow): ${knowledge.trim().slice(0, 1500)}` : ""}`;
}

export interface CodeEditResult { spec: SiteSpec; message: string; via: string }

interface Attempt { spec: SiteSpec; message: string; via: string; failed: Array<{ target: string; find: string }>; changed: number }

interface AttemptOpts {
  whole: boolean;
  quick: boolean;
  review?: { request: string; shots: LocalImage[] };
  /** Said to the editor after the requests (a retry for patches that didn't match). */
  note?: string;
  /** Only these sections are shown (a retry). */
  only?: Set<string>;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const trimNl = (s: string) => s.replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");

/** Replaces `find` in `src` when it occurs exactly once (exactly, else ignoring whitespace differences). */
export function applyPatch(src: string, find: string, replace: string): string | null {
  if (find.trim().length < 3) return null;
  const at = src.indexOf(find);
  if (at >= 0 && src.indexOf(find, at + 1) < 0) return src.slice(0, at) + replace + src.slice(at + find.length);
  const re = new RegExp(find.trim().split(/\s+/).map(escRe).join("\\s+"), "g");
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) return null;
  const i = hits[0].index!;
  return src.slice(0, i) + replace + src.slice(i + hits[0][0].length);
}

function requestsText(comments: PendingComment[]): string {
  return comments.map((c) => `- on "${c.blockLabel}" (${c.blockId})${c.element ? `, element ${c.element}` : ""}: ${c.text}${c.context ? `\n  context from their connectors: ${c.context}` : ""}`).join("\n");
}

async function attempt(project: Project, spec: SiteSpec, comments: PendingComment[], o: AttemptOpts): Promise<Attempt | null> {
  const code = spec.code!;
  const assets = new Map((project.assets ?? []).map((a) => [a.id, a]));
  const ids = new Set(comments.map((c) => c.blockId));
  const shown = spec.blocks.filter((b) => b.type === "html" && (o.only ? o.only.has(b.id) : o.whole || ids.has(b.id)));
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
${o.review ? o.review.request : ""}${requestsText(comments)}${o.note ? `\n\n${o.note}` : ""}`;
  // The fast lane runs the small model unless the owner's plan buys the big one for everything; either way it skips
  // thinking and answers in a few lines.
  const lane = o.quick
    ? { tier: priorityModels() ? ("heavy" as const) : ("light" as const), maxOut: 4000, timeoutMs: 45_000, think: "off" as const }
    : { tier: "heavy" as const, maxOut: o.review ? 24000 : 16000, timeoutMs: o.review ? 240_000 : 180_000, think: o.review ? ("medium" as const) : ("low" as const) };
  const res = await askRich(
    { system: system(spec, project.knowledge, o.quick), user, images: pics.map((a) => a.url), files: o.review?.shots, ...lane },
    (t) => /<\/edit>/i.test(t) || /<\/patch>/i.test(t) || (/<section\b/i.test(t) && /<\/section>/i.test(t)) || /<css\b[\s\S]*<\/css>/i.test(t),
  );
  if (!res) return null;
  const text = res.text;
  const next: SiteSpec = structuredClone(spec);
  const nextCode = next.code!;
  nextCode.images = images;
  const ctx = { images };
  const failed: Attempt["failed"] = [];
  let changed = 0;

  // Patches apply to the text the editor was shown, so they go first.
  let css = code.css;
  let cssTouched = false;
  const patched = new Map<string, string>();
  for (const pm of text.matchAll(/<patch\s+target\s*=\s*["']([^"']+)["']\s*>([\s\S]*?)<\/patch>/gi)) {
    const target = pm[1].trim().toLowerCase();
    for (const fr of pm[2].matchAll(/<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/gi)) {
      const find = trimNl(fr[1]);
      const replace = trimNl(fr[2]);
      if (target === "css") {
        const out = applyPatch(css, find, replace);
        if (out == null) failed.push({ target, find });
        else { css = out; cssTouched = true; }
        continue;
      }
      const block = next.blocks.find((b) => b.id === target && b.type === "html");
      const src = patched.get(target) ?? (block ? String(block.props.html) : null);
      const out = src == null ? null : applyPatch(src, find, replace);
      if (out == null) failed.push({ target, find });
      else patched.set(target, out);
    }
  }
  for (const [id, html] of patched) {
    const at = next.blocks.findIndex((b) => b.id === id);
    const label = String(next.blocks[at].props.label ?? "Section");
    next.blocks[at] = { ...next.blocks[at], props: { ...next.blocks[at].props, html: sanitizeSection(normalizeSection(html, id, label), ctx) } };
    changed++;
  }
  const body = text.replace(/<patch\b[\s\S]*?<\/patch>/gi, "");

  const cssTag = /<css\b([^>]*)>([\s\S]*?)<\/css>/i.exec(body);
  if (cssTag && /mode\s*=\s*["']?replace/i.test(cssTag[1])) { css = cssTag[2]; cssTouched = true; }
  else if (cssTag) { css = `${css}\n${cssTag[2]}`; cssTouched = true; }
  if (cssTouched) { nextCode.css = sanitizeCss(css, ctx); changed++; }

  if (!o.quick) {
    for (const m of body.matchAll(/<remove\s+id\s*=\s*["']([^"']+)["']\s*\/?>/gi)) {
      const i = next.blocks.findIndex((b) => b.id === m[1]);
      if (i >= 0) { next.blocks.splice(i, 1); changed++; }
    }
    // parseSite wants a stylesheet before sections; give it an empty one so only the edit's sections are read.
    const { sections } = parseSite(`<style></style>${body.replace(/<css\b[\s\S]*?<\/css>/i, "")}`);
    for (const raw of sections) {
      const id = (openAttr(raw, "data-block-id") ?? "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
      if (!id) continue;
      const at = next.blocks.findIndex((b) => b.id === id);
      if (at >= 0) {
        const label = String(next.blocks[at].props.label ?? "Section");
        next.blocks[at] = { ...next.blocks[at], props: { ...next.blocks[at].props, html: sanitizeSection(normalizeSection(raw, id, label), ctx) } };
        // A full rewrite supersedes any patch on the same section.
        for (let k = failed.length - 1; k >= 0; k--) if (failed[k].target === id) failed.splice(k, 1);
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
  }
  if (changed) next.blocks = repair(next.blocks, !!next.token, next.ticker, images);
  if (failed.length) console.warn(`[edit] ${failed.length} patch(es) didn't match (${[...new Set(failed.map((f) => f.target))].join(", ")}) via ${res.via}`);
  if (process.env.DEVIT_EDIT_DEBUG) console.log(`[edit] ${o.quick ? "quick" : "full"} reply:\n${text}`);
  const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(text)?.[1]?.trim() || "Done.";
  return { spec: next, message: summary, via: res.via, failed, changed };
}

/** Whether a set of comments is small enough for the fast lane. */
export function isQuick(comments: PendingComment[], wholePage: boolean, hasPictures: boolean): boolean {
  if (hasPictures || !comments.length || comments.length > 3) return false;
  return comments.every((c) => !c.context && c.text.length <= 200 && !BIG.test(c.text) && !(wholePage && WHOLE.test(c.text)));
}

/**
 * Applies comments to a code site. Null when no model answered usably (or it changed nothing). `review` is the
 * post-build design review: a whole-page request with screenshots instead of a person's comments.
 */
export async function editCode(project: Project, comments: PendingComment[], wholePage = false, review?: { request: string; shots: LocalImage[] }): Promise<CodeEditResult | null> {
  const spec = project.spec!;
  const whole = wholePage || !!review || comments.some((c) => WHOLE.test(c.text) && c.text.split(/\s+/).length <= 40 && /\b(make|change|turn|use|more|less|redo|switch)\b/i.test(c.text));
  if (review) {
    const r = await attempt(project, spec, [], { whole: true, quick: false, review });
    return r && r.changed ? { spec: r.spec, message: r.message, via: r.via } : null;
  }

  // Measured before the edit (while the editor works), so the check afterwards can tell what the edit itself broke.
  const beforeP = inspect(staticPage(spec.code!, spec.blocks), { shots: false }).catch(() => null);
  const hasPics = comments.some((c) => c.assets?.length);
  let done: Attempt | null = null;
  let lane = "";

  if (isQuick(comments, wholePage, hasPics)) {
    const q = await attempt(project, spec, comments, { whole, quick: true });
    if (q && q.changed && !q.failed.length) { done = q; lane = " · quick edit"; }
  }
  if (!done) {
    const full = await attempt(project, spec, comments, { whole, quick: false });
    if (!full) return null;
    done = full;
    // Patches that didn't match: ask once more for just those parts, on top of what did apply.
    if (full.failed.length) {
      const targets = new Set(full.failed.map((f) => f.target));
      const only = new Set([...targets].filter((t) => t !== "css"));
      const retry = await attempt(project, full.spec, comments, {
        whole: false, quick: false, only,
        note: `Your previous answer was applied except these patches, whose <find> text didn't match the current code exactly (shown again above, as it is now): ${full.failed.map((f) => `${f.target}: "${f.find.slice(0, 120)}"`).join("; ")}. Make only those remaining changes now${only.size ? `: send each of those sections in full (<section data-block-id="…">)` : ""}${targets.has("css") ? `${only.size ? ", and" : ":"} put stylesheet changes in <css mode="append">` : ""}. Don't repeat changes that were already applied.`,
      });
      if (retry && retry.changed) done = { ...retry, message: `${full.message} ${retry.message}`.trim(), changed: full.changed + retry.changed };
    }
    if (!done.changed) return null;
  }

  // The check: measure the edited page; if the edit added layout faults, one fix pass with screenshots.
  const [before, after] = await Promise.all([beforeP, inspect(staticPage(done.spec.code!, done.spec.blocks), { shots: false }).catch(() => null)]);
  if (before && after && after.issues.length > before.issues.length) {
    const fresh = after.issues.filter((x) => !before.issues.includes(x));
    const seen = await inspect(staticPage(done.spec.code!, done.spec.blocks), { full: false }).catch(() => null);
    const fix = await attempt(project, done.spec, [], {
      whole: true, quick: false,
      review: {
        request: `You just made this change for the team:\n${requestsText(comments)}\nIt introduced layout faults, measured in a real browser at desktop and phone width (screenshots attached). Fix them while keeping the requested change; prefer patches and CSS:\n${(fresh.length ? fresh : after.issues).map((x) => `- ${x}`).join("\n")}\n`,
        shots: seen?.shots ?? [],
      },
    });
    if (fix && fix.changed) {
      const check = await inspect(staticPage(fix.spec.code!, fix.spec.blocks), { shots: false }).catch(() => null);
      if (!check || check.issues.length < after.issues.length) {
        done = { ...done, spec: fix.spec, message: `${done.message} Then fixed a layout problem the change caused.` };
      }
    }
  }
  return { spec: done.spec, message: done.message, via: `${done.via}${lane}` };
}
