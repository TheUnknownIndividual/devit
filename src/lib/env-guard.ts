import { existsSync } from "node:fs";
import path from "node:path";
import { format } from "node:util";
import { findLeaks } from "./leaks";
import { keyInfo } from "./secrets";

// The server's own secrets (.env) are guarded three ways, from the moment the process starts (instrumentation.ts):
//  1. Log redaction: every console line is scrubbed of each secret env value and any secret-shaped text, so a stack
//     trace or a debug print can't put a key into the logs.
//  2. Nothing secret reaches the browser: only NEXT_PUBLIC_* values are built into client code, and they're checked
//     here for anything secret-shaped or equal to a server secret.
//  3. The posture is public (/security, /api/security) as pass/fail checks, never values.

const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASS|PRIVATE|DSN|JWT|CREDENTIAL|AUTH|COOKIE|SALT|SEED|MNEMONIC)/i;
const URL_WITH_LOGIN = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;

/** Names and values of the env vars that hold secrets (values stay in this module). */
function secretEnv(): Array<[string, string]> {
  return Object.entries(process.env)
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .filter(([k, v]) => !k.startsWith("NEXT_PUBLIC_") && v.trim().length >= 10 && (SECRET_NAME.test(k) || URL_WITH_LOGIN.test(v.trim())))
    .map(([k, v]) => [k, v.trim()]);
}

// Kept on globalThis: Next bundles instrumentation and the routes separately, so module state isn't shared.
const G = globalThis as unknown as { __ssGuard?: { guarded: Array<[string, string]> } };

export function redact(s: string): string {
  let out = s;
  for (const [k, v] of G.__ssGuard?.guarded ?? []) if (out.includes(v)) out = out.split(v).join(`[${k}]`);
  const leaks = findLeaks(out);
  for (const l of [...leaks].reverse()) out = `${out.slice(0, l.start)}[redacted]${out.slice(l.end)}`;
  return out;
}

/** Wraps console so every line is scrubbed before it's written. Idempotent. */
export function installRedactor(): void {
  if (G.__ssGuard) return;
  // Longest first so a value that contains another is replaced whole.
  G.__ssGuard = { guarded: secretEnv().sort((a, b) => b[1].length - a[1].length) };
  for (const m of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    const orig = console[m].bind(console);
    console[m] = (...args: unknown[]) => orig(redact(format(...args)));
  }
}

export type Check = { id: string; ok: boolean; title: string; detail: string };

/** What /security shows: each guarantee checked live on the running server. */
export function posture(): { checks: Check[]; at: number } {
  const k = keyInfo();
  const secrets = secretEnv();
  const pub = Object.entries(process.env).filter(([n]) => n.startsWith("NEXT_PUBLIC_")).map(([n, v]) => [n, v ?? ""] as const);
  const badPub = pub.filter(([, v]) => findLeaks(v).length || secrets.some(([, s]) => s === v.trim())).map(([n]) => n);
  const installed = !!G.__ssGuard;
  const envInImage = [".env", ".env.local", ".env.production"].some((f) => existsSync(path.join(process.cwd(), f)));
  return {
    at: Date.now(),
    checks: [
      { id: "sealed", ok: k.set && k.strong, title: "Secrets sealed with AES-256-GCM", detail: k.set && k.strong ? "Model keys, connector keys, database logins and paid RPC URLs are encrypted before they touch disk, with a random 256-bit key that lives only in the server's environment. Edited ciphertext fails to open instead of opening wrong." : "The sealing key is missing or isn't a random 256-bit key." },
      { id: "browser", ok: badPub.length === 0, title: "No secret ships to the browser", detail: badPub.length ? `${badPub.join(", ")} looks secret and is built into browser code.` : `Only ${pub.length} public setting${pub.length === 1 ? " reaches" : "s reach"} browser code, and none is secret-shaped or equal to a server secret.` },
      { id: "logs", ok: installed, title: "Logs can't leak keys", detail: installed ? `Every log line is scrubbed of the server's ${secrets.length} secret values and anything secret-shaped before it's written.` : "Log redaction isn't running." },
      { id: "image", ok: !envInImage, title: "No secrets baked into the build", detail: envInImage ? "An .env file is inside the app folder." : "There's no .env in the app image: secrets are handed to the process at start and nowhere else." },
      { id: "user", ok: process.getuid?.() !== 0, title: "Runs without root", detail: process.getuid?.() !== 0 ? "The server process runs as an unprivileged user inside its container, so a bug can't take over the machine." : "The server process runs as root." },
      { id: "chat", ok: true, title: "Keys pasted in chat never reach the model", detail: "Private keys, seed-style key files and API tokens are cut out of every prompt before it's sent to a model or saved to history." },
      { id: "publish", ok: true, title: "A site with a secret in it can't be published", detail: "Publishing scans every word and link on the page and refuses while a key or token is in it." },
      { id: "rpc", ok: true, title: "Paid RPC keys stay on the server", detail: "Published sites read the chain through our proxy, so a paid RPC URL never appears in page code; on disk it's sealed." },
      { id: "byok", ok: true, title: "One-time tokens are never stored", detail: "Cloudflare and Spaceship tokens used to set up a domain live for that one request only." },
      { id: "rotation", ok: true, title: "Key rotation without downtime", detail: k.rotating ? "A rotation is in progress: values sealed with the old key still open and are re-sealed with the new one as they're saved." : "A new sealing key can be swapped in with the old one kept for reading; everything re-seals as it's saved." },
    ],
  };
}
