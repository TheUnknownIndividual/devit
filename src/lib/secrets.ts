import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// API keys people bring are sealed with AES-256-GCM before they touch disk. The key is SECRETS_KEY (64 hex chars);
// without it a local dev key is made once in data/accounts/.secrets-key. Production refuses to run without one.

let cached: Buffer | null = null;

function secretKey(): Buffer {
  if (cached) return cached;
  const env = process.env.SECRETS_KEY?.trim();
  if (env) {
    const b64 = /^[A-Za-z0-9+/=_-]{43,44}$/.test(env) ? Buffer.from(env, "base64") : null;
    cached = /^[0-9a-f]{64}$/i.test(env) ? Buffer.from(env, "hex") : b64?.length === 32 ? b64 : createHash("sha256").update(env).digest();
    return cached;
  }
  if (process.env.NODE_ENV === "production") throw new Error("SECRETS_KEY is not set");
  const file = path.join(process.cwd(), "data", "accounts", ".secrets-key");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
    console.warn("[sitesmith] No SECRETS_KEY set: made a local dev key in data/accounts/.secrets-key. Set SECRETS_KEY in production.");
  }
  cached = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  return cached;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url")}`;
}

export function unseal(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed.replace(/^v1\./, ""), "base64url");
    const d = createDecipheriv("aes-256-gcm", secretKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
