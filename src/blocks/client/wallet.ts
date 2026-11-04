"use client";

import { useSyncExternalStore } from "react";
import type { Chain } from "@/lib/spec";

// Wallets on a generated site. EVM wallets announce themselves through EIP-6963, so MetaMask, Rabby,
// Coinbase and the rest show up with their own name and logo. Solana wallets register through the
// Wallet Standard (Phantom, Solflare, Backpack, Glow…), which lets them sign raw transaction bytes
// without pulling @solana/web3.js into every site; older injected objects are the fallback for connecting.
// NEAR wallets come through NEAR Connect. Phone wallets on EVM come through WalletConnect when the site has a project ID.
//
// A wallet that already trusts this site (eth_accounts non-empty, Wallet Standard accounts, Phantom's onlyIfTrusted)
// is marked as authorised and, unless the visitor pressed Disconnect, reconnected silently on load.

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, fn: (...a: never[]) => void): void;
  removeListener?(event: string, fn: (...a: never[]) => void): void;
}
export interface EvmWallet { kind: "evm"; id: string; name: string; icon: string; rdns: string; provider: Eip1193 }
interface SolProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  on?(event: string, fn: (...a: never[]) => void): void;
  removeListener?(event: string, fn: (...a: never[]) => void): void;
}
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
type StdEvents = { on(event: "change", fn: (p: { accounts?: readonly StdAccount[] }) => void): () => void };
type StdSignAndSend = { signAndSendTransaction(...inputs: Array<{ account: StdAccount; transaction: Uint8Array; chain: string }>): Promise<Array<{ signature: Uint8Array }>> };
export interface SolWallet { kind: "solana"; id: string; name: string; icon: string | null; provider?: SolProvider; std?: StdWallet }
export interface NearWallet { kind: "near"; id: string; name: string; icon: string | null; injected?: boolean }
export type Wallet = EvmWallet | SolWallet | NearWallet;

export interface Connected { wallet: Wallet; address: string; /** EVM only: the wallet's current chain, 0x-hex. */ chainId?: string }

export const EVM_CHAIN: Partial<Record<Chain, { id: string; name: string; rpc: string[]; explorer: string; native?: string }>> = {
  ethereum: { id: "0x1", name: "Ethereum", rpc: ["https://ethereum-rpc.publicnode.com"], explorer: "https://etherscan.io" },
  base: { id: "0x2105", name: "Base", rpc: ["https://mainnet.base.org"], explorer: "https://basescan.org" },
  bsc: { id: "0x38", name: "BNB Smart Chain", rpc: ["https://bsc-dataseed.bnbchain.org"], explorer: "https://bscscan.com", native: "BNB" },
  // Chain 4663 (0x1237). Checked 2026-11-04 against chainid.network and the RPC's own eth_chainId.
  robinhood: { id: "0x1237", name: "Robinhood Chain", rpc: ["https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com"], explorer: "https://robinhoodchain.blockscout.com" },
};

export const keyOf = (w: Wallet): string => (w.kind === "evm" ? `evm:${w.rdns}` : `${w.kind}:${w.id}`);

let evm: EvmWallet[] = [];
let std: StdWallet[] = [];
let near: NearWallet[] | null = null;
/** Wallets that already trust this site, by keyOf, with the account they'd share. */
let authorised: Record<string, string> = {};
let connected: Connected | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let started = false;

// ---------- remembering the visitor's choice ----------

const LAST = "ss-wallet";
const OFF = "off";
function lastWallet(): string | null { try { return localStorage.getItem(LAST); } catch { return null; } }
function remember(v: string) { try { localStorage.setItem(LAST, v); } catch { /* private mode */ } }

function setAuthorised(k: string, address: string | null) {
  if ((authorised[k] ?? null) === (address ?? null)) return;
  const next = { ...authorised };
  if (address) next[k] = address; else delete next[k];
  authorised = next;
  emit();
}

