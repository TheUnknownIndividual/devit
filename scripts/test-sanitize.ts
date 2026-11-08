// `node --import ./scripts/ts-loader.mjs --experimental-strip-types scripts/test-sanitize.ts`: the generated-site sanitiser's must-strip cases.
import { sanitizeCss, sanitizeSection } from "../src/lib/sanitize.ts";

let bad = 0;
function no(label: string, out: string, re: RegExp) { if (re.test(out)) { bad++; console.log("FAIL", label, "→", out); } else console.log("ok  ", label); }
function yes(label: string, out: string, re: RegExp) { if (!re.test(out)) { bad++; console.log("FAIL", label, "→", out); } else console.log("ok  ", label); }

no("script", sanitizeSection(`<section><script>alert(1)</script><p>hi</p></section>`), /script|alert/i);
no("onerror", sanitizeSection(`<img src="https://cdn.dexscreener.com/a.png" onerror="alert(1)">`), /onerror/i);
no("javascript href", sanitizeSection(`<a href="javascript:alert(1)">x</a>`), /javascript/i);
no("svg use external", sanitizeSection(`<svg><use href="https://evil.com/x.svg#a"/></svg>`), /evil/);
no("foreign img", sanitizeSection(`<img src="https://evil.com/p.png">`), /evil/);
no("iframe", sanitizeSection(`<iframe src="https://evil.com"></iframe>`), /iframe|evil/);
no("form", sanitizeSection(`<form action="https://evil.com"><input name=p></form>`), /form|input|evil/);
no("style attr url", sanitizeSection(`<div style="background:url(https://evil.com/t.gif)">x</div>`), /evil/);
no("style attr expression", sanitizeSection(`<div style="width:expression(alert(1))">x</div>`), /expression/);
no("svg animate href", sanitizeSection(`<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>`), /javascript|animate/);
yes("keeps data-el + svg case", sanitizeSection(`<section data-block-id="hero" data-block-label="Hero"><h1 data-el="headline">Hi</h1><svg viewBox="0 0 10 10"><linearGradient id="g"/></svg><div data-ss-widget="buy"></div></section>`), /data-el="headline".*viewBox.*linearGradient.*data-ss-widget="buy"/s);
yes("keeps token image", sanitizeSection(`<img src="https://x.test/logo.png">`, { images: ["https://x.test/logo.png"] }), /x\.test/);
no("css import", sanitizeCss(`@import url(https://evil.com/a.css); .a{color:red}`), /import|evil/);
no("css close style", sanitizeCss(`.a{color:red}</style><script>alert(1)</script>`), /<\/style|<script/i);
no("css foreign url", sanitizeCss(`.a{background:url("https://evil.com/x.png") center}`), /evil/);
no("css expression", sanitizeCss(`.a{width:expression(alert(1));color:red}`), /expression/);
yes("css keeps vars + keyframes", sanitizeCss(`.ss{--bg:#111;--accent:#f0f}@keyframes up{from{opacity:0}to{opacity:1}}`), /--accent:#f0f.*@keyframes up/s);
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
