import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { rpcFor } from "./chain";
import { b58decode, b58encode } from "./solana";
import { ftBalance, isEthAccount, nativeBalance } from "./xbuy";

// The starter NEAR for a visitor's 0x account. NEAR's Ethereum relayer pays the gas for these accounts (checked on
// mainnet 2026-11-07: a 0-NEAR 0x account's call was signed and paid by m-eth-wallet.near), but token calls still attach
// deposits from the account itself: 1 yoctoNEAR on every transfer and 0.00125 NEAR per storage registration. A buyer who
// only ever held ETH has none, and wNEAR or tokens can't be spent without that first yocto.
// So the sponsor wallet fronts a few thousandths of a NEAR and the same trade pays it back (lib/xbuy.ts: a wNEAR
// transfer inside the swap, or a 1-Click app fee on a direct sell). The float refills itself; the caps below bound
// what an abandoned trade can cost. Unarmed unless the operator sets SPONSOR_NEAR_ACCOUNT and SPONSOR_NEAR_KEY
// (ed25519:<base58 secret>) and funds that account (registered with wrap.near).

const YOCTO = 10n ** 24n;
const near = (v: string | undefined, d: string) => BigInt(Math.round(Number(v || d) * 1e6)) * 10n ** 18n;
const GRANT = () => near(process.env.SPONSOR_NEAR_AMOUNT, "0.005");
const DAILY = () => near(process.env.SPONSOR_NEAR_DAILY, "0.5");
/** Enough for two storage registrations and the 1-yocto deposits of a sell. */
const LOW = 3n * 10n ** 21n;
const WNEAR_MIN = 10n ** 23n; // 0.1 wNEAR
const PER_ACCOUNT_DAY = 3;

const FILE = path.join(process.cwd(), "data", "sponsor.json");
interface Ledger { day: string; spent: string; accounts: Record<string, number[]>; owed: Record<string, string> }

export const sponsorArmed = () => !!(process.env.SPONSOR_NEAR_ACCOUNT?.trim() && process.env.SPONSOR_NEAR_KEY?.trim());
export const sponsorAccount = () => process.env.SPONSOR_NEAR_ACCOUNT?.trim() || null;

async function load(): Promise<Ledger> {
  const day = new Date().toISOString().slice(0, 10);
  const cutoff = Date.now() - 86_400_000;
  try {
    const l = JSON.parse(await readFile(FILE, "utf8")) as Partial<Ledger>;
    const accounts = Object.fromEntries(Object.entries(l.accounts ?? {}).map(([k, v]) => [k, (Array.isArray(v) ? v : [v as number]).filter((t) => t > cutoff)]).filter(([, v]) => (v as number[]).length));
    return { day, spent: l.day === day ? l.spent ?? "0" : "0", accounts, owed: l.owed ?? {} };
  } catch {
    return { day, spent: "0", accounts: {}, owed: {} };
  }
}
async function save(l: Ledger) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(l));
}

let lock: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn);
  lock = next.catch(() => undefined);
  return next;
}

/** What this account owes the sponsor; the next real quote builds the repayment in and clears it. */
export async function takeOwed(account: string): Promise<bigint> {
  if (!sponsorAccount()) return 0n;
  return locked(async () => {
    const l = await load();
    const v = BigInt(l.owed[account] ?? "0");
    if (v > 0n) { delete l.owed[account]; await save(l); }
    return v;
  });
}
/** Puts a repayment back when the quote that took it failed. */
export async function restoreOwed(account: string, v: bigint): Promise<void> {
  if (v <= 0n) return;
  await locked(async () => { const l = await load(); l.owed[account] = (BigInt(l.owed[account] ?? "0") + v).toString(); await save(l); });
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

export async function sponsorGas(account: string, token: string, minUsdOk: boolean): Promise<{ ok: true; tx: string | null; note?: string } | { error: string }> {
  if (!isEthAccount(account)) return { error: "Only 0x accounts get starter NEAR." };
  if (await nativeBalance(account) >= LOW) return { ok: true, tx: null, note: "already has enough NEAR" };
  if (!sponsorArmed()) return { error: "This site can't front the tiny NEAR deposit yet. Send 0.005 NEAR to your 0x address on NEAR and try again." };
  const [tok, wn] = await Promise.all([ftBalance(token, account), ftBalance("wrap.near", account)]);
  if (!((tok > 0n && minUsdOk) || wn >= WNEAR_MIN)) return { error: "Starter NEAR is only fronted to accounts holding this token." };
  try {
    return await locked(async () => {
      const l = await load();
      if ((l.accounts[account] ?? []).length >= PER_ACCOUNT_DAY) return { error: "This account already got starter NEAR several times today. Send 0.005 NEAR to it and try again." } as const;
      const grant = GRANT();
      if (BigInt(l.spent) + grant > DAILY()) return { error: "Today's starter NEAR is used up. Send 0.005 NEAR to your 0x address and try again." } as const;
      const tx = await transfer(account, grant);
      l.spent = (BigInt(l.spent) + grant).toString();
      l.accounts[account] = [...(l.accounts[account] ?? []), Date.now()];
      l.owed[account] = (BigInt(l.owed[account] ?? "0") + grant).toString();
      await save(l);
      return { ok: true, tx, note: `${Number((grant * 100000n) / YOCTO) / 100000} NEAR fronted, paid back from this trade` } as const;
    });
  } catch (e) {
    return { error: (e as Error).message || "Couldn't send starter NEAR." };
  }
}