// ---------- discovery ----------

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>).detail;
    if (!d?.info || !d.provider || evm.some((w) => w.rdns === d.info.rdns)) return;
    const w: EvmWallet = { kind: "evm", id: d.info.uuid, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider };
    evm = [...evm, w];
    emit();
    // eth_accounts never prompts: it's empty unless the visitor already let this site see an account.
    void (d.provider.request({ method: "eth_accounts" }) as Promise<string[]>)
      .then((a) => { if (Array.isArray(a) && a[0]) { setAuthorised(keyOf(w), a[0]); resume(); } })
      .catch(() => undefined);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Wallet Standard: wallets that loaded first answer app-ready; later ones send register-wallet.
  const api = {
    register(...ws: StdWallet[]) {
      const fresh = ws.filter((w) => w.chains?.some((c) => c.startsWith("solana:")) && !std.some((s) => s.name === w.name));
      if (fresh.length) {
        std = [...std, ...fresh];
        for (const w of fresh) if (w.accounts?.[0]) authorised = { ...authorised, [`solana:${stdId(w)}`]: w.accounts[0].address };
        emit();
        if (resumeChain === "solana") probeSol(solanaWallets());
        resume();
      }
      return () => { std = std.filter((s) => !ws.includes(s)); emit(); };
    },
  };
  window.addEventListener("wallet-standard:register-wallet", (e: Event) => {
    const cb = (e as CustomEvent<(a: typeof api) => void>).detail;
    try { cb?.(api); } catch { /* a broken wallet shouldn't break the page */ }
  });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api })); } catch { /* old browsers */ }
}

const stdId = (w: StdWallet) => w.name.toLowerCase().replace(/\s+/g, "-");

function solanaWallets(): SolWallet[] {
  if (typeof window === "undefined") return [];
  start();
  const out: SolWallet[] = std
    .filter((w) => w.features["standard:connect"] && w.features["solana:signAndSendTransaction"])
    .map((w) => ({ kind: "solana", id: stdId(w), name: w.name, icon: w.icon, std: w }));
  const w = window as unknown as { phantom?: { solana?: SolProvider }; solflare?: SolProvider & { isSolflare?: boolean }; backpack?: SolProvider };
  const has = (n: string) => out.some((o) => o.name.toLowerCase().startsWith(n));
  if (!has("phantom") && w.phantom?.solana?.isPhantom) out.push({ kind: "solana", id: "phantom", name: "Phantom", icon: null, provider: w.phantom.solana });
  if (!has("solflare") && w.solflare?.isSolflare) out.push({ kind: "solana", id: "solflare", name: "Solflare", icon: null, provider: w.solflare });
  if (!has("backpack") && w.backpack) out.push({ kind: "solana", id: "backpack", name: "Backpack", icon: null, provider: w.backpack });
  return out;
}

// Wallets known to honour a silent connect (no popup unless the site is already trusted). Others are only asked
// silently when they're the one the visitor used last.
const SILENT_OK = /^(phantom|solflare|backpack)/i;
const probed = new Set<string>();
/**
 * Asks Solana wallets, without any popup, whether they already trust this site: standard:connect with silent for
 * Wallet Standard wallets, connect({ onlyIfTrusted }) for the older injected objects.
 */
function probeSol(list: SolWallet[]) {
  const lastKey = lastWallet();
  for (const w of list) {
    if (probed.has(w.id) || authorised[keyOf(w)]) continue;
    if (w.std) {
      if (!SILENT_OK.test(w.name) && keyOf(w) !== lastKey) continue;
      probed.add(w.id);
      void (w.std.features["standard:connect"] as StdConnect).connect({ silent: true })
        .then((r) => { const a = r.accounts.find((x) => x.chains.some((c) => c.startsWith("solana:"))) ?? r.accounts[0]; if (a) { setAuthorised(keyOf(w), a.address); resume(); } })
        .catch(() => undefined);
    } else if (w.provider) {
      probed.add(w.id);
      if (w.provider.isConnected && w.provider.publicKey) { setAuthorised(keyOf(w), w.provider.publicKey.toString()); resume(); continue; }
      void w.provider.connect({ onlyIfTrusted: true })
        .then((r) => { setAuthorised(keyOf(w), r.publicKey.toString()); resume(); })
        .catch(() => undefined);
    }
  }
}

