"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, Check, Copy, ExternalLink, Loader2, LogOut, Mail, Repeat, Smartphone, Wallet as WalletIcon, X } from "lucide-react";
import { renderSVG } from "uqr";
import { CHAINS, type Chain, type TokenInfo } from "@/lib/spec";
import { autoConnect, connect, connectPrivy, connectWalletConnect, disconnect, ensureChain, EVM_CHAIN, familyOf, keyOf, listSolana, loadNear, privyApp, privyMethods, short, switchAccount, useWallets, type Connected, type Wallet } from "./wallet";
import { num } from "../format";

// The Connect button and wallet picker on a generated site. Wallets the browser already has come first, with the
// logo they announce; popular ones that aren't installed follow with their own logo and an install link, or on a
// phone a link that opens this page inside the wallet app's browser. WalletConnect shows when the site has a project ID;
// email and social sign-in (Privy's embedded wallet) when it has a Privy App ID, except on NEAR.

type Known = { name: string; logo: string; match: RegExp; install: string; app?: (u: URL) => string };
const enc = encodeURIComponent;

const EVM_KNOWN: Known[] = [
  { name: "MetaMask", logo: "/wallets/metamask.svg", match: /^io\.metamask/, install: "https://metamask.io/download/", app: (u) => `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}` },
  { name: "Coinbase Wallet", logo: "/wallets/coinbase.svg", match: /^com\.coinbase/, install: "https://www.coinbase.com/wallet/downloads", app: (u) => `https://go.cb-w.com/dapp?cb_url=${enc(u.href)}` },
  { name: "Rabby", logo: "/wallets/rabby.png", match: /^io\.rabby/, install: "https://rabby.io/" },
  { name: "Trust Wallet", logo: "/wallets/trust.svg", match: /^com\.trustwallet/, install: "https://trustwallet.com/download", app: (u) => `https://link.trustwallet.com/open_url?coin_id=60&url=${enc(u.href)}` },
];
const SOL_KNOWN: Known[] = [
  { name: "Phantom", logo: "/wallets/phantom.svg", match: /^phantom/i, install: "https://phantom.com/download", app: (u) => `https://phantom.app/ul/browse/${enc(u.href)}?ref=${enc(u.origin)}` },
  { name: "Solflare", logo: "/wallets/solflare.svg", match: /^solflare/i, install: "https://solflare.com/download", app: (u) => `https://solflare.com/ul/v1/browse/${enc(u.href)}?ref=${enc(u.origin)}` },
  { name: "Backpack", logo: "/wallets/backpack.png", match: /^backpack/i, install: "https://backpack.app/downloads", app: (u) => `https://backpack.app/ul/v1/browse/${enc(u.href)}?ref=${enc(u.origin)}` },
];
/** Phone wallets WalletConnect can hand the pairing link to directly. */
const WC_APPS = [
  { name: "MetaMask", logo: "/wallets/metamask.svg", link: (uri: string) => `https://metamask.app.link/wc?uri=${enc(uri)}` },
  { name: "Trust Wallet", logo: "/wallets/trust.svg", link: (uri: string) => `https://link.trustwallet.com/wc?uri=${enc(uri)}` },
];

const isPhone = () => typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));

function logoOf(w: Wallet): string | null {
  if (w.icon) return w.icon;
  return [...EVM_KNOWN, ...SOL_KNOWN].find((k) => k.match.test(w.kind === "evm" ? w.rdns : w.name))?.logo ?? null;
}

function Logo({ src }: { src: string | null }) {
  return src ? <img src={src} alt="" /> : <span className="ss-wi"><WalletIcon size={16} /></span>;
}

function walletError(e: unknown, name: string): string | null {
  const m = (e as { message?: string }).message ?? "";
  const code = (e as { code?: number }).code;
  if (code === 4001 || /reject|denied|cancel|closed/i.test(m)) return null;
  if (code === -32002) return `${name} already has a request open. Open the extension to finish it.`;
  return m || `${name} said no.`;
}

function useBalance(c: Connected | null, chain: Chain): number | null {
  const [bal, setBal] = useState<number | null>(null);
  const addr = c?.address ?? null;
  useEffect(() => {
    setBal(null);
    if (!addr) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/balance?chain=${chain}&address=${enc(addr)}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as { amount?: number }) : null;
      if (!stop && typeof j?.amount === "number") setBal(j.amount);
    };
    void tick();
    const h = setInterval(tick, 30_000);
    return () => { stop = true; clearInterval(h); };
  }, [addr, chain]);
  return bal;
}

