"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, ClipboardPaste, Copy, Loader2, MousePointerClick, Plug, ShieldCheck, Cable, UserPlus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { BRANDS, BrandIcon, BrandLogo, LogoStack, LOGOS } from "@/components/brand";
import { GooglePane, XDataPane } from "./IntegrationsGoogle";
import { Connectors } from "./Connectors";
import type { PublicProject } from "@/lib/public";

// Guided setup for services that need an ID from their own dashboard. Each guide is a short run of
// illustrated steps, a button that opens the right page, a paste box, and a live check before saving.

type Id = "evm" | "solana" | "near" | "intents" | "walletconnect" | "privy" | "helius" | "alchemy" | "ga" | "gsc" | "xdata" | "connectors";

interface GuideStep { title: string; body: string; art: ReactNode }

function Browser({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0c0c10]">
      <div className="flex h-6 items-center gap-1.5 border-b border-white/[0.06] px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-white/20" /><span className="h-1.5 w-1.5 rounded-full bg-white/20" /><span className="h-1.5 w-1.5 rounded-full bg-white/20" />
        <span className="ml-2 truncate rounded bg-white/[0.05] px-2 font-mono text-[9.5px] text-zinc-500">{url}</span>
      </div>
      <div className="relative h-[92px] p-3">{children}</div>
    </div>
  );
}

const Cursor = ({ className = "" }: { className?: string }) => (
  <MousePointerClick size={16} className={`absolute text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${className}`} />
);

