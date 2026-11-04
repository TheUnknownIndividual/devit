// Headless smoke check: node scripts/smoke.mjs <base-url> [projectId...]. Pages load with no page errors and no
// horizontal overflow at desktop and phone width; live pages show the free credit, load no Privy code without an
// App ID, and open the wallet picker.
import { chromium } from "playwright-core";
const B = process.argv[2] || "http://localhost:3100", ids = process.argv.slice(3);
const b = await chromium.launch({ channel: "chrome" });
let fails = 0; const ok = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); if (!c) fails++; };
for (const [w, h] of [[1280, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  for (const path of ["/", "/pricing", "/projects", "/settings", ...ids.flatMap((i) => [`/live/${i}`, `/build/${i}`, `/preview/${i}`])]) {
    const p = await ctx.newPage(); const errs = [], reqs = [];
    p.on("pageerror", (e) => errs.push(e.message)); p.on("request", (r) => reqs.push(r.url()));
    const r = await p.goto(B + path, { waitUntil: "load", timeout: 60000 }); await p.waitForTimeout(2500);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`${w} ${path}`, r.status() < 400 && !errs.length && sw <= w, `status=${r.status()} sw=${sw} ${errs.slice(0, 2).join(" | ")}`);
    if (path.startsWith("/live/")) {
      ok(`${w} ${path} free credit`, (await p.locator(".ss-built").count()) > 0);
      ok(`${w} ${path} no privy code`, !reqs.some((u) => /privy/i.test(u)));
      const wb = p.locator('[data-el="wallet"] button').first();
      if (w === 1280 && (await wb.count())) { await wb.click(); await p.waitForTimeout(1200); ok(`${path} wallet picker opens`, (await p.getByText(/Detected|WalletConnect|Phantom|MetaMask|HOT/i).count()) > 0); }
    }
    await p.close();
  }
  await ctx.close();
}
await b.close(); console.log(fails ? `${fails} failed` : "all passed"); process.exit(fails ? 1 : 0);
