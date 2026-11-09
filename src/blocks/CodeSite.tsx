import type { CSSProperties } from "react";
import type { SiteSpec } from "@/lib/spec";
import { cleanFontParam, sanitizeCss, sanitizeSection } from "@/lib/sanitize";
import { SITE_CSS, themeVars } from "./css";
import { MotionFx, type Mode } from "./client/parts";
import { CodeIslands } from "./client/islands";
import { CodeMotion } from "./client/motion";
import { MOTION_CSS, motionOf } from "./motion";

// A generated-code site (spec.code): the model's own stylesheet and section HTML, sanitised again on every render,
// with our live widgets mounted into its data-ss-widget slots. Each section keeps data-block-id / data-el, so the
// builder's click-to-comment and double-click text editing work exactly as on block sites.

const ROOT = "ss-code-root";
// Layout guards the model's CSS can't undo. A widget slot keeps block layout: a site once set its stats slot to a
// 4-column grid, the stats mounted as the slot's one child, got a quarter of the width and broke letter by letter.
// The model may still size and space a slot (width, margins, min-height). Motion: blocks/motion.ts.
const HOOKS = `.ss-code [data-ss-widget]:not([data-ss-widget=toasts]){display:block!important;grid-template:none!important;columns:auto!important;min-width:0}.ss-code-body{overflow-x:clip}` + MOTION_CSS;

/** Short stable hash, so React's <style href> dedupe swaps the sheet when the CSS changes. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Theme tokens at zero specificity: the model's own `.ss-code { --bg: … }` wins, widgets always have values. */
function baseVars(spec: SiteSpec): string {
  const v = themeVars(spec.theme);
  return `:where(.ss-code){${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(";")}}`;
}

export function CodeSite({ spec, mode, walletconnect = null, privy = null, credit = null }: { spec: SiteSpec; mode: Mode; walletconnect?: string | null; privy?: string | null; credit?: string | null }) {
  const code = spec.code!;
  const ctx = { images: code.images };
  // One stylesheet per family: a family Google refuses can't take the others down with it.
  const families = code.fonts.map(cleanFontParam).filter((p): p is string => !!p);
  const fonts = families.length ? families.map((p) => `https://fonts.googleapis.com/css2?${p}&display=swap`) : [spec.theme.fontsHref];
  const css = HOOKS + baseVars(spec) + sanitizeCss(code.css, ctx);
  const html = spec.blocks.filter((b) => b.type === "html").map((b) => sanitizeSection(String(b.props.html ?? ""), ctx)).join("\n");
  return (
    <>
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} precedence="default" />)}
      <style href="ss-site-css" precedence="default">{SITE_CSS}</style>
      <style href={`ss-code-${hash(css)}`} precedence="high">{css}</style>
      <div className="ss ss-code" data-ss-mode={mode} data-ss-motion={motionOf(code.brief?.archetype)} data-dark={spec.theme.dark ? "" : undefined} style={{ background: "var(--bg)" } as CSSProperties}>
        {mode === "live" && <div className="ss-progress" aria-hidden="true" />}
        {mode === "live" && <div className="ss-pulse" aria-hidden="true" />}
        <div id={ROOT} className="ss-code-body" dangerouslySetInnerHTML={{ __html: html }} />
        <CodeIslands rootId={ROOT} spec={spec} mode={mode} walletconnect={walletconnect} privy={privy} />
        <CodeMotion rootId={ROOT} mode={mode} spec={spec} />
        {credit && <div className="ss-credit" style={{ padding: "16px 20px", textAlign: "center" }}><a className="ss-built" href={credit} target="_blank" rel="noopener">Built with <b>devit</b></a></div>}
        <MotionFx mode={mode} toTop progress nav={false} />
      </div>
    </>
  );
}