const fmtBal = (n: number) => (n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n < 1 ? n.toFixed(4).replace(/0+$/, "") : num(n));

export function WalletButton({ chain, walletconnect, privy, block }: { chain: Chain; token?: TokenInfo | null; walletconnect?: string | null; privy?: string | null; block?: boolean }) {
  const { evm, sol, near, authorised, connected } = useWallets();
  const [open, setOpen] = useState<null | "pick" | "account">(null);
  const kind = chain === "solana" ? "solana" : chain === "near" ? "near" : "evm";
  const mine = connected && familyOf(connected.wallet) === kind ? connected : null;
  const bal = useBalance(mine, chain);
  const wrongNet = kind === "evm" && !!mine && !!EVM_CHAIN[chain] && !!mine.chainId && mine.chainId !== EVM_CHAIN[chain]!.id;

  useEffect(() => { autoConnect(chain, walletconnect, privy); }, [chain, walletconnect, privy]);

  if (mine) {
    return (
      <>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-chip" data-el="wallet-chip" onClick={() => setOpen("account")} title={mine.address}>
          {logoOf(mine.wallet) ? <img src={logoOf(mine.wallet)!} alt="" width={18} height={18} style={{ borderRadius: 4 }} /> : <WalletIcon size={16} />}
          <span className="ss-mono">{short(mine.address)}</span>
          {wrongNet ? <span className="ss-chip-warn"><AlertTriangle size={14} /> Wrong network</span> : bal != null && <span className="ss-chip-bal">{fmtBal(bal)} {CHAINS[chain].native}</span>}
        </button>
        {open === "account" && <Account chain={chain} c={mine} bal={bal} wrongNet={wrongNet} onClose={() => setOpen(null)} onSwitch={() => setOpen("pick")} />}
        {open === "pick" && <Picker chain={chain} walletconnect={walletconnect} evm={evm} sol={sol} near={near} authorised={authorised} connected={connected} onClose={() => setOpen(null)} />}
      </>
    );
  }

  return (
    <>
      <button type="button" className={block ? "ss-btn" : "ss-btn ss-btn-sm"} style={block ? { width: "100%" } : undefined} onClick={() => setOpen("pick")}>
        <WalletIcon size={16} /> {block ? "Connect a wallet to buy" : "Connect"}
      </button>
      {open && <Picker chain={chain} walletconnect={walletconnect} evm={evm} sol={sol} near={near} authorised={authorised} connected={connected} onClose={() => setOpen(null)} />}
    </>
  );
}

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  // Rendered at the site's root: the nav's backdrop blur would otherwise become the box a fixed overlay sits in.
  return createPortal(
    <div className="ss-modal-bg" onClick={onClose}>
      <div className="ss-modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ss-modal-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {children}
      </div>
    </div>,
    document.querySelector(".ss") ?? document.body,
  );
}

type Row = { key: string; name: string; logo: string | null; tag: "Connected" | "Detected" | null; wallet: Wallet };

