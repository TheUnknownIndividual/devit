import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";

// Wallet sign-in. The server writes the exact text to sign (Sign-In With Solana, EIP-4361 SIWE) or the NEP-413 payload,
// keeps it as a one-time challenge, and checks the signature against it: ed25519 for Solana and NEAR, secp256k1
// recovery for EVM. NEAR also has to show the signing key is a full-access key of the claimed account.

export type WalletKind = "solana" | "evm" | "near";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** EIP-55 mixed-case address, which EIP-4361 asks the message to carry. */
export function checksum(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, "");
  const h = hex(keccak_256(new TextEncoder().encode(a)));
  return "0x" + [...a].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join("");
}

export function validAddress(kind: WalletKind, a: string): boolean {
  if (kind === "evm") return /^0x[0-9a-fA-F]{40}$/.test(a);
  if (kind === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && b58decode(a)?.length === 32;
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(a) && a.length >= 2 && a.length <= 64;
}

const STATEMENT = "Sign in to sitesmith. This only proves you own this wallet: no transaction, no cost.";

/** The text to sign. NEAR signs the same statement inside a NEP-413 payload. */
export function signInMessage(kind: WalletKind, o: { domain: string; uri: string; address: string; nonce: string; issuedAt: string; expiresAt: string }): string {
  if (kind === "near") return `${STATEMENT}\n\nAccount: ${o.address}\nIssued At: ${o.issuedAt}`;
  const who = kind === "evm" ? "Ethereum" : "Solana";
  const address = kind === "evm" ? checksum(o.address) : o.address;
  return [
    `${o.domain} wants you to sign in with your ${who} account:`, address, "", STATEMENT, "",
    `URI: ${o.uri}`, "Version: 1", `Chain ID: ${kind === "evm" ? "1" : "mainnet"}`, `Nonce: ${o.nonce}`, `Issued At: ${o.issuedAt}`, `Expiration Time: ${o.expiresAt}`,
  ].join("\n");
}

/** A signature as hex (EVM), base64 (Wallet Standard, NEAR wallets) or base58, whichever gives the wanted length. */
function sigBytes(sig: string, want: number): Uint8Array | null {
  if (/^0x[0-9a-f]+$/i.test(sig)) return sig.length === 2 + want * 2 ? Uint8Array.from(Buffer.from(sig.slice(2), "hex")) : null;
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(sig)) {
    const b = Buffer.from(sig, /[_-]/.test(sig) ? "base64url" : "base64");
    if (b.length === want) return Uint8Array.from(b);
  }
  const b = b58decode(sig);
  return b?.length === want ? b : null;
}

export function verifySolana(message: string, address: string, signature: string): boolean {
  const pub = b58decode(address), sig = sigBytes(signature, 64);
  if (!pub || pub.length !== 32 || !sig) return false;
  try { return ed25519.verify(sig, new TextEncoder().encode(message), pub); } catch { return false; }
}

export function verifyEvm(message: string, address: string, signature: string): boolean {
  const sig = sigBytes(signature, 65);
  if (!sig) return false;
  const msg = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
  const digest = keccak_256(new Uint8Array([...prefix, ...msg]));
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v > 1) return false;
  try {
    const pub = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact").addRecoveryBit(v).recoverPublicKey(digest).toBytes(false);
    return `0x${hex(keccak_256(pub.slice(1)).slice(12))}` === address.toLowerCase();
  } catch {
    return false;
  }
}

// NEP-413: sha256(borsh({ tag: 2^31 + 413, message, nonce[32], recipient, callbackUrl?: null })), signed with ed25519.
function borshString(s: string): Uint8Array {
  const b = new TextEncoder().encode(s);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, b.length, true);
  return new Uint8Array([...len, ...b]);
}

export function nep413Hash(message: string, nonce: Uint8Array, recipient: string): Uint8Array {
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, 2 ** 31 + 413, true);
  return sha256(new Uint8Array([...tag, ...borshString(message), ...nonce, ...borshString(recipient), 0]));
}

export async function verifyNear(o: { message: string; nonce: Uint8Array; recipient: string; accountId: string; publicKey: string; signature: string }, rpcUrl: string): Promise<boolean> {
  const pub = o.publicKey.startsWith("ed25519:") ? b58decode(o.publicKey.slice(8)) : null;
  const sig = sigBytes(o.signature, 64);
  if (!pub || pub.length !== 32 || !sig) return false;
  try { if (!ed25519.verify(sig, nep413Hash(o.message, o.nonce, o.recipient), pub)) return false; } catch { return false; }
  // Implicit accounts are their own key.
  if (/^[0-9a-f]{64}$/.test(o.accountId)) return o.accountId === hex(pub);
  try {
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: o.accountId, public_key: o.publicKey } }),
      signal: AbortSignal.timeout(6000),
    });
    const j = (await r.json()) as { result?: { permission?: unknown } };
    return j.result?.permission === "FullAccess";
  } catch {
    return false;
  }
}