const GUIDES: Record<"walletconnect" | "privy", { name: string; dashboard: string; host: string; idLabel: string; placeholder: string; steps: GuideStep[] }> = {
  privy: {
    name: "Privy",
    dashboard: "https://dashboard.privy.io",
    host: "dashboard.privy.io",
    idLabel: "Privy App ID",
    placeholder: "clx1y2z3a0000abcdefgh1234",
    steps: [
      {
        title: "Sign up or log in",
        body: "Open the Privy dashboard and sign in with email or GitHub. It's free to start.",
        art: (
          <Browser url="dashboard.privy.io">
            <div className="mx-auto w-40 space-y-1.5">
              <div className="h-4 rounded bg-white/[0.06]" />
              <div className="flex h-5 items-center justify-center rounded bg-white text-[9px] font-semibold text-black">Continue with email</div>
            </div>
            <Cursor className="bottom-3 left-[58%] animate-pop" />
          </Browser>
        ),
      },
      {
        title: "Create an app",
        body: "Click New app, name it after your project and pick Web as the platform.",
        art: (
          <Browser url="dashboard.privy.io/apps">
            <div className="flex items-center justify-between"><div className="h-3 w-16 rounded bg-white/10" /><div className="flex h-5 items-center rounded bg-[#6A6FF5] px-2 text-[9px] font-semibold text-white">+ New app</div></div>
            <div className="mt-2 grid grid-cols-3 gap-1.5"><div className="h-9 rounded bg-white/[0.05]" /><div className="h-9 rounded bg-white/[0.05]" /><div className="h-9 rounded bg-white/[0.05]" /></div>
            <Cursor className="right-4 top-7 animate-pop" />
          </Browser>
        ),
      },
      {
        title: "Copy the App ID",
        body: "Go to Configuration → App settings → Basics. The App ID is public, so it's safe to paste here.",
        art: (
          <Browser url="dashboard.privy.io/apps/…/settings">
            <div className="text-[9px] text-zinc-500">App ID</div>
            <div className="mt-1 flex h-6 items-center justify-between rounded border border-white/10 bg-white/[0.03] px-2 font-mono text-[9.5px] text-zinc-300">clx1y2z3a0000ab… <Copy size={10} className="text-[#6A6FF5]" /></div>
            <div className="mt-2 text-[9px] text-zinc-500">App secret · never share</div>
            <Cursor className="right-3 top-8 animate-pop" />
          </Browser>
        ),
      },
      {
        title: "Allow your site's domain",
        body: "Under Configuration → App settings → Domains, add your published address so sign-in works there.",
        art: (
          <Browser url="dashboard.privy.io/apps/…/domains">
            <div className="text-[9px] text-zinc-500">Allowed domains</div>
            <div className="mt-1 flex h-6 items-center rounded border border-lime/40 bg-lime/[0.06] px-2 font-mono text-[9.5px] text-lime">your-site.domain</div>
            <div className="mt-1.5 flex h-6 items-center rounded border border-white/10 px-2 font-mono text-[9.5px] text-zinc-500">localhost:3100</div>
          </Browser>
        ),
      },
    ],
  },
  walletconnect: {
    name: "WalletConnect",
    dashboard: "https://cloud.reown.com",
    host: "cloud.reown.com",
    idLabel: "Project ID",
    placeholder: "32 characters, 0–9 and a–f",
    steps: [
      {
        title: "Sign up on Reown Cloud",
        body: "WalletConnect's dashboard is Reown Cloud. Sign in with email, GitHub or a wallet.",
        art: (
          <Browser url="cloud.reown.com">
            <div className="mx-auto w-40 space-y-1.5">
              <div className="h-4 rounded bg-white/[0.06]" />
              <div className="flex h-5 items-center justify-center rounded bg-[#3B99FC] text-[9px] font-semibold text-white">Sign up</div>
            </div>
            <Cursor className="bottom-3 left-[55%] animate-pop" />
          </Browser>
        ),
      },
      {
        title: "Create a project",
        body: "Click Create project, choose AppKit and Web, and give it your site's name.",
        art: (
          <Browser url="cloud.reown.com/app">
            <div className="flex items-center justify-between"><div className="h-3 w-20 rounded bg-white/10" /><div className="flex h-5 items-center rounded bg-[#3B99FC] px-2 text-[9px] font-semibold text-white">Create project</div></div>
            <div className="mt-2 flex gap-1.5"><div className="flex h-8 flex-1 items-center justify-center rounded border border-[#3B99FC]/60 text-[9px] text-zinc-300">AppKit</div><div className="flex h-8 flex-1 items-center justify-center rounded border border-white/10 text-[9px] text-zinc-500">WalletKit</div></div>
            <Cursor className="right-4 top-7 animate-pop" />
          </Browser>
        ),
      },
      {
        title: "Copy the Project ID",
        body: "It's at the top of the project page. Project IDs are public.",
        art: (
          <Browser url="cloud.reown.com/app/…/project">
            <div className="text-[9px] text-zinc-500">Project ID</div>
            <div className="mt-1 flex h-6 items-center justify-between rounded border border-white/10 bg-white/[0.03] px-2 font-mono text-[9.5px] text-zinc-300">a1b2c3d4e5f6… <Copy size={10} className="text-[#3B99FC]" /></div>
            <Cursor className="right-3 top-8 animate-pop" />
          </Browser>
        ),
      },
      {
        title: "Add your domain to the allowlist",
        body: "In the project's Domain section, add your published address. Unlisted domains get blocked.",
        art: (
          <Browser url="cloud.reown.com/app/…/domain">
            <div className="text-[9px] text-zinc-500">Allowlist</div>
            <div className="mt-1 flex h-6 items-center rounded border border-lime/40 bg-lime/[0.06] px-2 font-mono text-[9.5px] text-lime">your-site.domain</div>
          </Browser>
        ),
      },
    ],
  },
};

