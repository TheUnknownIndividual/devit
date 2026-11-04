import { createHash } from "node:crypto";

// Just enough Solana to find a token's Metaplex metadata account without an SDK: base58 and program-derived addresses.

const ABC = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = ABC.indexOf(ch);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const ch of s) { if (ch !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

export function b58encode(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = "";
  while (n > 0n) { s = ABC[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x !== 0) break; s = "1" + s; }
  return s;
}

// ed25519: a PDA must not be a valid curve point.
const P = 2n ** 255n - 19n;
const D = (-121665n * inv(121666n)) % P;
function mod(a: bigint) { const r = a % P; return r < 0n ? r + P : r; }
function pow(b: bigint, e: bigint) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = mod(r * b); b = mod(b * b); e >>= 1n; } return r; }
function inv(a: bigint) { return pow(a, P - 2n); }

function onCurve(bytes: Uint8Array): boolean {
  const c = Uint8Array.from(bytes);
  c[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(c[i]);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const x = mod(u * pow(v, 3n) * pow(mod(u * pow(v, 7n)), (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  return vx2 === u || vx2 === mod(-u);
}

export function findPda(seeds: Uint8Array[], program: Uint8Array): Uint8Array | null {
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump)).update(program).update("ProgramDerivedAddress");
    const out = new Uint8Array(h.digest());
    if (!onCurve(out)) return out;
  }
  return null;
}

const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

export function metadataAddress(mint: string): string | null {
  try {
    const prog = b58decode(METADATA_PROGRAM);
    const pda = findPda([new TextEncoder().encode("metadata"), prog, b58decode(mint)], prog);
    return pda ? b58encode(pda) : null;
  } catch {
    return null;
  }
}

/** name, symbol and uri from a Metaplex metadata account (borsh strings after key + two pubkeys). */
export function parseMetadata(data: Uint8Array): { name: string; symbol: string; uri: string } | null {
  try {
    let o = 1 + 32 + 32;
    const str = () => {
      const len = data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24);
      o += 4;
      const s = Buffer.from(data.subarray(o, o + len)).toString("utf8").replace(/\0/g, "").trim();
      o += len;
      return s;
    };
    return { name: str(), symbol: str(), uri: str() };
  } catch {
    return null;
  }
}
