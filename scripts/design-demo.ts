// `node --env-file=.env.local --import ./scripts/ts-loader.mjs --experimental-strip-types scripts/design-demo.ts <ca> [out-dir]`
// Runs the generated-code pipeline (research → palette → dossier → brief → code) for one token outside the app and
// writes the dossier, brief and a static preview (widgets show as labelled boxes) for a quick look.
import { promises as fs } from "node:fs";
import path from "node:path";
import { tokenContext } from "../src/lib/chain.ts";
import { research } from "../src/lib/research.ts";
import { paletteOf } from "../src/lib/palette.ts";
import { direct, imagesOf, remember, understand, type DesignInput } from "../src/lib/design/brief.ts";
import { writeSite } from "../src/lib/design/codegen.ts";

const ca = process.argv[2];
const dir = process.argv[3] ?? "/tmp/devit-demo";
if (!ca) throw new Error("usage: design-demo.ts <contract> [out-dir]");
await fs.mkdir(dir, { recursive: true });
const t0 = Date.now();
const lap = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);

const token = await tokenContext(ca);
lap(`token ${token?.name} $${token?.symbol}`);
const found = await research(token, {});
lap(`research ${found.links.map((l) => l.type).join(",")} posts=${found.x?.posts.length ?? 0}`);
const palette = await paletteOf(token?.logo ?? found.x?.profile.avatar, token?.header ?? found.x?.profile.banner);
lap(`palette ${palette?.swatches.map((s) => s.hex).join(" ")} lean=${palette?.lean}`);
const input: DesignInput = { prompt: `website for ${ca}`, token, chain: token?.chain ?? "near", research: found, palette, name: token?.name ?? "", ticker: token?.symbol ?? "", tagline: "" };
const dossier = await understand(input);
if (!dossier) throw new Error("no dossier");
lap(`dossier via ${dossier.via}: ${dossier.oneLiner} · facts=${dossier.facts.length}`);
await fs.writeFile(path.join(dir, "dossier.json"), JSON.stringify(dossier, null, 2));
const brief = await direct(input, dossier);
if (!brief) throw new Error("no brief");
lap(`brief via ${brief.via}: ${brief.archetype} / ${brief.fontPair} / ${brief.light ? "light" : "dark"} · ${brief.sections.map((s) => s.id).join(",")}`);
await fs.writeFile(path.join(dir, "brief.json"), JSON.stringify(brief, null, 2));
await remember(brief);
const links = (found.links ?? []).map((l) => ({ label: l.label, url: l.url }));
const out = await writeSite({ dossier, brief, token, name: token?.name ?? "", ticker: token?.symbol ?? "", links, images: imagesOf(input) }, (s, label) => lap(`  section ${s.blocks.length}: ${label}`));
if (!out) throw new Error("no site");
lap(`site via ${out.via}: ${out.blocks.length} sections, css ${out.code.css.length} chars`);
const fonts = out.code.fonts.map((p) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${p}&display=swap">`).join("");
const stub = `[data-ss-widget]{min-height:120px;border:1px dashed var(--accent);border-radius:var(--radius);display:grid;place-items:center;color:var(--muted);font:12px var(--font-mono)}[data-ss-widget]::before{content:"widget: " attr(data-ss-widget)}[data-ss-widget=chart]{min-height:380px}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}<style>body{margin:0}${out.code.css}${stub}</style></head><body><div class="ss ss-code" style="background:var(--bg)"><div class="ss-code-body">${out.blocks.map((b) => b.props.html).join("\n")}</div></div></body></html>`;
await fs.writeFile(path.join(dir, "index.html"), html);
await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(out, null, 2));
lap(`wrote ${dir}/index.html`);
