"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, LogOut, Mail, Repeat, Smartphone, Wallet as WalletIcon } from "lucide-react";
import { renderSVG } from "uqr";
import { CHAINS, type Chain, type TokenInfo } from "@/lib/spec";
import { autoConnect, connect, connectPrivy, connectWalletConnect, disconnect, ensureChain, EVM_CHAIN, familyOf, keyOf, ledgerState, listSolana, loadNear, nearInstalled, NEAR_HIDDEN, privyApp, privyMethods, short, switchAccount, useWallets, type Connected, type Wallet } from "./wallet";
import { num } from "../format";
import { Result, Sheet, SheetError, SkeletonRows, useFlow, Working, type Flow } from "./sheet";

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
  if (code === -32603 || /internal json-rpc/i.test(m)) return `${name} hit an error. Unlock it and try again.`;
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

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What the wallet popup shows: the list, WalletConnect's QR, a wallet being asked, the connected wallet. */
type Screen = "pick" | "wc" | "asking" | "done" | "account";
/** The wallet being asked to connect, for the "Confirm in MetaMask" screen and its Retry. */
type Asking = { key: string; name: string; logo: string | null; hint: string; run: () => Promise<void>; failed?: string | null };

/**
 * quiet: render only the connected chip (nothing while disconnected). The buy box uses it to show which wallet is
 * connected, with Switch account and Disconnect, and to resume a returning wallet before any quote has loaded.
 */
export function WalletButton({ chain, walletconnect, privy, block, prefer, label, ghost, quiet }: { chain: Chain; token?: TokenInfo | null; walletconnect?: string | null; privy?: string | null; block?: boolean; prefer?: "evm" | "near"; label?: string; ghost?: boolean; quiet?: boolean }) {
  const { connected } = useWallets();
  const fam = connected ? familyOf(connected.wallet) : null;
  const mine = connected && fam && familiesOf(chain).includes(fam) ? connected : null;
  // The chip's balance is the site's own coin, so only for a wallet of the site's own family.
  const bal = useBalance(mine && fam === kind(chain) ? mine : null, chain);
  const wrongNet = kind(chain) === "evm" && !!mine && !!EVM_CHAIN[chain] && !!mine.chainId && mine.chainId !== EVM_CHAIN[chain]!.id;

  useEffect(() => { autoConnect(chain, walletconnect, privy); }, [chain, walletconnect, privy]);
  // NEAR's wallet list loads ahead of the click, so the picker opens complete instead of growing as rows arrive.
  useEffect(() => { if (chain === "near") void loadNear().catch(() => undefined); }, [chain]);

  // One tree shape whether or not a wallet is connected, so a sheet that is closing isn't remounted (and re-opened).
  const trigger = mine ? (
    <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost ss-chip" data-el="wallet-chip" onClick={() => openWallet({ chain, walletconnect, prefer }, "account")} title={mine.address}>
      {logoOf(mine.wallet) ? <img src={logoOf(mine.wallet)!} alt="" width={18} height={18} style={{ borderRadius: 4 }} /> : <WalletIcon size={16} />}
      <span className="ss-mono">{short(mine.address)}</span>
      {wrongNet ? <span className="ss-chip-warn"><AlertTriangle size={14} /> Wrong network</span> : bal != null && <span className="ss-chip-bal">{fmtBal(bal)} {CHAINS[chain].native}</span>}
    </button>
  ) : quiet ? null : (
    <button type="button" className={`ss-btn${block ? "" : " ss-btn-sm"}${ghost ? " ss-btn-ghost" : ""}`} style={block ? { width: "100%" } : undefined} onClick={() => openWallet({ chain, walletconnect, prefer }, "pick")}>
      <WalletIcon size={16} /> {label ?? (block ? "Connect wallet" : "Connect")}
    </button>
  );
  return trigger;
}

type Opts = { chain: Chain; walletconnect?: string | null; prefer?: "evm" | "near" };
let host: Root | null = null;
let opened = 0;

/**
 * Opens the wallet popup. It lives in a small root of its own, not inside the button that opened it: a Connect button
 * inside the buy box is replaced the moment a wallet connects, and the popup has to outlive it to show "Connected".
 */
