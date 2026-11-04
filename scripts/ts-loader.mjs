// Lets plain node run the app's extensionless TypeScript imports: node scripts/... via `--import ./scripts/ts-loader.mjs`.
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && ctx.parentURL && !/\\.\\w+$/.test(spec)) {
    for (const ext of [".ts", "/index.ts"]) {
      const u = new URL(spec + ext, ctx.parentURL);
      if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
    }
  }
  return next(spec, ctx);
}`));
