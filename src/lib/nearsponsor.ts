import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { rpcFor } from "./chain";
import { b58decode, b58encode } from "./solana";
import { ftBalance, isEthAccount, nativeBalance } from "./xbuy";

// Gas for a visitor's 0x account on NEAR. A NEAR transaction is paid from the signing account's own NEAR, and a buyer
// who only ever held ETH has none. The site's sponsor wallet sends a small amount, once a day per account, only to
// accounts that hold this site's token or wNEAR, under a daily cap. Unarmed unless the operator sets
// SPONSOR_NEAR_ACCOUNT and SPONSOR_NEAR_KEY (ed25519:<base58 secret>) and funds that account.

const YOCTO = 10n ** 24n;
const near = (v: string | undefined, d: string) => BigInt(Math.round(Number(v || d) * 1e6)) * 10n ** 18n;
const GRANT = () => near(process.env.SPONSOR_NEAR_AMOUNT, "0.05");
const DAILY = () => near(process.env.SPONSOR_NEAR_DAILY, "2");
/** Below this the account gets a top-up: enough to attach 300 Tgas (≈0.03 NEAR) to a swap call. */
const LOW = 35n * 10n ** 21n;
const WNEAR_MIN = 10n ** 23n; // 0.1 wNEAR

const FILE = path.join(process.cwd(), "data", "sponsor.json");
interface Ledger { day: string; spent: string; accounts: Record<string, number> }

export const sponsorArmed = () => !!(process.env.SPONSOR_NEAR_ACCOUNT?.trim() && process.env.SPONSOR_NEAR_KEY?.trim());

async function load(): Promise<Ledger> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const l = JSON.parse(await readFile(FILE, "utf8")) as Ledger;
    if (l.day === day) return l;
    const cutoff = Date.now() - 86_400_000;
    return { day, spent: "0", accounts: Object.fromEntries(Object.entries(l.accounts ?? {}).filter(([, t]) => t > cutoff)) };
  } catch {
    return { day, spent: "0", accounts: {} };
  }
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const r = await fetch(rpcFor("near"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const j = (await r.json()) as { result?: T; error?: { data?: unknown; message?: string } };
  if (!j.result) throw new Error(typeof j.error?.data === "string" ? j.error.data : j.error?.message || "NEAR RPC error");
  return j.result;
}

// ---------- a NEAR Transfer, borsh by hand ----------

const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const uint = (n: bigint, bytes: number) => { const b = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) { b[i] = Number(n & 0xffn); n >>= 8n; } return b; };
const str = (s: string) => { const e = new TextEncoder().encode(s); return [u32(e.length), e]; };
const cat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

async function transfer(to: string, amount: bigint): Promise<string> {
  const signer = process.env.SPONSOR_NEAR_ACCOUNT!.trim();
  const secret = b58decode(process.env.SPONSOR_NEAR_KEY!.trim().replace(/^ed25519:/, ""));
  const seed = secret.slice(0, 32);
  const pub = ed25519.getPublicKey(seed);
  const key = await rpc<{ nonce: number; block_hash: string }>("query", { request_type: "view_access_key", finality: "final", account_id: signer, public_key: "ed25519:" + b58encode(pub) });
  const tx = cat([
    ...str(signer), new Uint8Array([0]), pub, uint(BigInt(key.nonce) + 1n, 8), ...str(to), b58decode(key.block_hash),
    u32(1), new Uint8Array([3]), uint(amount, 16), // one action: Transfer
  ]);
  const sig = ed25519.sign(sha256(tx), seed);
  const signed = cat([tx, new Uint8Array([0]), sig]);
  const r = await rpc<{ transaction?: { hash?: string } }>("send_tx", { signed_tx_base64: Buffer.from(signed).toString("base64"), wait_until: "EXECUTED_OPTIMISTIC" });
  return r.transaction?.hash ?? "";
}

let lock: Promise<unknown> = Promise.resolve();

export async function sponsorGas(account: string, token: string, minUsdOk: boolean): Promise<{ ok: true; tx: string | null; note?: string } | { error: string }> {
  if (!isEthAccount(account)) return { error: "Gas is only sent to 0x accounts." };
  if (await nativeBalance(account) >= LOW) return { ok: true, tx: null, note: "already has gas" };
  if (!sponsorArmed()) return { error: "This site can't cover NEAR gas yet. Send about 0.05 NEAR to your 0x address on NEAR and try again." };
  const [tok, wn] = await Promise.all([ftBalance(token, account), ftBalance("wrap.near", account)]);
  if (!((tok > 0n && minUsdOk) || wn >= WNEAR_MIN)) return { error: "Gas is only covered for accounts holding this token." };
  const next = lock.then(async () => {
    const l = await load();
    if ((l.accounts[account] ?? 0) > Date.now() - 86_400_000) return { error: "Gas was already sent to this account today." } as const;
    const grant = GRANT();
    if (BigInt(l.spent) + grant > DAILY()) return { error: "Today's gas budget is used up. Send about 0.05 NEAR to your 0x address and try again." } as const;
    const tx = await transfer(account, grant);
    l.spent = (BigInt(l.spent) + grant).toString();
    l.accounts[account] = Date.now();
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(l));
    return { ok: true, tx, note: `${Number(grant * 1000n / YOCTO) / 1000} NEAR for gas` } as const;
  });
  lock = next.catch(() => undefined);
  try { return await next; } catch (e) { return { error: (e as Error).message || "Couldn't send gas." }; }
}