function openWallet(o: Opts, first: "pick" | "account") {
  host ??= createRoot(document.createElement("div"));
  host.render(<WalletHost key={++opened} {...o} first={first} />);
}

function WalletHost({ chain, walletconnect, prefer, first }: Opts & { first: "pick" | "account" }) {
  const { evm, sol, near, authorised, connected } = useWallets();
  const flow = useFlow<Screen>();
  useEffect(() => { flow.open(first); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fam = connected ? familyOf(connected.wallet) : null;
  const mine = connected && fam && familiesOf(chain).includes(fam) ? connected : null;
  const bal = useBalance(flow.screen === "account" && mine && fam === kind(chain) ? mine : null, chain);
  const wrongNet = kind(chain) === "evm" && !!mine && !!EVM_CHAIN[chain] && !!mine.chainId && mine.chainId !== EVM_CHAIN[chain]!.id;
  if (!flow.screen) return null;
  return <WalletSheet flow={flow} chain={chain} walletconnect={walletconnect} prefer={prefer} evm={evm} sol={sol} near={near} authorised={authorised} connected={connected} mine={mine} bal={bal} wrongNet={wrongNet} />;
}

type Row = { key: string; name: string; sub: string; logo: string | null; tag: "Connected" | "Detected" | "Paired" | null; wallet: Wallet | null; fam: "evm" | "solana" | "near" };

/** The wallet popup: one card whose screens slide (list → asking the wallet → connected; list → WalletConnect; account). */
function WalletSheet({ flow, chain, walletconnect, prefer, evm, sol, near, authorised, connected, mine, bal, wrongNet }: {
  flow: Flow<Screen>; chain: Chain; walletconnect?: string | null; prefer?: "evm" | "near"; evm: Wallet[]; sol: Wallet[]; near: Wallet[] | null; authorised: Record<string, string>; connected: Connected | null; mine: Connected | null; bal: number | null; wrongNet: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [wc, setWc] = useState<null | { uri: string | null; ledger?: boolean }>(null);
  // Hidden while Privy's own sign-in window is up; it is the one thing on screen then.
  const [hidden, setHidden] = useState(false);
  const doneT = useRef<number | undefined>(undefined);
  // A wallet that answers after the popup was closed must not open it again.
  const gone = useRef(false);
  useEffect(() => { gone.current = flow.closing; }, [flow.closing]);
  useEffect(() => () => { gone.current = true; clearTimeout(doneT.current); }, []);
  // The account screen keeps showing the wallet while it closes after Disconnect.
  const lastMine = useRef(mine);
  if (mine) lastMine.current = mine;
  const screen = flow.screen!;
  // The account screen needs a wallet; if it disconnected underneath, close.
  useEffect(() => { if (screen === "account" && !mine && !flow.closing) flow.close(); }, [screen, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Connected: a check for a moment, then the popup closes by itself. */
  const finish = useCallback(() => {
    if (gone.current) return;
    flow.replace("done");
    doneT.current = window.setTimeout(flow.close, reducedMotion() ? 500 : 900);
  }, [flow]);

  /** Ask a wallet: the asking screen (its logo in a turning ring) until it answers; a no stays there with Retry. */
  const ask = useCallback((a: Omit<Asking, "failed">, fromList = true) => {
    setErr(null);
    const next: Asking = { ...a };
    setAsking(next);
    if (fromList) flow.go("asking");
    void a.run().then(finish, (e: unknown) => {
      setAsking({ ...next, failed: walletError(e, a.name) ?? `You closed ${a.name} before it connected.` });
    });
  }, [flow, finish]);

  const title = screen === "pick" ? "Connect a wallet" : screen === "wc" ? (wc?.ledger ? "Ledger Live" : "WalletConnect") : screen === "asking" ? (asking?.name ?? "Connecting") : screen === "done" ? (asking?.name ?? connected?.wallet.name ?? "Wallet") : "Your wallet";
  if (hidden) return null;
  return (
    <Sheet screen={screen} dir={flow.dir} closing={flow.closing} title={title} onClose={flow.close} onBack={flow.canBack && screen !== "done" ? () => { setErr(null); setWc(null); flow.back(); } : undefined}>
      {screen === "pick" && <PickList chain={chain} walletconnect={walletconnect} prefer={prefer} evm={evm} sol={sol} near={near} authorised={authorised} connected={connected} err={err} setErr={setErr} ask={ask} setHidden={setHidden} onWc={(ledger) => {
        if (!walletconnect) return;
        setErr(null);
        setWc({ uri: null, ledger });
        flow.go("wc");
        let gotUri = false;
        // A wrong project ID or a blocked relay never produces a link; say so instead of spinning forever.
        const slow = setTimeout(() => { if (!gotUri) setErr("WalletConnect didn't answer. Try again in a moment."); }, 15_000);
        void (async () => {
          try {
            if (connected) await disconnect();
            await connectWalletConnect(walletconnect, chain, (uri) => { gotUri = true; setErr(null); setWc({ uri, ledger }); });
            finish();
          } catch (e) {
            setErr(walletError(e, "The wallet") ?? "The wallet didn't connect.");
          } finally {
            clearTimeout(slow);
          }
        })();
      }} />}
      {screen === "wc" && <WcView uri={wc?.uri ?? null} phone={isPhone()} ledger={!!wc?.ledger} err={err} />}
      {screen === "asking" && asking && (
        <Working icon={<Logo src={asking.logo} />} failed={!!asking.failed} title={asking.failed ? "Not connected" : `Waiting for ${asking.name}`} sub={asking.failed ?? asking.hint}>
          {asking.failed && <div className="ss-sh-actions"><button type="button" className="ss-btn" onClick={() => ask(asking, false)}>Try again</button></div>}
        </Working>
      )}
      {screen === "done" && (
        <Result ok title="Connected" sub={connected ? <span className="ss-mono">{short(connected.address)}</span> : undefined} />
      )}
      {screen === "account" && lastMine.current && <AccountView chain={chain} c={lastMine.current} bal={bal} wrongNet={wrongNet} onClose={flow.close} onSwitch={() => flow.replace("pick")} />}
    </Sheet>
  );
}

function PickList({ chain, walletconnect, prefer, evm, sol, near, authorised, connected, err, setErr, ask, setHidden, onWc }: {
  chain: Chain; walletconnect?: string | null; prefer?: "evm" | "near"; evm: Wallet[]; sol: Wallet[]; near: Wallet[] | null; authorised: Record<string, string>; connected: Connected | null;
  err: string | null; setErr: (e: string | null) => void; ask: (a: Omit<Asking, "failed">) => void; setHidden: (h: boolean) => void; onWc: (ledger: boolean) => void;
}) {
  // Known on the first frame (the picker only ever renders in the browser, after a click), so no row arrives late.
  const [phone] = useState(isPhone);
  const [here] = useState(() => new URL(location.href));
  const [ledger, setLedger] = useState<"paired" | "usb" | null>(() => (!isPhone() && "hid" in navigator ? "usb" : null));
  const [more, setMore] = useState(false);
  // Privy: undefined while its sign-in methods load, null when Privy didn't say.
  const privy = chain !== "near" ? privyApp() : null;
  const [methods, setMethods] = useState<string[] | null | undefined>(undefined);
  const fams = familiesOf(chain);

  useEffect(() => {
    if (!phone) void ledgerState().then(setLedger);
    if (chain === "solana") listSolana();
    if (chain === "near") void loadNear().catch(() => setErr("NEAR wallets didn't load. Try again."));
  }, [chain]); // eslint-disable-line react-hooks/exhaustive-deps
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
  useEffect(() => { for (const r of rest) if (r.logo) { const i = new Image(); i.src = r.logo; } }, [rest.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = chain === "solana" ? SOL_KNOWN : fams.includes("evm") ? EVM_KNOWN : [];
  const pool = chain === "solana" ? sol : evm;
  const missing = known.filter((k) => !pool.some((w) => k.match.test(w.kind === "evm" ? w.rdns : w.name)));
  // With nothing installed, the install links matter more than a long list of web wallets.
  const nothing = top.length === 0;

  const pick = (row: Row, hint?: string) => {
    if (!row.wallet) return;
    const w = row.wallet;
    ask({
      key: row.key, name: row.name, logo: row.logo ?? w.icon ?? null,
      hint: hint ?? (w.kind === "near" && !w.injected ? `Sign in on the ${row.name} page that opened, then come back here.` : `Open ${row.name} and approve the connection.`),
      run: async () => {
        if (connected && keyOf(connected.wallet) !== row.key) await disconnect();
        await connect(w, chain);
      },
    });
  };

  const pickPrivy = () => ask({
    key: "privy", name: "Email or social", logo: null, hint: "Finish signing in in the window that opened.",
    run: async () => {
      try {
        if (connected) await disconnect();
        await connectPrivy(chain, { onOpen: () => setHidden(true) });
      } finally {
        setHidden(false);
      }
    },
  });

  const rowBtn = (r: Row) => (
    <button key={r.key} type="button" className="ss-wallet" data-wallet={r.key} onClick={() => pick(r)}>
      <Logo src={r.logo} />
      <span className="ss-wname"><b>{r.name}</b><span>{r.sub}</span></span>
      {r.tag && <small className={r.tag === "Connected" ? "on" : undefined}>{r.tag}</small>}
    </button>
  );
  const ledgerRow = ledger && !phone && (fams.includes("near") || (walletconnect && fams.includes("evm"))) && (
    <button key="ledger" type="button" className="ss-wallet" data-wallet="ledger" disabled={fams.includes("near") && !nearLedger}
      onClick={() => (nearLedger ? pick({ key: keyOf(nearLedger), name: "Ledger", sub: "", logo: nearLedger.icon ?? "/wallets/ledger.svg", tag: null, wallet: nearLedger, fam: "near" }, "Unlock your Ledger and open the NEAR app.") : onWc(true))}>
      <Logo src={nearLedger?.icon ?? "/wallets/ledger.svg"} />
      <span className="ss-wname"><b>Ledger</b><span>{nearLedger ? "Hardware wallet over USB, NEAR app" : "Through Ledger Live"}</span></span>
      {ledger === "paired" && <small>Paired</small>}
    </button>
  );
  const wcRow = walletconnect && fams.includes("evm") && chain !== "near" && (
    <button key="wc" type="button" className="ss-wallet" data-wallet="walletconnect" onClick={() => onWc(false)}>
      <Logo src="/wallets/walletconnect.svg" />
      <span className="ss-wname"><b>WalletConnect</b><span>{phone ? "Any wallet app on this phone" : "Scan with a wallet on your phone"}</span></span>
    </button>
  );
  const nearWcRow = nearWc && (
    <button key="nwc" type="button" className="ss-wallet" data-wallet={keyOf(nearWc)} onClick={() => pick({ key: keyOf(nearWc), name: "Phone wallet", sub: "", logo: nearWc.icon ?? "/wallets/walletconnect.svg", tag: null, wallet: nearWc, fam: "near" }, "Scan the code with a NEAR wallet app, then approve there.")}>
      <Logo src={nearWc.icon ?? "/wallets/walletconnect.svg"} />
      <span className="ss-wname"><b>Phone wallet</b><span>Scan with a NEAR wallet app</span></span>
    </button>
  );
  const privyRow = privy && methods?.length !== 0 && (
    <button key="privy" type="button" className="ss-wallet" data-wallet="privy" onClick={pickPrivy}>
      <span className="ss-wi"><Mail size={16} /></span>
      <span className="ss-wname"><b>Email or social</b><span>{methods ? `${methods.slice(0, 3).join(", ")}. No wallet needed` : "No wallet needed"}</span></span>
    </button>
  );
  const installRows = missing.length > 0 && missing.filter((k) => !phone || k.app).map((k) => {
    const app = phone && k.app ? k.app(here) : null;
    return (
      <a key={k.name} className="ss-wallet" data-wallet={`install:${k.name}`} href={app ?? k.install} target={app ? undefined : "_blank"} rel="noreferrer">
        <Logo src={k.logo} />
        <span className="ss-wname"><b>{k.name}</b><span>{app ? "Open this page in the app" : "Not installed"}</span></span>
        <small>{app ? <Smartphone size={13} /> : <ExternalLink size={13} />}</small>
      </a>
    );
  });

  const loadingNear = fams.includes("near") && !near;
  // A NEAR site with nothing installed: NEAR's web wallets need no install, so they lead; Ethereum installs follow.
  const nearFirst = nothing && fams.includes("near");
  const restNear = rest.filter((r) => r.fam === "near");
  const restOther = rest.filter((r) => r.fam !== "near");
  const loadingRow = <SkeletonRows key="loading" n={3} />;
  const moreList = (rs: Row[], lead: number) => rs.length > 0 && (more || rs.length <= lead + 1 ? (
    <div>{rs.map(rowBtn)}</div>
  ) : (
    <>
      {rs.slice(0, lead).map(rowBtn)}
      <button type="button" className="ss-wallet ss-wallet-more" onClick={() => setMore(true)}>
        <span className="ss-wi"><WalletIcon size={16} /></span>
        <span className="ss-wname"><b>{lead ? "More NEAR wallets" : "Web and app wallets"}</b><span>{rs.slice(lead, lead + 3).map((r) => r.name).join(", ")}{rs.length - lead > 3 ? ` and ${rs.length - lead - 3} more` : ""}</span></span>
        <small>Show</small>
      </button>
    </>
  ));
  return (
    <>
      <p className="ss-sh-sub">{chain === "near" ? "Any NEAR or Ethereum wallet. An Ethereum wallet buys straight into the same address on NEAR." : `${CHAINS[chain].name}. Wallets in this browser come first.`}</p>
      {nearFirst ? (
        <>
          <div className="ss-wsep">NEAR wallets, no install needed</div>
          {loadingNear ? loadingRow : moreList(restNear, 3)}
          {nearWcRow}
          {ledgerRow}
          {installRows && <div className="ss-wsep">Ethereum wallets</div>}
          {installRows}
          {moreList(restOther, 0)}
        </>
      ) : (
        <>
          {top.length > 0 && <div className="ss-wsep">In this browser</div>}
          {top.map(rowBtn)}
          {nothing && privyRow}
          {nothing && installRows}
          <div className="ss-wsep">{nothing ? "Other ways" : "More ways"}</div>
          {!nothing && privyRow}
          {wcRow}
          {nearWcRow}
          {ledgerRow}
          {loadingNear ? loadingRow : moreList(rest, 0)}
        </>
      )}
      {err && <SheetError msg={err} />}
    </>
  );
}

const kind = (c: Chain) => (c === "solana" ? "solana" : c === "near" ? "near" : "evm");

function WcView({ uri, phone, ledger, err }: { uri: string | null; phone: boolean; ledger?: boolean; err: string | null }) {
  const [copied, setCopied] = useState(false);
  const svg = useMemo(() => (uri ? renderSVG(uri, { ecc: "Q", border: 0 }) : null), [uri]);
  return (
    <>
      <p className="ss-sh-sub">{ledger ? "Open Ledger Live with your Ledger plugged in, then approve there." : phone ? "Pick your wallet app, then approve there." : "Scan with your phone's wallet app."}</p>
      {ledger && <a className="ss-btn" style={{ width: "100%" }} href={uri ? `ledgerlive://wc?uri=${enc(uri)}` : undefined} aria-disabled={!uri}>Open Ledger Live</a>}
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
      {err && <SheetError msg={err} />}
    </>
  );
}

function AccountView({ chain, c, bal, wrongNet, onClose, onSwitch }: { chain: Chain; c: Connected; bal: number | null; wrongNet: boolean; onClose: () => void; onSwitch: () => void }) {
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
    <>
      <div className="ss-sh-state" style={{ paddingTop: 2 }}>
        <span className="ss-sh-acct-logo"><Logo src={logoOf(c.wallet)} /></span>
        <b style={{ marginTop: 6 }}>{c.wallet.name}</b>
        <p>{bal != null ? `${fmtBal(bal)} ${CHAINS[chain].native}` : chain === "near" && familyOf(c.wallet) === "evm" ? "Ethereum wallet, same address on NEAR" : CHAINS[chain].name}</p>
      </div>
      <button type="button" className="ss-sh-copy" style={{ marginTop: 14 }} onClick={() => { void navigator.clipboard?.writeText(c.address); setCopied(true); setTimeout(() => setCopied(false), 1400); }} aria-label="Copy address">
        <code className="ss-mono">{c.address}</code>
        <span>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</span>
      </button>
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
      {err && <SheetError msg={err} />}
    </>
  );
}