function Picker({ chain, walletconnect, evm, sol, near, authorised, connected, onClose }: {
  chain: Chain; walletconnect?: string | null; evm: Wallet[]; sol: Wallet[]; near: Wallet[] | null; authorised: Record<string, string>; connected: Connected | null; onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wc, setWc] = useState<null | { uri: string | null }>(null);
  const [phone, setPhone] = useState(false);
  const [here, setHere] = useState<URL | null>(null);
  // Privy: undefined while its sign-in methods load, null when Privy didn't say; hidden while Privy's own modal is up.
  const privy = chain !== "near" ? privyApp() : null;
  const [methods, setMethods] = useState<string[] | null | undefined>(undefined);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setPhone(isPhone());
    setHere(new URL(location.href));
    if (chain === "solana") listSolana();
    if (chain === "near") void loadNear().catch(() => setErr("NEAR wallets didn't load. Try again."));
  }, [chain]);
  useEffect(() => { if (privy) void privyMethods(privy).then((m) => setMethods(m && m.map((x) => x.label))); }, [privy]);

  const pool = chain === "solana" ? sol : chain === "near" ? near ?? [] : evm;
  const rows = useMemo<Row[]>(() => {
    const r = pool.map((w): Row => {
      const k = keyOf(w);
      const tag = connected && keyOf(connected.wallet) === k ? "Connected" : authorised[k] ? "Connected" : w.kind !== "near" || w.injected ? "Detected" : null;
      return { key: k, name: w.name, logo: logoOf(w), tag, wallet: w };
    });
    const rank = (t: Row["tag"]) => (t === "Connected" ? 0 : t === "Detected" ? 1 : 2);
    return r.sort((a, b) => rank(a.tag) - rank(b.tag));
  }, [pool, authorised, connected]);
  const known = chain === "solana" ? SOL_KNOWN : chain === "near" ? [] : EVM_KNOWN;
  const missing = known.filter((k) => !pool.some((w) => k.match.test(w.kind === "evm" ? w.rdns : w.name)));

  async function pick(row: Row) {
    setErr(null);
    setBusy(row.key);
    try {
      if (connected && keyOf(connected.wallet) !== row.key) await disconnect();
      await connect(row.wallet, chain);
      onClose();
    } catch (e) {
      setErr(walletError(e, row.name));
    } finally {
      setBusy(null);
    }
  }

  async function pickPrivy() {
    setErr(null);
    setBusy("privy");
    try {
      if (connected) await disconnect();
      await connectPrivy(chain, { onOpen: () => setHidden(true) });
      onClose();
    } catch (e) {
      setHidden(false);
      setErr(walletError(e, "Privy"));
    } finally {
      setBusy(null);
    }
  }

  async function pickWc() {
    if (!walletconnect) return;
    setErr(null);
    setWc({ uri: null });
    let gotUri = false;
    // A wrong project ID or a blocked relay never produces a link; say so instead of spinning forever.
    const slow = setTimeout(() => { if (!gotUri) setErr("WalletConnect didn't answer. Try again in a moment."); }, 15_000);
    try {
      if (connected) await disconnect();
      await connectWalletConnect(walletconnect, chain, (uri) => { gotUri = true; setErr(null); setWc({ uri }); });
      onClose();
    } catch (e) {
      setErr(walletError(e, "The wallet") ?? "The wallet didn't connect.");
    } finally {
      clearTimeout(slow);
    }
  }

  if (hidden) return null;
  if (wc) return <Modal label="Connect with WalletConnect" onClose={onClose}><WcView uri={wc.uri} phone={phone} onBack={() => { setWc(null); setErr(null); }} err={err} /></Modal>;

  return (
    <Modal label="Connect a wallet" onClose={onClose}>
      <h3>Connect a wallet</h3>
      <div className="ss-muted" style={{ fontSize: 14 }}>{CHAINS[chain].name}</div>
      {chain === "near" && !near && <div className="ss-wallet" style={{ cursor: "default" }}><Loader2 size={18} className="ss-spin" />Loading NEAR wallets…</div>}
      {privy && methods?.length !== 0 && (
        <button type="button" className="ss-wallet" data-wallet="privy" disabled={!!busy} onClick={() => void pickPrivy()}>
          <span className="ss-wi"><Mail size={16} /></span>Continue with {methods ? methods.slice(0, 3).join(" / ") : "email or social"}
          {busy === "privy" ? <small><Loader2 size={13} className="ss-spin" style={{ display: "inline", verticalAlign: -2 }} /> Loading</small> : <small>No wallet needed</small>}
        </button>
      )}
      {rows.map((r) => (
        <button key={r.key} type="button" className="ss-wallet" data-wallet={r.key} disabled={!!busy} onClick={() => void pick(r)}>
          <Logo src={r.logo} />{r.name}
          {busy === r.key ? <small><Loader2 size={13} className="ss-spin" style={{ display: "inline", verticalAlign: -2 }} /> Check {r.name}</small> : r.tag && <small className={r.tag === "Connected" ? "on" : undefined}>{r.tag}</small>}
        </button>
      ))}
      {walletconnect && kind(chain) === "evm" && (
        <button type="button" className="ss-wallet" data-wallet="walletconnect" disabled={!!busy} onClick={() => void pickWc()}>
          <Logo src="/wallets/walletconnect.svg" />WalletConnect<small>{phone ? "Wallet apps" : "Scan with phone"}</small>
        </button>
      )}
      {missing.length > 0 && here && (
        <>
          {rows.length > 0 && <div className="ss-wsep">{phone ? "Open in a wallet app" : "Not installed"}</div>}
          {missing.map((k) => {
            const app = phone && k.app ? k.app(here) : null;
            return (
              <a key={k.name} className="ss-wallet" data-wallet={`install:${k.name}`} href={app ?? k.install} target={app ? undefined : "_blank"} rel="noreferrer">
                <Logo src={k.logo} />{k.name}
                <small>{app ? <><Smartphone size={12} style={{ display: "inline", verticalAlign: -2 }} /> Open app</> : <>Install <ExternalLink size={12} style={{ display: "inline", verticalAlign: -1 }} /></>}</small>
              </a>
            );
          })}
        </>
      )}
      {err && <div className="ss-err">{err}</div>}
    </Modal>
  );
}

