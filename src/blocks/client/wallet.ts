"use client";

import { useSyncExternalStore } from "react";
import type { Chain } from "@/lib/spec";

// Wallets on a generated site. EVM wallets announce themselves through EIP-6963, so MetaMask, Rabby,
// Coinbase and the rest show up with their own name and logo. Solana wallets register through the
// Wallet Standard (Phantom, Solflare, Backpack, Glow…), which lets them sign raw transaction bytes
// without pulling @solana/web3.js into every site; older injected objects are the fallback for connecting.

export interface Eip1193 { request(args: { method: string; params?: unknown[] | object }): Promise<unknown> }
export interface EvmWallet { kind: "evm"; id: string; name: string; icon: string; rdns: string; provider: Eip1193 }
interface SolProvider { isPhantom?: boolean; connect(): Promise<{ publicKey: { toString(): string } }>; disconnect?(): Promise<void> }
interface StdAccount { address: string; publicKey: Uint8Array; chains: readonly string[] }
interface StdWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, unknown>;
}
type StdConnect = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StdAccount[] }> };
type StdDisconnect = { disconnect(): Promise<void> };
type StdSignAndSend = { signAndSendTransaction(...inputs: Array<{ account: StdAccount; transaction: Uint8Array; chain: string }>): Promise<Array<{ signature: Uint8Array }>> };
export interface SolWallet { kind: "solana"; id: string; name: string; icon: string | null; provider?: SolProvider; std?: StdWallet }
export interface NearWallet { kind: "near"; id: string; name: string; icon: string | null }
export type Wallet = EvmWallet | SolWallet | NearWallet;

export interface Connected { wallet: Wallet; address: string }

const EVM_CHAIN: Partial<Record<Chain, { id: string; name: string; rpc: string; explorer: string }>> = {
  ethereum: { id: "0x1", name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io" },
  robinhood: { id: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
};

let evm: EvmWallet[] = [];
let std: StdWallet[] = [];
let connected: Connected | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let started = false;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>).detail;
    if (!d?.info || evm.some((w) => w.rdns === d.info.rdns)) return;
    evm = [...evm, { kind: "evm", id: d.info.uuid, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider }];
    emit();
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Wallet Standard: wallets that loaded first answer app-ready; later ones send register-wallet.
  const api = {
    register(...ws: StdWallet[]) {
      const fresh = ws.filter((w) => w.chains?.some((c) => c.startsWith("solana:")) && !std.some((s) => s.name === w.name));
      if (fresh.length) { std = [...std, ...fresh]; emit(); }
      return () => { std = std.filter((s) => !ws.includes(s)); emit(); };
    },
  };
  window.addEventListener("wallet-standard:register-wallet", (e: Event) => {
    const cb = (e as CustomEvent<(a: typeof api) => void>).detail;
    try { cb?.(api); } catch { /* a broken wallet shouldn't break the page */ }
  });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api })); } catch { /* old browsers */ }
}

function solanaWallets(): SolWallet[] {
  if (typeof window === "undefined") return [];
  start();
  const out: SolWallet[] = std
    .filter((w) => w.features["standard:connect"] && w.features["solana:signAndSendTransaction"])
    .map((w) => ({ kind: "solana", id: w.name.toLowerCase().replace(/\s+/g, "-"), name: w.name, icon: w.icon, std: w }));
  const w = window as unknown as { phantom?: { solana?: SolProvider }; solflare?: SolProvider & { isSolflare?: boolean }; backpack?: SolProvider };
  const has = (n: string) => out.some((o) => o.name.toLowerCase().startsWith(n));
  if (!has("phantom") && w.phantom?.solana?.isPhantom) out.push({ kind: "solana", id: "phantom", name: "Phantom", icon: null, provider: w.phantom.solana });
  if (!has("solflare") && w.solflare?.isSolflare) out.push({ kind: "solana", id: "solflare", name: "Solflare", icon: null, provider: w.solflare });
  if (!has("backpack") && w.backpack) out.push({ kind: "solana", id: "backpack", name: "Backpack", icon: null, provider: w.backpack });
  return out;
}

export function useWallets(): { evm: EvmWallet[]; std: readonly unknown[]; connected: Connected | null } {
  start();
  const snap = useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => stateRef(),
    () => EMPTY,
  );
  return snap;
}

const EMPTY = { evm: [] as EvmWallet[], std: [] as readonly unknown[], connected: null as Connected | null };
let last = EMPTY;
function stateRef() {
  if (last.evm !== evm || last.std !== std || last.connected !== connected) last = { evm, std, connected };
  return last;
}

export function listSolana(): SolWallet[] { return solanaWallets(); }

let solAccount: StdAccount | null = null;

