import type { CSSProperties } from "react";
import type { SiteSpec } from "@/lib/spec";
import { cleanFontParam, sanitizeCss, sanitizeSection } from "@/lib/sanitize";
import { SITE_CSS, themeVars } from "./css";
import { MotionFx, type Mode } from "./client/parts";
import { CodeIslands } from "./client/islands";

// A generated-code site (spec.code): the model's own stylesheet and section HTML, sanitised again on every render,
// with our live widgets mounted into its data-ss-widget slots. Each section keeps data-block-id / data-el, so the
// builder's click-to-comment and double-click text editing work exactly as on block sites.

const ROOT = "ss-code-root";
// Motion hooks the model may use: [data-ss-reveal] fades and rises in on scroll (live view only; the builder's
// preview stays still so selecting is easy).
const HOOKS = `.ss-code[data-ss-mode=live] [data-ss-reveal]{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1);transition-delay:calc(var(--i,0)*70ms)}.ss-code[data-ss-mode=live] [data-ss-reveal].is-in{opacity:1;transform:none}@media (prefers-reduced-motion:reduce){.ss-code [data-ss-reveal]{opacity:1!important;transform:none!important}}.ss-code-body{overflow-x:clip}`;

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
      <div className="ss ss-code" data-ss-mode={mode} data-dark={spec.theme.dark ? "" : undefined} style={{ background: "var(--bg)" } as CSSProperties}>
        <div id={ROOT} className="ss-code-body" dangerouslySetInnerHTML={{ __html: html }} />
        <CodeIslands rootId={ROOT} spec={spec} mode={mode} walletconnect={walletconnect} privy={privy} />
        {credit && <div className="ss-credit" style={{ padding: "16px 20px", textAlign: "center" }}><a className="ss-built" href={credit} target="_blank" rel="noopener">Built with <b>devit</b></a></div>}
        <MotionFx mode={mode} toTop progress={false} nav={false} />
      </div>
    </>
  );
}
