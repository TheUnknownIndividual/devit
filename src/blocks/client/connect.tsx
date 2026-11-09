"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, Check, Copy, ExternalLink, Loader2, LogOut, Mail, Repeat, Smartphone, Wallet as WalletIcon, X } from "lucide-react";
import { renderSVG } from "uqr";
import { CHAINS, type Chain, type TokenInfo } from "@/lib/spec";
import { autoConnect, connect, connectPrivy, connectWalletConnect, disconnect, ensureChain, EVM_CHAIN, familyOf, keyOf, ledgerState, listSolana, loadNear, nearInstalled, NEAR_HIDDEN, privyApp, privyMethods, short, switchAccount, useWallets, type Connected, type Wallet } from "./wallet";
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

/** What a wallet's family buys with on this site, shown under its name in the picker. */
function paysWith(fam: "evm" | "solana" | "near", chain: Chain): string {
  if (chain === "near") return fam === "near" ? "Pays with NEAR" : "Pays with ETH or USDC";
  return `Pays with ${CHAINS[chain].native}`;
}

/** The families a site's picker lists: a NEAR site takes Ethereum wallets too (see xbuy.tsx). */
const familiesOf = (chain: Chain): Array<"evm" | "solana" | "near"> => (chain === "near" ? ["near", "evm"] : [kind(chain)]);

