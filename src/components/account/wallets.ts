"use client";

import { listSolana, type Eip1193, type SolWallet } from "@/blocks/client/wallet";
import type { PublicUser } from "@/lib/accounts";

// Wallet sign-in in the browser: connect, ask the server for the text to sign, sign it, send the signature back.
// Solana signs through the Wallet Standard (solana:signMessage), EVM through personal_sign, NEAR through NEAR Connect's
// NEP-413 signMessage. Nothing here can send a transaction.

export interface EvmChoice { id: string; name: string; icon: string | null; provider: Eip1193 }

type Result = { user: PublicUser; linked: boolean };

async function challenge(kind: "solana" | "evm" | "near", address: string) {
  const r = await fetch("/api/auth/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "challenge", kind, address }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Couldn't start the sign-in.");
  return j as { id: string; message: string; nonce: string; recipient: string };
}

async function finish(id: string, signature: string, publicKey?: string): Promise<Result> {
  const r = await fetch("/api/auth/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "verify", id, signature, publicKey }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "The signature didn't check out.");
  return j as Result;
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const rejected = (e: unknown) => /reject|denied|cancel/i.test(String((e as { message?: string })?.message ?? e)) || (e as { code?: number })?.code === 4001;

function friendly(e: unknown): Error {
  return new Error(rejected(e) ? "You cancelled in the wallet." : (e as Error)?.message || "The wallet didn't answer.");
}

// ---------- EVM ----------

let announced: EvmChoice[] = [];
let listening = false;

/** EIP-6963 wallets that announced themselves, plus window.ethereum if nothing did. */
export function evmWallets(): EvmChoice[] {
  if (typeof window === "undefined") return [];
  if (!listening) {
    listening = true;
    window.addEventListener("eip6963:announceProvider", (e: Event) => {
      const d = (e as CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>).detail;
      if (d?.info && !announced.some((w) => w.id === d.info.rdns)) announced = [...announced, { id: d.info.rdns, name: d.info.name, icon: d.info.icon, provider: d.provider }];
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return announced.length ? announced : injected ? [{ id: "injected", name: "Browser wallet", icon: null, provider: injected }] : [];
}

export async function signInEvm(w: EvmChoice): Promise<Result> {
  try {
    const [address] = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!address) throw new Error("The wallet didn't share an address.");
    const c = await challenge("evm", address);
    const hex = "0x" + [...new TextEncoder().encode(c.message)].map((x) => x.toString(16).padStart(2, "0")).join("");
    const sig = (await w.provider.request({ method: "personal_sign", params: [hex, address] })) as string;
    return await finish(c.id, sig);
  } catch (e) { throw friendly(e); }
}

// ---------- Solana ----------

interface StdAccount { address: string; publicKey: Uint8Array; chains: readonly string[] }
type StdConnect = { connect(): Promise<{ accounts: readonly StdAccount[] }> };
type StdSignMessage = { signMessage(...inputs: Array<{ account: StdAccount; message: Uint8Array }>): Promise<Array<{ signedMessage: Uint8Array; signature: Uint8Array }>> };
type LegacySol = { connect(): Promise<{ publicKey: { toString(): string } }>; signMessage?(m: Uint8Array, enc?: string): Promise<{ signature: Uint8Array }> };

export function solanaWallets(): SolWallet[] {
  return listSolana().filter((w) => (w.std ? !!w.std.features["solana:signMessage"] : !!(w.provider as LegacySol | undefined)?.signMessage));
}

export async function signInSolana(w: SolWallet): Promise<Result> {
  try {
    if (w.std) {
      const { accounts } = await (w.std.features["standard:connect"] as StdConnect).connect();
      const acct = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
      if (!acct) throw new Error("The wallet didn't share an account.");
      const c = await challenge("solana", acct.address);
      const [out] = await (w.std.features["solana:signMessage"] as StdSignMessage).signMessage({ account: acct, message: new TextEncoder().encode(c.message) });
      return await finish(c.id, b64(out.signature));
    }
    const p = w.provider as unknown as LegacySol;
    const address = (await p.connect()).publicKey.toString();
    const c = await challenge("solana", address);
    const out = await p.signMessage!(new TextEncoder().encode(c.message), "utf8");
    return await finish(c.id, b64(out.signature));
  } catch (e) { throw friendly(e); }
}

// ---------- NEAR ----------

type Connector = import("@hot-labs/near-connect").NearConnector;
let near: Connector | null = null;

export async function signInNear(): Promise<Result> {
  try {
    if (!near) {
      const { NearConnector } = await import("@hot-labs/near-connect");
      near = new NearConnector({ network: "mainnet" });
    }
    const w = await near.connect();
    const accountId = (await w.getAccounts())[0]?.accountId;
    if (!accountId) throw new Error("The wallet didn't share an account.");
    const c = await challenge("near", accountId);
    const nonce = Uint8Array.from(atob(c.nonce), (x) => x.charCodeAt(0));
    const signed = await w.signMessage({ message: c.message, recipient: c.recipient, nonce, signerId: accountId });
    if (signed.accountId && signed.accountId !== accountId) throw new Error("The wallet signed with a different account.");
    return await finish(c.id, signed.signature, signed.publicKey);
  } catch (e) { throw friendly(e); }
}