function Row({ on, active, mark, name, status, onClick }: { on: boolean; active: boolean; mark: ReactNode; name: string; status: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-12 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left ${active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
      {mark}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-white">{name}</span>
        <span className={`block truncate text-[11.5px] ${on ? "text-lime" : "text-zinc-500"}`}>{status}</span>
      </span>
      {on && <CheckCircle2 size={15} className="shrink-0 text-lime" />}
    </button>
  );
}


export function IntegrationsDialog({ open, onClose, project, onSaved, heliusOnServer, alchemyOnServer = false, startAt }: {
  open: boolean; onClose: () => void; project: PublicProject; onSaved: (p: PublicProject) => void; heliusOnServer: boolean; alchemyOnServer?: boolean; startAt?: Id;
}) {
  const [active, setActive] = useState<Id>(startAt ?? (project.kind === "dapp" ? "privy" : "evm"));
  useEffect(() => { if (open && startAt) setActive(startAt); }, [open, startAt]);
  const ints = project.integrations;

  const rows: Array<{ id: Id; name: string; mark: ReactNode; on: boolean; status: string }> = [
    { id: "evm", name: "MetaMask and EVM wallets", mark: <BrandLogo src={LOGOS.metamask} />, on: true, status: "Built in" },
    { id: "solana", name: "Phantom and Solana wallets", mark: <BrandLogo src={LOGOS.phantom} />, on: true, status: "Built in" },
    { id: "near", name: "NEAR wallets", mark: <BrandLogo src={LOGOS.hot} />, on: true, status: "Built in, via neartrade" },
    { id: "intents", name: "NEAR Intents", mark: <LogoStack srcs={[LOGOS.nearIntents]} />, on: true, status: "Cross-chain buys" },
    { id: "walletconnect", name: "WalletConnect", mark: <BrandLogo src={LOGOS.walletconnect} />, on: !!ints.walletconnectProjectId, status: ints.walletconnectProjectId ? "Connected" : "Needs a Project ID" },
    { id: "privy", name: "Privy", mark: <BrandLogo src={LOGOS.privy} />, on: !!ints.privyAppId, status: ints.privyAppId ? "Connected" : project.kind === "dapp" ? "Recommended for dApps" : "Email and social sign-in" },
    { id: "helius", name: "Helius", mark: <BrandLogo src={LOGOS.helius} />, on: heliusOnServer, status: heliusOnServer ? "On for Solana data" : "Public Solana RPC" },
    { id: "alchemy", name: "Alchemy", mark: <BrandLogo src={LOGOS.alchemy} />, on: alchemyOnServer, status: alchemyOnServer ? "On for EVM data" : "Public EVM RPC" },
    { id: "ga", name: "Google Analytics", mark: <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.07]"><BrandIcon icon={BRANDS.googleAnalytics} size={15} /></span>, on: !!ints.gaId, status: ints.gaId ? ints.gaId : "Visitors, sources, buys" },
    { id: "gsc", name: "Google Search Console", mark: <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.07]"><BrandIcon icon={BRANDS.searchConsole} size={15} /></span>, on: !!ints.gscToken, status: ints.gscToken ? "Verified tag on the site" : "Show up on Google" },
    { id: "xdata", name: "X data (twitterapi.io)", mark: <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.07]"><BrandIcon icon={BRANDS.x} size={13} color="#fff" /></span>, on: false, status: "Live posts from your X" },
    { id: "connectors", name: "Connectors (MCP)", mark: <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.07] text-zinc-300"><Cable size={15} /></span>, on: false, status: "Data the agent can read" },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Integrations" icon={<Plug size={15} />} width={900}>
      <div className="grid min-h-[520px] md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-0.5 border-b border-white/[0.07] p-2 md:border-b-0 md:border-r">
          {rows.map((r) => <Row key={r.id} {...r} active={active === r.id} onClick={() => setActive(r.id)} />)}
        </div>
        <div className="min-w-0 p-5">
          {active === "connectors"
            ? <Connectors project={project} onSaved={onSaved} onClose={onClose} />
            : active === "ga" || active === "gsc"
            ? <GooglePane key={active} which={active} project={project} onSaved={onSaved} />
            : active === "xdata"
            ? <XDataPane project={project} />
            : active === "walletconnect" || active === "privy"
            ? <Guide key={active} which={active} project={project} onSaved={onSaved} />
            : <BuiltIn which={active} heliusOnServer={heliusOnServer} alchemyOnServer={alchemyOnServer} />}
        </div>
      </div>
    </Dialog>
  );
}

/** The wallets and services each built-in pane stands for, by their own marks. */
const PANE_LOGOS: Record<"evm" | "solana" | "near" | "intents" | "helius" | "alchemy", string[]> = {
  evm: [LOGOS.metamask, LOGOS.rabby], solana: [LOGOS.phantom, LOGOS.solflare, LOGOS.backpack],
  near: [LOGOS.hot, LOGOS.meteor, LOGOS.intear], intents: [LOGOS.nearIntents], helius: [LOGOS.helius], alchemy: [LOGOS.alchemy],
};

function BuiltIn({ which, heliusOnServer, alchemyOnServer }: { which: Exclude<Id, "walletconnect" | "privy" | "connectors" | "ga" | "gsc" | "xdata">; heliusOnServer: boolean; alchemyOnServer: boolean }) {
  const copy: Record<typeof which, { title: string; points: string[] }> = {
    evm: { title: "MetaMask, Rabby, Coinbase Wallet and more", points: ["Every installed EVM wallet announces itself (EIP-6963), so visitors see their own wallet with its real logo.", "On Robinhood Chain the site asks the wallet to switch networks, or adds the network if it's new.", "Buys swap right on the site through KyberSwap; the visitor confirms in their wallet.", "No setup needed."] },
    solana: { title: "Phantom, Solflare and Backpack", points: ["Found through the Wallet Standard, with each wallet's own logo. If none is installed, the menu links to Phantom and Solflare.", "Buys swap right on the site through Jupiter; the visitor confirms in their wallet.", "No setup needed."] },
    near: { title: "HOT, Meteor, Intear, Ledger and more", points: ["NEAR Connect shows every NEAR wallet, browser and mobile.", "Buys swap on the site through neartrade, which routes every launchpad curve and Rhea pool.", "No setup needed."] },
    intents: { title: "Buy from other chains", points: ["The buy box has an Other chains tab: pay with ETH, SOL, BTC, USDC, NEAR, SUI, ZEC and more, 18 coins on 13 chains.", "NEAR Intents gives a one-time deposit address; the token, or the chain's native coin, lands in the buyer's wallet.", "Refunds go back to the buyer's own address if a swap can't fill.", "On NEAR tokens, a With ETH tab buys straight from an Ethereum wallet: ETH or USDC on Ethereum, Base or Arbitrum, landing in the buyer's own 0x account on NEAR. Selling works the same way back."] },
    helius: { title: heliusOnServer ? "Helius is on" : "Helius for Solana data", points: heliusOnServer ? ["Solana token names, logos and holder counts come from Helius DAS.", "The key stays on the server; published pages never see it."] : ["Add HELIUS_API_KEY to the server's environment to read Solana names, logos and holder counts from Helius DAS.", "Until then, Solana reads use the public RPC and DexScreener."] },
    alchemy: { title: alchemyOnServer ? "Alchemy is on" : "Alchemy for EVM data", points: alchemyOnServer ? ["Ethereum, Base and BNB Chain reads (name, symbol, supply, balances) go through Alchemy.", "Token logos come from Alchemy's token metadata when DexScreener has none.", "The key stays on the server; published pages never see it."] : ["Add ALCHEMY_API_KEY to the server's environment, or your own key in Settings, to read Ethereum, Base and BNB Chain through Alchemy.", "Until then, EVM reads use public RPCs and DexScreener."] },
  };
  const c = copy[which];
  return (
    <div className="animate-rise">
      <div className="flex items-center gap-3 text-[15px] font-semibold text-white"><LogoStack srcs={PANE_LOGOS[which]} size={32} /> {c.title}</div>
      <ul className="mt-4 space-y-2.5">
        {c.points.map((p) => <li key={p} className="flex gap-2.5 text-[13.5px] leading-relaxed text-zinc-300"><Check size={15} className="mt-0.5 shrink-0 text-lime" />{p}</li>)}
      </ul>
      {which === "alchemy" && !alchemyOnServer && (
        <a className="btn btn-outline mt-5" href="https://dashboard.alchemy.com" target="_blank" rel="noreferrer">Get an Alchemy key <ArrowUpRight size={14} /></a>
      )}
      {which === "helius" && !heliusOnServer && (
        <a className="btn btn-outline mt-5" href="https://dashboard.helius.dev" target="_blank" rel="noreferrer">Get a Helius key <ArrowUpRight size={14} /></a>
      )}
    </div>
  );
}

function Guide({ which, project, onSaved }: { which: "walletconnect" | "privy"; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const g = GUIDES[which];
  const saved = which === "privy" ? project.integrations.privyAppId : project.integrations.walletconnectProjectId;
  const [at, setAt] = useState(saved ? g.steps.length : 0);
  const [value, setValue] = useState(saved ?? "");
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "bad"; reason?: string; name?: string | null; domains?: string[] | null }>({ state: saved ? "ok" : "idle" });
  const [saving, setSaving] = useState(false);

  async function verify(v = value) {
    const id = v.trim();
    if (!id) return;
    setCheck({ state: "checking" });
    const r = await fetch(`/api/verify?kind=${which}&id=${encodeURIComponent(id)}`).then((x) => x.json()).catch(() => ({ ok: false, reason: "Couldn't reach the check." }));
    setCheck(r.ok ? { state: "ok", name: r.name, domains: r.allowedDomains } : { state: "bad", reason: r.reason });
  }

  async function save() {
    setSaving(true);
    const body = which === "privy" ? { privyAppId: value.trim() } : { walletconnectProjectId: value.trim() };
    const r = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) onSaved((await r.json()) as PublicProject);
  }

  async function pasteFromClipboard() {
    const t = await navigator.clipboard?.readText?.().catch(() => "");
    if (t) { setValue(t.trim()); void verify(t.trim()); }
  }

  const site = project.published ? `${project.published.slug}` : null;
  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo src={which === "privy" ? LOGOS.privy : LOGOS.walletconnect} size={32} />
        <div className="text-[15px] font-semibold text-white">Connect {g.name}</div>
        <span className="text-[12px] text-zinc-500">{which === "privy" ? "Email, social and embedded-wallet sign-in" : "Phone wallets by QR code"}</span>
        <a className="btn btn-primary ml-auto" href={g.dashboard} target="_blank" rel="noreferrer" onClick={() => setAt((a) => Math.max(a, 1))}>
          <UserPlus size={15} /> Open {g.host} <ArrowUpRight size={14} />
        </a>
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {g.steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          return (
            <li key={s.title} style={{ animationDelay: `${i * 70}ms` }}>
              <button type="button" onClick={() => setAt(i)} className={`block w-full animate-rise rounded-[12px] border p-3 text-left transition-colors ${state === "now" ? "border-sel/60 bg-sel/[0.06]" : "border-white/[0.07] bg-ink-850 hover:border-white/15"}`}>
                {s.art}
                <div className="mt-3 flex items-center gap-2">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold ${state === "done" ? "bg-lime text-ink-950" : state === "now" ? "bg-sel text-ink-950" : "bg-white/10 text-zinc-400"}`}>
                    {state === "done" ? <Check size={11} strokeWidth={3.5} /> : i + 1}
                  </span>
                  <span className="text-[13px] font-medium text-white">{s.title}</span>
                </div>
                <p className="mt-1 pl-7 text-[12.5px] leading-snug text-zinc-400">{s.body}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
        <label htmlFor="int-id" className="text-[12.5px] font-medium text-zinc-300">{g.idLabel}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="int-id"
            className="field min-w-0 flex-1 basis-[220px] font-mono text-[13px]"
            value={value}
            placeholder={g.placeholder}
            spellCheck={false}
            onChange={(e) => { setValue(e.target.value); setCheck({ state: "idle" }); }}
            onBlur={() => void verify()}
            onKeyDown={(e) => { if (e.key === "Enter") void verify(); }}
          />
          <button type="button" className="btn btn-outline h-10" onClick={() => void pasteFromClipboard()}><ClipboardPaste size={15} /> Paste</button>
          <button type="button" className="btn btn-outline h-10" disabled={!value.trim() || check.state === "checking"} onClick={() => void verify()}>
            {check.state === "checking" ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Check
          </button>
        </div>
        {check.state === "ok" && (
          <div className="mt-2.5 flex animate-rise items-start gap-2 text-[12.5px] text-lime">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>
              {g.name} knows this ID{check.name ? `: app “${check.name}”` : ""}.
              {check.domains && site && !check.domains.some((d) => d.includes(site)) && <span className="ml-1 text-amber-300">Add your site&apos;s address to its allowed domains (step 4).</span>}
            </span>
          </div>
        )}
        {check.state === "bad" && <div className="mt-2.5 flex animate-rise items-center gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} /> {check.reason}</div>}
        <div className="mt-3 flex items-center justify-end gap-2">
          {saved && <button type="button" className="btn btn-ghost" onClick={() => { setValue(""); void fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(which === "privy" ? { privyAppId: "" } : { walletconnectProjectId: "" }) }).then((r) => r.json()).then(onSaved); setCheck({ state: "idle" }); }}>Disconnect</button>}
          <button type="button" className="btn btn-primary" disabled={check.state !== "ok" || saving || value.trim() === saved} onClick={() => void save()}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saved && value.trim() === saved ? "Connected" : "Save to site"}
          </button>
        </div>
      </div>
    </div>
  );
}