export function WalletButton({ chain, walletconnect, privy, block, prefer, label }: { chain: Chain; token?: TokenInfo | null; walletconnect?: string | null; privy?: string | null; block?: boolean; prefer?: "evm" | "near"; label?: string }) {
  const { evm, sol, near, authorised, connected } = useWallets();
  const [open, setOpen] = useState<null | "pick" | "account">(null);
  const fam = connected ? familyOf(connected.wallet) : null;
  const mine = connected && fam && familiesOf(chain).includes(fam) ? connected : null;
  // The chip's balance is the site's own coin, so only for a wallet of the site's own family.
  const bal = useBalance(mine && fam === kind(chain) ? mine : null, chain);
  const wrongNet = kind(chain) === "evm" && !!mine && !!EVM_CHAIN[chain] && !!mine.chainId && mine.chainId !== EVM_CHAIN[chain]!.id;

  useEffect(() => { autoConnect(chain, walletconnect, privy); }, [chain, walletconnect, privy]);

  const picker = open === "pick" && <Picker chain={chain} walletconnect={walletconnect} prefer={prefer} evm={evm} sol={sol} near={near} authorised={authorised} connected={connected} onClose={() => setOpen(null)} />;
  if (mine) {
    return (
      <>
        <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-chip" data-el="wallet-chip" onClick={() => setOpen("account")} title={mine.address}>
          {logoOf(mine.wallet) ? <img src={logoOf(mine.wallet)!} alt="" width={18} height={18} style={{ borderRadius: 4 }} /> : <WalletIcon size={16} />}
          <span className="ss-mono">{short(mine.address)}</span>
          {wrongNet ? <span className="ss-chip-warn"><AlertTriangle size={14} /> Wrong network</span> : bal != null && <span className="ss-chip-bal">{fmtBal(bal)} {CHAINS[chain].native}</span>}
        </button>
        {open === "account" && <Account chain={chain} c={mine} bal={bal} wrongNet={wrongNet} onClose={() => setOpen(null)} onSwitch={() => setOpen("pick")} />}
        {picker}
      </>
    );
  }

  return (
    <>
      <button type="button" className={block ? "ss-btn" : "ss-btn ss-btn-sm"} style={block ? { width: "100%" } : undefined} onClick={() => setOpen("pick")}>
        <WalletIcon size={16} /> {label ?? (block ? "Connect wallet" : "Connect")}
      </button>
      {picker}
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

type Row = { key: string; name: string; sub: string; logo: string | null; tag: "Connected" | "Detected" | "Paired" | null; wallet: Wallet | null; fam: "evm" | "solana" | "near" };

function Picker({ chain, walletconnect, prefer, evm, sol, near, authorised, connected, onClose }: {
  chain: Chain; walletconnect?: string | null; prefer?: "evm" | "near"; evm: Wallet[]; sol: Wallet[]; near: Wallet[] | null; authorised: Record<string, string>; connected: Connected | null; onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wc, setWc] = useState<null | { uri: string | null; ledger?: boolean }>(null);
  const [phone, setPhone] = useState(false);
  const [here, setHere] = useState<URL | null>(null);
  const [ledger, setLedger] = useState<"paired" | "usb" | null>(null);
  const [more, setMore] = useState(false);
  // Privy: undefined while its sign-in methods load, null when Privy didn't say; hidden while Privy's own modal is up.
  const privy = chain !== "near" ? privyApp() : null;
  const [methods, setMethods] = useState<string[] | null | undefined>(undefined);
  const [hidden, setHidden] = useState(false);
  const fams = familiesOf(chain);

  useEffect(() => {
    setPhone(isPhone());
    setHere(new URL(location.href));
    void ledgerState().then(setLedger);
    if (chain === "solana") listSolana();
    if (chain === "near") void loadNear().catch(() => setErr("NEAR wallets didn't load. Try again."));
  }, [chain]);
  useEffect(() => { if (privy) void privyMethods(privy).then((m) => setMethods(m && m.map((x) => x.label))); }, [privy]);

  // Every wallet this site can use, one list: what's installed (or already trusts the site) first, the rest under
  // "More wallets". On a NEAR site that is NEAR wallets and Ethereum wallets together; the buy box adapts to whichever.
  const nearHave = useMemo(() => nearInstalled(), [evm, near]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo<Row[]>(() => {
    const pool: Wallet[] = [...(fams.includes("near") ? near ?? [] : []), ...(fams.includes("evm") ? evm : []), ...(fams.includes("solana") ? sol : [])];
    const r = pool
      .filter((w) => !(w.kind === "near" && (NEAR_HIDDEN.test(w.id) || w.id === "ledger" || w.id === "wallet-connect")))
      .map((w): Row => {
        const k = keyOf(w);
        const fam = familyOf(w);
        const seen = w.kind === "near" ? !!w.injected || nearHave.has(w.id) : true;
        const tag = (connected && keyOf(connected.wallet) === k) || authorised[k] ? "Connected" : seen ? "Detected" : null;
        return { key: k, name: w.name, sub: paysWith(fam, chain), logo: logoOf(w), tag, wallet: w, fam };
      });
    const rank = (x: Row) => (x.tag === "Connected" ? 0 : x.tag ? 1 : 3) + (prefer && x.fam !== prefer ? 0.5 : 0);
    return r.sort((x, y) => rank(x) - rank(y));
  }, [near, evm, sol, authorised, connected, nearHave, chain, prefer]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearLedger = fams.includes("near") ? (near ?? []).find((w) => w.id === "ledger") ?? null : null;
  const nearWc = fams.includes("near") ? (near ?? []).find((w) => w.id === "wallet-connect") ?? null : null;
  const top = rows.filter((r) => r.tag);
  const rest = rows.filter((r) => !r.tag);
  const known = chain === "solana" ? SOL_KNOWN : fams.includes("evm") ? EVM_KNOWN : [];
  const pool = chain === "solana" ? sol : evm;
  const missing = known.filter((k) => !pool.some((w) => k.match.test(w.kind === "evm" ? w.rdns : w.name)));
  // With nothing installed, the install links matter more than a long list of web wallets.
  const nothing = top.length === 0;

  async function pick(row: Row) {
    if (!row.wallet) return;
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

  async function pickWc(viaLedger = false) {
    if (!walletconnect) return;
    setErr(null);
    setWc({ uri: null, ledger: viaLedger });
    let gotUri = false;
    // A wrong project ID or a blocked relay never produces a link; say so instead of spinning forever.
    const slow = setTimeout(() => { if (!gotUri) setErr("WalletConnect didn't answer. Try again in a moment."); }, 15_000);
    try {
      if (connected) await disconnect();
      await connectWalletConnect(walletconnect, chain, (uri) => { gotUri = true; setErr(null); setWc({ uri, ledger: viaLedger }); });
      onClose();
    } catch (e) {
      setErr(walletError(e, "The wallet") ?? "The wallet didn't connect.");
    } finally {
      clearTimeout(slow);
    }
  }

  const rowBtn = (r: Row) => (
    <button key={r.key} type="button" className="ss-wallet" data-wallet={r.key} disabled={!!busy} onClick={() => void pick(r)}>
      <Logo src={r.logo} />
      <span className="ss-wname"><b>{r.name}</b><span>{busy === r.key ? `Confirm in ${r.name}` : r.sub}</span></span>
      {busy === r.key ? <small><Loader2 size={13} className="ss-spin" /></small> : r.tag && <small className={r.tag === "Connected" ? "on" : undefined}>{r.tag}</small>}
    </button>
  );
  const ledgerRow = ledger && (nearLedger || (walletconnect && fams.includes("evm") && !fams.includes("near"))) && (
    <button key="ledger" type="button" className="ss-wallet" data-wallet="ledger" disabled={!!busy}
      onClick={() => void (nearLedger ? pick({ key: keyOf(nearLedger), name: "Ledger", sub: "", logo: null, tag: null, wallet: nearLedger, fam: "near" }) : pickWc(true))}>
      <Logo src={nearLedger?.icon ?? "/wallets/ledger.svg"} />
      <span className="ss-wname"><b>Ledger</b><span>{busy === (nearLedger && keyOf(nearLedger)) ? "Unlock it and open the NEAR app" : nearLedger ? "Hardware wallet over USB, NEAR app" : "Through Ledger Live"}</span></span>
      {ledger === "paired" && <small>Paired</small>}
    </button>
  );
  const wcRow = walletconnect && fams.includes("evm") && chain !== "near" && (
    <button key="wc" type="button" className="ss-wallet" data-wallet="walletconnect" disabled={!!busy} onClick={() => void pickWc()}>
      <Logo src="/wallets/walletconnect.svg" />
      <span className="ss-wname"><b>WalletConnect</b><span>{phone ? "Any wallet app on this phone" : "Scan with a wallet on your phone"}</span></span>
    </button>
  );
  const nearWcRow = nearWc && (
    <button key="nwc" type="button" className="ss-wallet" data-wallet={keyOf(nearWc)} disabled={!!busy} onClick={() => void pick({ key: keyOf(nearWc), name: nearWc.name, sub: "", logo: null, tag: null, wallet: nearWc, fam: "near" })}>
      <Logo src={nearWc.icon ?? "/wallets/walletconnect.svg"} />
      <span className="ss-wname"><b>Phone wallet</b><span>Scan with a NEAR wallet app</span></span>
    </button>
  );
  const privyRow = privy && methods?.length !== 0 && (
    <button key="privy" type="button" className="ss-wallet" data-wallet="privy" disabled={!!busy} onClick={() => void pickPrivy()}>
      <span className="ss-wi"><Mail size={16} /></span>
      <span className="ss-wname"><b>Email or social</b><span>{busy === "privy" ? "Opening…" : methods ? `${methods.slice(0, 3).join(", ")}. No wallet needed` : "No wallet needed"}</span></span>
    </button>
  );
  const installRows = missing.length > 0 && here && missing.map((k) => {
    const app = phone && k.app ? k.app(here) : null;
    return (
      <a key={k.name} className="ss-wallet" data-wallet={`install:${k.name}`} href={app ?? k.install} target={app ? undefined : "_blank"} rel="noreferrer">
        <Logo src={k.logo} />
        <span className="ss-wname"><b>{k.name}</b><span>{app ? "Open this page in the app" : "Not installed"}</span></span>
        <small>{app ? <Smartphone size={13} /> : <ExternalLink size={13} />}</small>
      </a>
    );
  });

  if (hidden) return null;
  if (wc) return <Modal label="Connect with WalletConnect" onClose={onClose}><WcView uri={wc.uri} phone={phone} ledger={!!wc.ledger} onBack={() => { setWc(null); setErr(null); }} err={err} /></Modal>;

  const loadingNear = fams.includes("near") && !near;
  return (
    <Modal label="Connect a wallet" onClose={onClose}>
      <h3>Connect a wallet</h3>
      <p className="ss-msub">{chain === "near" ? "Any NEAR or Ethereum wallet. An Ethereum wallet buys straight into the same address on NEAR." : `${CHAINS[chain].name}. Wallets in this browser come first.`}</p>
      {top.length > 0 && <div className="ss-wsep">In this browser</div>}
      {top.map(rowBtn)}
      {ledger === "paired" && ledgerRow}
      {nothing && privyRow}
      {nothing && installRows}
      <div className="ss-wsep">{nothing ? "Other ways" : "More ways"}</div>
      {!nothing && privyRow}
      {wcRow}
      {nearWcRow}
      {ledger !== "paired" && ledgerRow}
      {loadingNear && <div className="ss-wallet" style={{ cursor: "default" }}><Loader2 size={18} className="ss-spin" /><span className="ss-wname"><b>NEAR wallets</b><span>Loading…</span></span></div>}
      {rest.length > 0 && (more || rest.length <= 2 ? rest.map(rowBtn) : (
        <button type="button" className="ss-wallet ss-wallet-more" onClick={() => setMore(true)}>
          <span className="ss-wi"><WalletIcon size={16} /></span>
          <span className="ss-wname"><b>Web and app wallets</b><span>{rest.slice(0, 3).map((r) => r.name).join(", ")}{rest.length > 3 ? ` and ${rest.length - 3} more` : ""}</span></span>
          <small>Show</small>
        </button>
      ))}
      {err && <div className="ss-err">{err}</div>}
    </Modal>
  );
}

const kind = (c: Chain) => (c === "solana" ? "solana" : c === "near" ? "near" : "evm");

function WcView({ uri, phone, ledger, onBack, err }: { uri: string | null; phone: boolean; ledger?: boolean; onBack: () => void; err: string | null }) {
  const [copied, setCopied] = useState(false);
  const svg = useMemo(() => (uri ? renderSVG(uri, { ecc: "Q", border: 0 }) : null), [uri]);
  return (
    <>
      <button type="button" className="ss-modal-back" onClick={onBack}><ArrowLeft size={16} /> Back</button>
      <h3>{ledger ? "Ledger Live" : "WalletConnect"}</h3>
      <p className="ss-msub">{ledger ? "Open Ledger Live with your Ledger plugged in, then approve there." : phone ? "Pick your wallet app, then approve there." : "Scan with your phone's wallet app."}</p>
      {ledger && <a className="ss-btn" style={{ width: "100%", marginTop: 12 }} href={uri ? `ledgerlive://wc?uri=${enc(uri)}` : undefined} aria-disabled={!uri}>Open Ledger Live</a>}
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