type Snap = { evm: EvmWallet[]; sol: SolWallet[]; near: NearWallet[] | null; authorised: Record<string, string>; connected: Connected | null };
const EMPTY: Snap = { evm: [], sol: [], near: null, authorised: {}, connected: null };
let last = EMPTY;
let lastStd: StdWallet[] | null = null;
function stateRef(): Snap {
  if (last.evm !== evm || lastStd !== std || last.near !== near || last.authorised !== authorised || last.connected !== connected) {
    lastStd = std;
    last = { evm, sol: solanaWallets(), near, authorised, connected };
  }
  return last;
}

export function useWallets(): Snap {
  start();
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    stateRef,
    () => EMPTY,
  );
}

/** Re-reads the Solana wallets (old injected objects can appear late) and asks them silently if they trust the site. */
export function listSolana(): SolWallet[] {
  const l = solanaWallets();
  probeSol(l);
  if (l.length !== last.sol.length) { lastStd = null; emit(); }
  return l;
}

// ---------- silent reconnect ----------

let resumeChain: Chain | null = null;
let wcProjectId: string | null = null;

/** Called once by the site: reconnects the wallet the visitor used last (or one that already trusts the site). */
export function autoConnect(chain: Chain, walletconnectProjectId?: string | null) {
  if (typeof window === "undefined" || resumeChain) return;
  start();
  resumeChain = chain;
  wcProjectId = walletconnectProjectId || null;
  const lastKey = lastWallet();
  if (lastKey === OFF) return;
  if (chain === "solana") probeSol(solanaWallets());
  if (chain === "near") void loadNear().then(resumeNear).catch(() => undefined);
  if (lastKey === "evm:walletconnect" && wcProjectId && chain !== "near" && chain !== "solana") void resumeWalletConnect(chain).catch(() => undefined);
  resume();
}

let resuming = false;
function resume() {
  const chain = resumeChain;
  if (!chain || connected || resuming || lastWallet() === OFF) return;
  const lastKey = lastWallet();
  const kind = chain === "solana" ? "solana" : chain === "near" ? "near" : "evm";
  const pool: Wallet[] = kind === "evm" ? evm : kind === "solana" ? solanaWallets() : [];
  // The wallet used last wins; with no memory, a single wallet that already trusts the site.
  let w = pool.find((x) => keyOf(x) === lastKey && authorised[keyOf(x)]);
  if (!w && !lastKey) w = pool.find((x) => authorised[keyOf(x)]);
  if (!w) return;
  resuming = true;
  void connect(w, chain, { silent: true }).catch(() => undefined).finally(() => { resuming = false; });
}

// ---------- connecting ----------

let solAccount: StdAccount | null = null;
let unwatch: (() => void) | null = null;

