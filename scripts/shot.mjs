// `node scripts/shot.mjs <file-or-url> <out-prefix>`: full-page headless screenshots at 1280 and 390, plus a check that nothing is wider than the screen.
import { chromium } from "playwright-core";
const [src, out] = process.argv.slice(2);
const url = /^https?:/.test(src) ? src : `file://${src}`;
const b = await chromium.launch({ headless: true });
for (const w of [1280, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  // Scroll through so lazy images and scroll reveals load before the full-page shot.
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(1200);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  await p.screenshot({ path: `${out}-${w}.png`, fullPage: true });
  console.log(`${w}: scrollWidth=${sw}${sw > w ? " OVERFLOW" : ""}`);
  await p.close();
}
await b.close();
