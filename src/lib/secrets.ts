import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Every secret people bring (model keys, connector keys, database logins, paid RPC URLs) is sealed with AES-256-GCM
// before it touches disk. The key is SECRETS_KEY (64 hex chars); without it a local dev key is made once in
// data/accounts/.secrets-key. Production refuses to run without one. GCM's tag means a sealed value that was edited
// on disk fails to open instead of opening wrong.
//
// Rotation: put the new key in SECRETS_KEY and the old one in SECRETS_KEY_PREV. Values still sealed with the old key
// keep opening, and are sealed with the new key the next time they're saved.

let cached: Buffer | null = null;
let prevCached: Buffer | null | undefined;

const parseKey = (env: string): { key: Buffer; strong: boolean } => {
  const b64 = /^[A-Za-z0-9+/=_-]{43,44}$/.test(env) ? Buffer.from(env, "base64") : null;
  if (/^[0-9a-f]{64}$/i.test(env)) return { key: Buffer.from(env, "hex"), strong: true };
  if (b64?.length === 32) return { key: b64, strong: true };
  return { key: createHash("sha256").update(env).digest(), strong: false };
};

/** For the security page: whether a real 256-bit key is set and rotation is in progress. Never the key. */
export function keyInfo(): { set: boolean; strong: boolean; rotating: boolean } {
  const env = process.env.SECRETS_KEY?.trim();
  return { set: !!env, strong: !!env && parseKey(env).strong, rotating: !!process.env.SECRETS_KEY_PREV?.trim() };
}

function prevKey(): Buffer | null {
  if (prevCached !== undefined) return prevCached;
  const env = process.env.SECRETS_KEY_PREV?.trim();
  prevCached = env ? parseKey(env).key : null;
  return prevCached;
}

function secretKey(): Buffer {
  if (cached) return cached;
  const env = process.env.SECRETS_KEY?.trim();
  if (env) {
    cached = parseKey(env).key;
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

function open(raw: Buffer, key: Buffer): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function unseal(sealed: string): string | null {
  const raw = Buffer.from(sealed.replace(/^v1\./, ""), "base64url");
  if (raw.length < 28) return null;
  const now = open(raw, secretKey());
  if (now !== null) return now;
  const prev = prevKey();
  return prev ? open(raw, prev) : null;
}

export const isSealed = (s: unknown): s is string => typeof s === "string" && /^v1\.[A-Za-z0-9_-]{38,}$/.test(s);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