function watch(w: Wallet) {
  unwatch?.();
  unwatch = null;
  if (w.kind === "evm" && w.provider.on) {
    const p = w.provider;
    const onAccounts = (a: string[]) => {
      if (!connected || connected.wallet !== w) return;
      if (!a?.[0]) { void disconnect(); return; }
      connected = { ...connected, address: a[0] };
      setAuthorised(keyOf(w), a[0]);
      emit();
    };
    const onChain = (id: string | number) => {
      if (!connected || connected.wallet !== w) return;
      connected = { ...connected, chainId: hexChain(id) };
      emit();
    };
    p.on!("accountsChanged", onAccounts as never);
    p.on!("chainChanged", onChain as never);
    unwatch = () => { p.removeListener?.("accountsChanged", onAccounts as never); p.removeListener?.("chainChanged", onChain as never); };
  }
  if (w.kind === "solana" && w.std?.features["standard:events"]) {
    unwatch = (w.std.features["standard:events"] as StdEvents).on("change", ({ accounts }) => {
      if (!accounts || !connected || connected.wallet !== w) return;
      const a = accounts.find((x) => x.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
      if (!a) { void disconnect(); return; }
      solAccount = a;
      connected = { ...connected, address: a.address };
      emit();
    });
  } else if (w.kind === "solana" && w.provider?.on) {
    const p = w.provider;
    const onChange = (pk: { toString(): string } | null) => {
      if (!connected || connected.wallet !== w) return;
      if (pk) { connected = { ...connected, address: pk.toString() }; emit(); }
    };
    p.on!("accountChanged", onChange as never);
    unwatch = () => p.removeListener?.("accountChanged", onChange as never);
  }
}

const hexChain = (id: unknown): string => (typeof id === "number" ? `0x${id.toString(16)}` : typeof id === "string" && !id.startsWith("0x") && /^\d+$/.test(id) ? `0x${Number(id).toString(16)}` : String(id).toLowerCase());

/**
 * Connects one specific wallet: eth_requestAccounts on that EIP-6963 provider, standard:connect on that Wallet
 * Standard wallet. With silent, only wallets that already trust the site connect and nothing pops up.
 */
export async function connect(w: Wallet, chain: Chain, opts: { silent?: boolean } = {}): Promise<Connected> {
  if (w.kind === "near") return connectNear(w.id, opts);
  if (w.kind === "solana") {
    if (w.std) {
      const accts = opts.silent && w.std.accounts.length ? w.std.accounts : (await (w.std.features["standard:connect"] as StdConnect).connect(opts.silent ? { silent: true } : undefined)).accounts;
      const acct = accts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accts[0];
      if (!acct) throw new Error("The wallet didn't share an account.");
      solAccount = acct;
      connected = { wallet: w, address: acct.address };
    } else if (w.provider) {
      const r = await w.provider.connect(opts.silent ? { onlyIfTrusted: true } : undefined);
      solAccount = null;
      connected = { wallet: w, address: r.publicKey.toString() };
    } else throw new Error("This wallet can't connect here.");
  } else {
    const accts = (await w.provider.request({ method: opts.silent ? "eth_accounts" : "eth_requestAccounts" })) as string[];
    if (!accts?.[0]) throw new Error("The wallet didn't share an account.");
    connected = { wallet: w, address: accts[0], chainId: hexChain(await w.provider.request({ method: "eth_chainId" }).catch(() => "")) };
    // Asking to switch networks is a popup, so a silent reconnect leaves that to the Switch button.
    if (!opts.silent) await ensureChain(chain).catch(() => undefined);
  }
  remember(keyOf(w));
  setAuthorised(keyOf(w), connected.address);
  watch(w);
  emit();
  return connected;
}

/** Puts the connected EVM wallet on the site's chain, adding Robinhood Chain to the wallet if it doesn't know it. */
export async function ensureChain(chain: Chain): Promise<void> {
  const w = connected?.wallet;
  const c = EVM_CHAIN[chain];
  if (w?.kind !== "evm" || !c || !connected) return;
  const now = hexChain(await w.provider.request({ method: "eth_chainId" }).catch(() => connected?.chainId ?? ""));
  if (now === c.id) { if (connected.chainId !== now) { connected = { ...connected, chainId: now }; emit(); } return; }
  try {
    await w.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: c.id }] });
  } catch (e) {
    // 4902: the wallet doesn't know this chain yet (MetaMask Mobile reports it inside data.originalError).
    const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code ?? (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code;
    if (code !== 4902) throw e;
    await w.provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: c.id, chainName: c.name, rpcUrls: c.rpc, blockExplorerUrls: [c.explorer], nativeCurrency: c.native ? { name: c.native, symbol: c.native, decimals: 18 } : { name: "Ether", symbol: "ETH", decimals: 18 } }] });
  }
  if (connected?.wallet === w) { connected = { ...connected, chainId: c.id }; emit(); }
}

