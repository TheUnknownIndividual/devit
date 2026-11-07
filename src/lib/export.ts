import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import type { Project } from "./spec";

// "Export code": the site as a standalone Next.js app the team owns. It carries the same block library the builder
// renders with (every file Site.tsx reaches, found by following its imports), the spec as site.json, and a rewrite that
// sends /api/* (live price, trades, quotes, NEAR Intents) to this devit server, so the live parts keep working
// without any keys. Used by the zip download and the GitHub push.

const ROOT = process.cwd();
const ENTRY = "src/blocks/Site.tsx";
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

export interface ExportFile { path: string; data: Buffer }

async function resolve(from: string, spec: string): Promise<string | null> {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const f = base + ext;
    if (await readFile(f).then(() => true, () => false) && /\.(tsx?|json)$/.test(f)) return f;
  }
  return null;
}

/** Every source file the renderer reaches, and the npm packages they import. */
async function closure(): Promise<{ files: string[]; packages: Set<string> }> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const walk = async (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = await readFile(f, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      const r = await resolve(f, spec);
      if (r) await walk(r);
      else if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("node:")) packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    }
  };
  await walk(path.join(ROOT, ENTRY));
  return { files: [...seen], packages };
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "site";
export const repoNameFor = (p: Project) => `${slugify(p.spec?.name || p.name || "site")}-site`;

export async function exportFiles(p: Project, origin: string, credit: string | null): Promise<ExportFile[]> {
  if (!p.spec) throw new Error("not ready");
  const { files, packages } = await closure();
  const ours = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const deps: Record<string, string> = { next: ours.dependencies.next, react: ours.dependencies.react, "react-dom": ours.dependencies["react-dom"] };
  for (const name of [...packages].sort()) if (ours.dependencies[name]) deps[name] = ours.dependencies[name];
  const dev: Record<string, string> = {};
  for (const name of ["typescript", "@types/react", "@types/react-dom", "@types/node"]) if (ours.devDependencies?.[name]) dev[name] = ours.devDependencies[name];

  const name = repoNameFor(p);
  const out: ExportFile[] = [];
  const add = (f: string, data: string | Buffer) => out.push({ path: f, data: typeof data === "string" ? Buffer.from(data) : data });
  for (const f of files) add(path.relative(ROOT, f), await readFile(f));
  for (const f of await readdir(path.join(ROOT, "public/wallets")).catch(() => [] as string[])) add(`public/wallets/${f}`, await readFile(path.join(ROOT, "public/wallets", f)));

  // Signup forms post to devit through the /api rewrite; the slug tells it which site's list they're for.
  const spec = { ...p.spec, blocks: p.spec.blocks.map((b) => (b.type === "signup" ? { ...b, props: { ...b.props, slug: p.published?.slug ?? p.slug } } : b)) };
  add("src/app/site.json", JSON.stringify(spec, null, 2));
  add("src/app/page.tsx", `import { Site } from "@/blocks/Site";
import type { SiteSpec } from "@/lib/spec";
import site from "./site.json";

// The whole site is site.json rendered by the block library in src/blocks. Edit the JSON (copy, order, theme) or the blocks.
export default function Page() {
  return <Site spec={site as unknown as SiteSpec} mode="live" walletconnect={${JSON.stringify(p.integrations.walletconnectProjectId ?? null)}} privy={${JSON.stringify(p.integrations.privyAppId ?? null)}} credit={${JSON.stringify(credit)}} />;
}
`);
  add("src/app/layout.tsx", `import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: ${JSON.stringify(`${spec.name} ($${spec.ticker})`)}, description: ${JSON.stringify(spec.tagline)} };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ margin: 0 }}>{children}</body></html>;
}
`);
  add("next.config.mjs", `// Live data (price, trades, quotes, NEAR Intents buys) comes from the devit API this site was built on.
// Point SITESMITH_API at your own deployment of devit to serve it yourself.
const API = process.env.SITESMITH_API || ${JSON.stringify(origin)};

/** @type {import('next').NextConfig} */
export default {
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: "/api/:path*", destination: \`\${API}/api/:path*\` }];
  },
};
`);
  add("tsconfig.json", JSON.stringify({
    compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./src/*"] } },
    include: ["next-env.d.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
    exclude: ["node_modules"],
  }, null, 2));
  add("package.json", JSON.stringify({ name, private: true, version: "0.1.0", scripts: { dev: "next dev", build: "next build", start: "next start" }, dependencies: deps, devDependencies: dev }, null, 2));
  add(".gitignore", "node_modules\n.next\n.env*\n");
  add("README.md", `# ${spec.name} ($${spec.ticker})

${spec.tagline}

Built with [devit](${origin}). This is the full site as a Next.js app.

## Run it

1. \`npm install\`
2. \`npm run dev\`, then open http://localhost:3000

## Change it

- **Copy, sections, colours:** \`src/app/site.json\` (the theme, then one entry per block, in page order).
- **How a block looks or works:** \`src/blocks/\` (\`Site.tsx\` renders every block; \`client/parts.tsx\` has the live chart, trades and buy box).

## Live data

Requests to \`/api/*\` (price, trades, swap quotes, NEAR Intents cross-chain buys) are forwarded to devit by \`next.config.mjs\`. Set \`SITESMITH_API\` to use another devit server.

## Signup forms

A signup block posts to \`/api/forms\`, which saves entries to the database connected in devit (Database in the builder toolbar). Entries land in a \`sitesmith_signups\` table in your own Neon or Supabase Postgres, so you can also read them with your own \`DATABASE_URL\`. The site must be published on devit for the form to take entries.

## Deploy

Any Next.js host works: \`npm run build && npm start\`, or import the repo on Vercel or Cloudflare.
`);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------- zip ----------

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b: Buffer) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

/** A plain deflate zip, everything under one folder. */
export function zip(files: ExportFile[], folder: string): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(`${folder}/${f.path}`);
    const body = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(f.data.length, 22);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(0, 30); c.writeUInt32LE(0, 34); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
