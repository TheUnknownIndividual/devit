import sanitizeHtml from "sanitize-html";

// Generated-code sites: the model writes each section's HTML and the site's CSS, and published sites serve them to
// anyone. Everything passes through here on save and again on render: no scripts, no event handlers, no frames or
// forms, no javascript: links, images only from the token's own sources, CSS without imports or foreign urls.
// The live parts (buy box, chart, wallet, signup) are our own React widgets mounted into data-ss-widget slots.

const SVG_TAGS = [
  "svg", "g", "path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textPath", "defs", "symbol", "use",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "filter", "title", "desc",
  "feTurbulence", "feColorMatrix", "feGaussianBlur", "feDisplacementMap", "feBlend", "feComposite", "feOffset", "feFlood", "feMerge", "feMergeNode",
  "feComponentTransfer", "feFuncR", "feFuncG", "feFuncB", "feFuncA", "feMorphology", "feSpecularLighting", "feDiffuseLighting", "fePointLight", "feDistantLight", "feTile", "feImage",
];
const HTML_TAGS = [
  "section", "header", "footer", "nav", "main", "article", "aside", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "a", "img", "picture", "figure", "figcaption", "ul", "ol", "li", "dl", "dt", "dd", "strong", "em", "b", "i", "u", "s", "small",
  "sup", "sub", "mark", "br", "hr", "blockquote", "q", "cite", "code", "pre", "kbd", "time", "abbr", "button",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "details", "summary", "marquee",
];
const SVG_ATTRS = [
  "viewBox", "xmlns", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "stroke-miterlimit", "fill-opacity", "fill-rule", "clip-rule", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "fx", "fy",
  "width", "height", "points", "transform", "opacity", "gradientUnits", "gradientTransform", "spreadMethod", "offset", "stop-color", "stop-opacity",
  "preserveAspectRatio", "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "textLength",
  "clip-path", "mask", "filter", "href", "baseFrequency", "numOctaves", "seed", "stitchTiles", "type", "values", "in", "in2", "result",
  "stdDeviation", "scale", "mode", "operator", "k1", "k2", "k3", "k4", "dx", "dy", "flood-color", "flood-opacity", "patternUnits",
  "patternContentUnits", "patternTransform", "maskUnits", "clipPathUnits", "filterUnits", "primitiveUnits", "pathLength", "vector-effect",
  "shape-rendering", "paint-order", "radius", "tableValues", "slope", "intercept", "amplitude", "exponent", "surfaceScale", "specularExponent",
  "lighting-color", "azimuth", "elevation", "startOffset", "method", "spacing", "rotate", "lengthAdjust", "xChannelSelector", "yChannelSelector",
];

/** Where a generated site may load pictures from, besides data:image and the exact URLs passed in. */
const IMAGE_HOSTS = /(^|\.)(dexscreener\.com|twimg\.com|nearly\.trade|devit\.lol|ipfs\.io|dweb\.link|nftstorage\.link|cloudflare-ipfs\.com|pinata\.cloud|mypinata\.cloud|arweave\.net|irys\.xyz|coingecko\.com|githubusercontent\.com|blockscout\.com|alchemy\.com|helius-rpc\.com|meme\.cooking|justhoot\.fun|filebase\.io)$/i;

export interface SanitizeCtx { images?: string[] }

function imageOk(url: string, ctx: SanitizeCtx): boolean {
  const u = url.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(u)) return true;
  if (ctx.images?.includes(u)) return true;
  try {
    const p = new URL(u);
    return p.protocol === "https:" && IMAGE_HOSTS.test(p.hostname);
  } catch {
    return false;
  }
}

function hrefOk(href: string): boolean {
  const h = href.trim();
  if (h.startsWith("#")) return /^#[A-Za-z0-9_-]*$/.test(h);
  return /^(https:\/\/|mailto:)/i.test(h) && !/[\s<>"]/.test(h);
}

/** One section's HTML, made safe to serve. */
export function sanitizeSection(html: string, ctx: SanitizeCtx = {}): string {
  return sanitizeHtml(html, {
    allowedTags: [...HTML_TAGS, ...SVG_TAGS],
    allowedAttributes: {
      "*": ["class", "id", "style", "role", "title", "lang", "dir", "hidden", "tabindex", "data-*", "aria-*", ...SVG_ATTRS],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      time: ["datetime"],
      button: ["type"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      details: ["open"],
    },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowProtocolRelative: false,
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
    // Unknown tags keep their text, never their markup.
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "template", "form", "input", "select"],
    transformTags: {
      "*": (tagName, attribs) => {
        const a = { ...attribs };
        if (a.style) { const s = cleanDeclarations(a.style, ctx); if (s) a.style = s; else delete a.style; }
        // SVG <use>/<textPath>/<feImage> may only point inside the page.
        if ("href" in a && tagName !== "a") { if (!/^#[A-Za-z0-9_-]+$/.test(a.href)) delete a.href; }
        if (tagName === "a") {
          if (!a.href || !hrefOk(a.href)) delete a.href;
          else if (!a.href.startsWith("#")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        }
        if (tagName === "button") a.type = "button";
        if (tagName === "img") { a.loading = a.loading === "eager" ? "eager" : "lazy"; a.decoding = "async"; }
        return { tagName, attribs: a };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !imageOk(frame.attribs.src ?? "", ctx),
  });
}

// ---------- CSS ----------

const BAD_DECL = /expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:|@import/i;

function cleanUrls(css: string, ctx: SanitizeCtx): string {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, u: string) => {
    if (/^#[A-Za-z0-9_-]+$/.test(u)) return m; // SVG filter/clip references
    if (/^https:\/\/fonts\.gstatic\.com\//i.test(u)) return m;
    return imageOk(u, ctx) ? `url("${u.replace(/["\\\n]/g, "")}")` : "none";
  });
}

/** An inline style attribute: drop declarations that could run code or reach outside. */
function cleanDeclarations(style: string, ctx: SanitizeCtx): string {
  return style
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !BAD_DECL.test(d) && !/[<>]/.test(d))
    .map((d) => cleanUrls(d, ctx))
    .join("; ");
}

/**
 * The site's stylesheet. Imports, @charset/@namespace and anything that could close the <style> tag go; url()s keep
 * only allowed pictures and Google's font files. Fonts load from SiteCode.fonts (a curated list), never from CSS.
 */
export function sanitizeCss(css: string, ctx: SanitizeCtx = {}): string {
  let out = css
    .replace(/<\/?\s*style[^>]*>/gi, "")
    .replace(/</g, "\\3c ")
    .replace(/@(import|charset|namespace)[^;{}]*;?/gi, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // Declarations, wherever they sit: drop the dangerous ones whole.
  out = out.replace(/([{;])\s*([^{};]*?(expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:)[^{};]*)(?=[;}])/gi, "$1");
  out = cleanUrls(out, ctx);
  return out.slice(0, 120_000);
}

/** Google Fonts params we accept: "family=Name:wght@400;700" shapes only. */
export function cleanFontParam(p: string): string | null {
  const s = p.trim().replace(/^family=/, "");
  return /^[A-Za-z0-9+ ]{2,40}(:[a-z,@;.0-9]{1,80})?$/.test(s) ? `family=${s.replace(/ /g, "+")}` : null;
}