/** Opens the wallet's own account chooser. Returns false when the wallet has none (the picker opens instead). */
export async function switchAccount(): Promise<boolean> {
  const w = connected?.wallet;
  if (w?.kind !== "evm" || w.rdns === "walletconnect") return false;
  try {
    await w.provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4001) throw e;
    // -32601 / 4200: no permissions API; asking for accounts again is the next best thing.
    await w.provider.request({ method: "eth_requestAccounts" });
  }
  const a = (await w.provider.request({ method: "eth_accounts" })) as string[];
  if (a?.[0] && connected?.wallet === w) { connected = { ...connected, address: a[0] }; setAuthorised(keyOf(w), a[0]); emit(); }
  return true;
}

// ---------- NEAR ----------

// NEAR wallets come through NEAR Connect (HOT, Meteor, Intear, MyNearWallet, OKX…), loaded only on NEAR sites,
// so sites on other chains never download it. Its wallet list fills our picker; signing goes through the wallet it picks.
type Connector = import("@hot-labs/near-connect").NearConnector;
type NearWalletApi = import("@hot-labs/near-connect").NearWalletBase;
let nearConnector: Promise<Connector> | null = null;
let nearApi: NearWalletApi | null = null;

function connector(): Promise<Connector> {
  nearConnector ??= import("@hot-labs/near-connect").then(({ NearConnector }) => new NearConnector({ network: "mainnet", footerBranding: null }));
  return nearConnector;
}

const nearOf = (m: { id: string; name: string; icon?: string; type?: string }): NearWallet => ({ kind: "near", id: m.id, name: m.name, icon: m.icon ?? null, injected: m.type === "injected" });

/** NEAR Connect's wallet list, for the picker. Injected ones (browser extensions) count as detected. */
export async function loadNear(): Promise<NearWallet[]> {
  const c = await connector();
  await c.whenManifestLoaded.catch(() => undefined);
  near = c.availableWallets.map((w) => nearOf(w.manifest));
  emit();
  return near;
}

async function resumeNear() {
  if (connected || lastWallet() === OFF) return;
  const c = await connector();
  const r = await c.getConnectedWallet().catch(() => null);
  const id = r?.accounts[0]?.accountId;
  if (!r || !id) return;
  nearApi = r.wallet;
  const w = nearOf(r.wallet.manifest);
  setAuthorised(keyOf(w), id);
  connected = { wallet: w, address: id };
  emit();
}