const kind = (c: Chain) => (c === "solana" ? "solana" : c === "near" ? "near" : "evm");

function WcView({ uri, phone, onBack, err }: { uri: string | null; phone: boolean; onBack: () => void; err: string | null }) {
  const [copied, setCopied] = useState(false);
  const svg = useMemo(() => (uri ? renderSVG(uri, { ecc: "Q", border: 0 }) : null), [uri]);
  return (
    <>
      <button type="button" className="ss-modal-back" onClick={onBack}><ArrowLeft size={16} /> Back</button>
      <h3>WalletConnect</h3>
      <div className="ss-muted" style={{ fontSize: 14 }}>{phone ? "Pick your wallet app, then approve there." : "Scan with your phone's wallet app."}</div>
      {!phone && (
        <div className="ss-qr" data-el="wc-qr">
          {svg ? <><span className="ss-qr-code" dangerouslySetInnerHTML={{ __html: svg }} /><img src="/wallets/walletconnect.svg" alt="" /></> : !err && <Loader2 size={22} className="ss-spin" style={{ margin: "auto", color: "#555" }} />}
        </div>
      )}
      {phone && (
        <>
          {WC_APPS.map((a) => (
            <a key={a.name} className="ss-wallet" href={uri ? a.link(uri) : undefined} aria-disabled={!uri}><Logo src={a.logo} />{a.name}<small>Open app</small></a>
          ))}
          <a className="ss-wallet" href={uri ?? undefined} aria-disabled={!uri}><Logo src="/wallets/walletconnect.svg" />Another wallet app<small>Open</small></a>
        </>
      )}
      <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ width: "100%", marginTop: 12 }} disabled={!uri} onClick={() => { if (uri) { void navigator.clipboard?.writeText(uri); setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy link"}
      </button>
      {err && <div className="ss-err">{err}</div>}
    </>
  );
}

function Account({ chain, c, bal, wrongNet, onClose, onSwitch }: { chain: Chain; c: Connected; bal: number | null; wrongNet: boolean; onClose: () => void; onSwitch: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "net" | "acct">(null);
  const [copied, setCopied] = useState(false);

  async function run(what: "net" | "acct") {
    setErr(null);
    setBusy(what);
    try {
      if (what === "net") await ensureChain(chain);
      else if (!(await switchAccount())) { await disconnect(); onSwitch(); }
    } catch (e) {
      setErr(walletError(e, c.wallet.name));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal label="Your wallet" onClose={onClose}>
      <div className="ss-acct">
        <Logo src={logoOf(c.wallet)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{c.wallet.name}</div>
          <div className="ss-muted" style={{ fontSize: 13 }}>{bal != null ? `${fmtBal(bal)} ${CHAINS[chain].native}` : CHAINS[chain].name}</div>
        </div>
      </div>
      <div className="ss-ca" style={{ marginTop: 14 }}>
        <span className="ss-mono" title={c.address}>{c.address}</span>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(c.address); setCopied(true); setTimeout(() => setCopied(false), 1400); }} aria-label="Copy address">
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}
        </button>
      </div>
      {wrongNet && (
        <button type="button" className="ss-btn" style={{ width: "100%", marginTop: 12 }} disabled={!!busy} onClick={() => void run("net")}>
          {busy === "net" ? <Loader2 size={16} className="ss-spin" /> : <AlertTriangle size={16} />} Switch to {CHAINS[chain].name}
        </button>
      )}
      <div className="ss-row" style={{ marginTop: 12 }}>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ flex: 1 }} disabled={!!busy} onClick={() => void run("acct")}>
          {busy === "acct" ? <Loader2 size={14} className="ss-spin" /> : <Repeat size={14} />} Switch account
        </button>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost" style={{ flex: 1 }} disabled={!!busy} onClick={() => { void disconnect(); onClose(); }}>
          <LogOut size={14} /> Disconnect
        </button>
      </div>
      {err && <div className="ss-err">{err}</div>}
    </Modal>
  );
}
