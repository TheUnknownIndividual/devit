// Published sites (slug.devit.lol, custom domains) only reach the API paths in SITE_API (src/lib/sites.ts).
// A widget that calls anything else works in the builder preview and fails on the live site ("No answer from the
// server"), so the build stops here instead.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync("src/lib/sites.ts", "utf8");
const m = /export const SITE_API = \/(.+)\/;/.exec(src);
if (!m) { console.error("check-site-api: SITE_API not found in src/lib/sites.ts"); process.exit(1); }
const allow = new RegExp(m[1]);
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(f)) files.push(p); } };
walk("src/blocks");
const bad = [];
for (const f of files) for (const [, path] of readFileSync(f, "utf8").matchAll(/["'`](\/api\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?)/gi)) if (!allow.test(path)) bad.push(`${f}: ${path}`);
if (bad.length) { console.error(`check-site-api: these paths are called by site widgets but blocked on published sites (add them to SITE_API):\n${[...new Set(bad)].join("\n")}`); process.exit(1); }
console.log(`check-site-api: ${files.length} widget files, every API path is reachable from published sites`);