export async function connectNear(walletId?: string, opts: { silent?: boolean } = {}): Promise<Connected> {
  const c = await connector();
  if (opts.silent) { await resumeNear(); if (connected) return connected; throw new Error("Not signed in."); }
  const w = await c.connect(walletId ? { walletId } : undefined);
  const accounts = await w.getAccounts();
  const id = accounts[0]?.accountId;
  if (!id) throw new Error("The wallet didn't share an account.");
  nearApi = w;
  const nw = nearOf(w.manifest);
  connected = { wallet: nw, address: id };
  remember(keyOf(nw));
  setAuthorised(keyOf(nw), id);
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

// ---------- WalletConnect ----------

// Phone wallets over the WalletConnect relay, through the official Universal Provider (no modal package: the QR is
// drawn by the picker). Loaded only when the visitor picks WalletConnect or reconnects a WalletConnect session.
type Universal = import("@walletconnect/universal-provider").default;
let wc: Promise<Universal> | null = null;

function wcProvider(projectId: string): Promise<Universal> {
  wc ??= import("@walletconnect/universal-provider").then(({ UniversalProvider }) =>
    UniversalProvider.init({
      projectId,
      metadata: { name: document.title || location.host, description: document.title || location.host, url: location.origin, icons: [] },
    }).then((p) => {
      // The phone ended the session.
      p.on("session_delete", () => { const w = connected?.wallet; if (w?.kind === "evm" && w.rdns === "walletconnect") { connected = null; emit(); } });
      return p;
    }),
  );
  wc.catch(() => { wc = null; });
  return wc;
}

function wcChains(chain: Chain): string[] {
  const id = parseInt(EVM_CHAIN[chain]?.id ?? "0x1", 16);
  return [...new Set([`eip155:${id}`, "eip155:1"])];
}

function wcWallet(p: Universal): EvmWallet {
  const peer = p.session?.peer.metadata;
  const provider: Eip1193 = {
    async request(a) {
      const r = await p.request({ method: a.method, params: a.params as unknown[] });
      return a.method === "eth_chainId" ? hexChain(r) : r;
    },
    on: (e, fn) => p.on(e, fn),
    removeListener: (e, fn) => p.removeListener(e, fn),
  };
  return { kind: "evm", id: "walletconnect", name: peer?.name || "WalletConnect", icon: peer?.icons?.find((i) => /^https:/.test(i)) || "/wallets/walletconnect.svg", rdns: "walletconnect", provider };
}

async function wcFinish(p: Universal, chain: Chain): Promise<Connected> {
  const w = wcWallet(p);
  const want = wcChains(chain)[0];
  const accounts = p.session?.namespaces.eip155?.accounts ?? [];
  // Prefer the account on the site's chain; WalletConnect lists them as eip155:<chain>:<address>.
  const pick = accounts.find((a) => a.startsWith(`${want}:`)) ?? accounts[0];
  if (!pick) throw new Error("The wallet didn't share an account.");
  if (pick.startsWith(`${want}:`)) p.setDefaultChain(want);
  connected = { wallet: w, address: pick.split(":")[2], chainId: hexChain(await w.provider.request({ method: "eth_chainId" }).catch(() => "")) };
  remember(keyOf(w));
  watch(w);
  emit();
  return connected;
}

async function resumeWalletConnect(chain: Chain) {
  if (!wcProjectId) return;
  const p = await wcProvider(wcProjectId);
  if (p.session && !connected) await wcFinish(p, chain);
}

/** Starts a WalletConnect pairing; onUri gets the wc: link to show as a QR or open in a phone wallet. */
export async function connectWalletConnect(projectId: string, chain: Chain, onUri: (uri: string) => void): Promise<Connected> {
  const p = await wcProvider(projectId);
  if (p.session) await p.disconnect().catch(() => undefined);
  const onDisplay = (uri: string) => onUri(uri);
  p.on("display_uri", onDisplay);
  try {
    const c = EVM_CHAIN[chain];
    const rpcMap = Object.fromEntries(Object.values(EVM_CHAIN).map((x) => [String(parseInt(x!.id, 16)), x!.rpc[0]]));
    await p.connect({
      optionalNamespaces: {
        eip155: {
          chains: wcChains(chain),
          methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4", "wallet_switchEthereumChain", "wallet_addEthereumChain"],
          events: ["chainChanged", "accountsChanged"],
          rpcMap,
          defaultChain: c ? String(parseInt(c.id, 16)) : "1",
        },
      },
    });
  } finally {
    p.removeListener("display_uri", onDisplay);
  }
  return wcFinish(p, chain);
}

// ---------- disconnect + sending ----------

export async function disconnect() {
  const w = connected?.wallet;
  unwatch?.();
  unwatch = null;
  if (w?.kind === "near") { await (await connector()).disconnect().catch(() => undefined); nearApi = null; }
  if (w?.kind === "solana") {
    if (w.std) await (w.std.features["standard:disconnect"] as StdDisconnect | undefined)?.disconnect().catch(() => undefined);
    else await w.provider?.disconnect?.().catch(() => undefined);
  }
  if (w?.kind === "evm") {
    if (w.rdns === "walletconnect") { const p = await wc?.catch(() => null); await p?.disconnect().catch(() => undefined); }
    // MetaMask and a few others let a site drop its own permission; the rest keep it, hence the "off" memory.
    else await w.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => undefined);
  }
  if (w) setAuthorised(keyOf(w), null);
  remember(OFF);
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
  await ensureChain(chain);
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