export async function connect(w: Wallet, chain: Chain): Promise<Connected> {
  if (w.kind === "near") return connectNear();
  if (w.kind === "solana") {
    if (w.std) {
      const r = await (w.std.features["standard:connect"] as StdConnect).connect();
      const acct = r.accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? r.accounts[0];
      if (!acct) throw new Error("The wallet didn't share an account.");
      solAccount = acct;
      connected = { wallet: w, address: acct.address };
    } else if (w.provider) {
      const r = await w.provider.connect();
      solAccount = null;
      connected = { wallet: w, address: r.publicKey.toString() };
    } else throw new Error("This wallet can't connect here.");
  } else {
    const accts = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
    const c = EVM_CHAIN[chain];
    if (c) {
      try {
        await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: c.id }] });
      } catch (e) {
        // 4902: the wallet doesn't know this chain yet; offer to add it.
        if ((e as { code?: number }).code === 4902) {
          await w.provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: c.id, chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
        }
      }
    }
    connected = { wallet: w, address: accts[0] };
  }
  emit();
  return connected;
}

// NEAR wallets come through NEAR Connect (HOT, Meteor, Intear, MyNearWallet, OKX…), loaded only when asked for,
// so sites on other chains never download it. It draws its own wallet picker.
type Connector = import("@hot-labs/near-connect").NearConnector;
type NearWalletApi = import("@hot-labs/near-connect").NearWalletBase;
let nearConnector: Connector | null = null;
let nearApi: NearWalletApi | null = null;

async function connector(): Promise<Connector> {
  if (!nearConnector) {
    const { NearConnector } = await import("@hot-labs/near-connect");
    nearConnector = new NearConnector({ network: "mainnet" });
  }
  return nearConnector;
}

export async function connectNear(): Promise<Connected> {
  const c = await connector();
  const w = await c.connect();
  const accounts = await w.getAccounts();
  const id = accounts[0]?.accountId;
  if (!id) throw new Error("The wallet didn't share an account.");
  nearApi = w;
  connected = { wallet: { kind: "near", id: w.manifest.id, name: w.manifest.name, icon: w.manifest.icon ?? null }, address: id };
  emit();
  return connected;
}

/** Signs and sends a batch of NEAR transactions in order; returns the last transaction's hash. */
export async function sendNear(signerId: string, transactions: Array<{ receiverId: string; actions: unknown[] }>): Promise<string> {
  if (connected?.wallet.kind !== "near" || !nearApi) throw new Error("Connect a NEAR wallet first.");
  // Some wallets sign with their own account whatever signerId says, so the quote must be for the connected one.
  if (connected.address !== signerId) throw new Error("The wallet's account changed. Try again.");
  const outcomes = await nearApi.signAndSendTransactions({ signerId, transactions: transactions as Parameters<NearWalletApi["signAndSendTransactions"]>[0]["transactions"] });
  const last = outcomes?.[outcomes.length - 1] as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | undefined;
  return last?.transaction?.hash ?? last?.transaction_outcome?.id ?? "";
}

export async function disconnect() {
  const w = connected?.wallet;
  if (w?.kind === "near") { await nearConnector?.disconnect().catch(() => undefined); nearApi = null; }
  if (w?.kind === "solana") {
    if (w.std) await (w.std.features["standard:disconnect"] as StdDisconnect | undefined)?.disconnect().catch(() => undefined);
    else await w.provider?.disconnect?.().catch(() => undefined);
  }
  connected = null;
  solAccount = null;
  emit();
}

export function short(a: string): string {
  return a.length > 14 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x !== 0) break; s = "1" + s; }
  return s;
}

/** Signs and sends a serialized Solana transaction (base64) with the connected wallet; returns the signature. */
export async function sendSolana(txBase64: string): Promise<string> {
  const w = connected?.wallet;
  if (w?.kind !== "solana") throw new Error("Connect a Solana wallet first.");
  const feature = w.std?.features["solana:signAndSendTransaction"] as StdSignAndSend | undefined;
  if (!feature || !solAccount) throw new Error(`${w.name} needs an update to sign here. Use the Jupiter link instead.`);
  const bytes = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
  const [out] = await feature.signAndSendTransaction({ account: solAccount, transaction: bytes, chain: "solana:mainnet" });
  return b58(out.signature);
}

/** Sends an EVM transaction from the connected wallet, switching to the site's chain first; returns the hash. */
export async function sendEvm(chain: Chain, tx: { to: string; data: string; value: string; gas: string | null }): Promise<string> {
  const w = connected?.wallet;
  if (w?.kind !== "evm" || !connected) throw new Error("Connect an Ethereum wallet first.");
  const c = EVM_CHAIN[chain];
  if (c) {
    const now = (await w.provider.request({ method: "eth_chainId" })) as string;
    if (now?.toLowerCase() !== c.id) await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: c.id }] });
  }
  return (await w.provider.request({
    method: "eth_sendTransaction",
    params: [{ from: connected.address, to: tx.to, data: tx.data, value: tx.value, ...(tx.gas ? { gas: tx.gas } : {}) }],
  })) as string;
}

export function explorerTx(chain: Chain, id: string): string {
  if (chain === "solana") return `https://solscan.io/tx/${id}`;
  if (chain === "near") return `https://nearblocks.io/txns/${id}`;
  return `${EVM_CHAIN[chain]?.explorer ?? "https://etherscan.io"}/tx/${id}`;
}
