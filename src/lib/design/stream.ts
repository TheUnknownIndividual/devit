// Reads the code writer's <site><style>…</style><section>…</section>…</site> as it streams (after bolt.new's
// StreamingMessageParser): the stylesheet once its tag closes, and each top-level section as soon as its closing tag
// arrives, so the builder's preview fills in section by section.

export interface Parsed { css: string | null; sections: string[]; done: boolean }

/** Parses whatever has arrived so far. Unclosed tags are left for the next call. */
export function parseSite(text: string): Parsed {
  const style = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(text);
  const css = style ? style[1] : null;
  const from = style ? style.index + style[0].length : 0;
  const sections: string[] = [];
  // Depth-count <section> so a stray nested one can't cut a section short.
  const re = /<section\b|<\/section\s*>/gi;
  re.lastIndex = from;
  let depth = 0;
  let start = -1;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0][1] !== "/") {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        sections.push(text.slice(start, m.index + m[0].length));
        start = -1;
      }
    }
  }
  return { css, sections, done: /<\/site>\s*$/i.test(text.trim()) };
}

const ATTR = (name: string) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");

/** An attribute of the section's opening tag. */
export function openAttr(html: string, name: string): string | null {
  const open = /^<section\b[^>]*>/i.exec(html)?.[0] ?? "";
  const m = ATTR(name).exec(open);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Rewrites the section's opening tag so the builder can find it: id, data-block-id/-type/-label set by us. */
export function normalizeSection(html: string, id: string, label: string): string {
  return html.replace(/^<section\b([^>]*)>/i, (_m, attrs: string) => {
    const kept = attrs.replace(/\s(id|data-block-id|data-block-type|data-block-label)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<section id="${esc(id)}" data-block-id="${esc(id)}" data-block-type="html" data-block-label="${esc(label)}"${kept}>`;
  });
}
