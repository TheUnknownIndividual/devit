"use client";

import { modelHeader } from "@/components/build/ModelPicker";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTransitionRouter } from "glimm/next";
import {
  Link2,
  AppWindow, ArrowUp, Check, ChevronDown, ClipboardPaste, Coins, FileCode2, Globe, Image as ImageIcon, Lightbulb, Loader2, LogOut, Mic, MicOff,
  Palette, Rocket, Sparkles, Wand2, X,
} from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { ThemeSwatch } from "@/components/ThemeSwatch";
import { BrandIcon, BRANDS, ChainIcon } from "@/components/brand";
import { readIntent } from "@/lib/intent";
import { detectAddress } from "@/lib/address";
import { readToken } from "@/lib/venues";
import { THEME_LABELS } from "@/lib/themes";
import { usd } from "@/blocks/format";
import { BLOCK_LABELS, CHAINS, type BlockType, type Chain, type Finding, type ThemeId, type TokenInfo } from "@/lib/spec";
import { Upsell, refusalOf, type PlanRefusal } from "@/components/ui/Upsell";
import { StartFrom, type Imported } from "@/components/landing/StartFrom";

type Kind = "memecoin" | "dapp" | "nft";
type SitePlan = { name: string | null; style: ThemeId; sections: Array<{ type: BlockType; label: string; why: string; on: boolean }>; notes: string[]; via: string };
// Plan sections that change the build, as words the request reader (lib/intent.ts) picks up.
const SECTION_WORDS: Partial<Record<BlockType, string>> = { chart: "chart", trades: "live trades", tokenomics: "tokenomics", holders: "holders", roadmap: "roadmap", signup: "waitlist", treasury: "treasury" };
const OPTIONAL = new Set<BlockType>(["chart", "trades", "story", "tokenomics", "holders", "roadmap", "signup", "treasury", "posts"]);
type Style = ThemeId | "auto";
type SocialKey = "x" | "telegram" | "website";

const KINDS: Array<{ id: Kind | "launch"; label: string; icon: typeof Coins; soon?: boolean }> = [
  { id: "memecoin", label: "Memecoin site", icon: Coins },
  { id: "dapp", label: "dApp", icon: AppWindow },
  { id: "nft", label: "NFT mint", icon: ImageIcon },
  { id: "launch", label: "Token launch", icon: Rocket, soon: true },
];

// The placeholder types these out one after another, so an empty box still shows what to write.
const TYPED: Record<Kind, string[]> = {
  memecoin: ["A loud yellow site with a big buy button and live trades…", "Retro arcade vibes, hi-score holders board, pixel font…", "Cozy and soft, lowercase copy, a little frog mascot…"],
  dapp: ["A clean landing page for a NEAR payments app with docs and a FAQ…", "Dark and serious, wallet connect up top, a roadmap…"],
  nft: ["A retro pixel mint page for 3,333 frogs with a roadmap…", "Minimal gallery-style mint page with a countdown…"],
};

const EXAMPLES: Array<{ text: string; kind: Kind }> = [
  { text: "Retro arcade site for $PIXEL on Robinhood Chain with a hi-score holders board", kind: "memecoin" },
  { text: "Clean site for a NEAR community treasury with roadmap and FAQ", kind: "dapp" },
  { text: "Degen yellow site for a Solana cat coin, live trades and a big buy button", kind: "memecoin" },
];

/** The browser's speech recogniser, when it has one. */
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };
function speechCtor(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function useTyped(lines: string[], on: boolean): string {
  const [out, setOut] = useState(lines[0]);
  useEffect(() => {
    if (!on) return;
    let line = 0, i = 0, dir = 1, wait = 0;
    const t = setInterval(() => {
      if (wait > 0) { wait--; return; }
      const full = lines[line % lines.length];
      i += dir;
      setOut(full.slice(0, i));
      if (dir > 0 && i >= full.length) { dir = -1; wait = 40; }
      else if (dir < 0 && i <= 0) { dir = 1; line++; wait = 4; }
    }, 38);
    return () => clearInterval(t);
  }, [lines, on]);
  return on ? out : lines[0];
}

interface Lookup { token: TokenInfo; links: Finding[]; sources: string[] }
interface XCheck { handle: string; name?: string; avatar?: string | null; followers?: number | null; posts?: number; error?: string }

const SOCIAL_FIELDS: Array<{ key: SocialKey; label: string; placeholder: string; icon: React.ReactNode }> = [
  { key: "x", label: "X", placeholder: "@handle", icon: <BrandIcon icon={BRANDS.x} size={13} color="#d4d4d8" /> },
  { key: "telegram", label: "Telegram", placeholder: "t.me/yourgroup", icon: <BrandIcon icon={BRANDS.telegram} size={14} color="#d4d4d8" /> },
  { key: "website", label: "Website", placeholder: "yoursite.com", icon: <Globe size={14} className="text-zinc-300" /> },
];

export function PromptBox() {
  const router = useTransitionRouter();
  const [prompt, setPrompt] = useState("");
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<Chain>("solana");
  const [style, setStyle] = useState<Style>("auto");
  const [kind, setKind] = useState<Kind>("memecoin");
  const [plan, setPlan] = useState(false);
  const [sitePlan, setSitePlan] = useState<SitePlan | null>(null);
  const [planFor, setPlanFor] = useState("");
  const [planning, setPlanning] = useState(false);
  const [imported, setImported] = useState<Imported | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<PlanRefusal | null>(null);
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [focused, setFocused] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [socials, setSocials] = useState<Record<SocialKey, string>>({ x: "", telegram: "", website: "" });
  const [foundFrom, setFoundFrom] = useState<Partial<Record<SocialKey, string>>>({});
  const [xCheck, setXCheck] = useState<XCheck | null>(null);
  const [xChecking, setXChecking] = useState(false);
  const [xAuth, setXAuth] = useState<{ oauth: boolean; me: { handle: string; name: string; avatar: string | null } | null }>({ oauth: false, me: null });
  const area = useRef<HTMLTextAreaElement>(null);
  const addrInput = useRef<HTMLInputElement>(null);
  const rec = useRef<Recognizer | null>(null);
  const typed = useTyped(TYPED[kind], !prompt && !focused);

  useEffect(() => setCanSpeak(!!speechCtor()), []);
  useEffect(() => {
    fetch("/api/x/me").then((r) => r.json()).then((j) => {
      setXAuth(j);
      if (j.me?.handle) setSocials((s) => ({ ...s, x: `@${j.me.handle}` }));
    }).catch(() => undefined);
  }, []);

  // /templates sends "?style=<id>&kind=<memecoin|dapp|nft>": choose them once on arrival.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const st = q.get("style"), k = q.get("kind");
    if (st && st in THEME_LABELS) setStyle(st as ThemeId);
    if (k === "memecoin" || k === "dapp" || k === "nft") setKind(k);
  }, []);

  // Other parts of the page (template cards, "Get started") steer the box through one event.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ style?: ThemeId; prompt?: string; focus?: "address" }>).detail ?? {};
      if (d.style) setStyle(d.style);
      if (d.prompt) setPrompt(d.prompt);
      if (d.focus === "address") { setMore(true); setTimeout(() => addrInput.current?.focus({ preventScroll: true }), 320); }
      else area.current?.focus({ preventScroll: true });
    };
    window.addEventListener("sitesmith:prompt", on);
    return () => window.removeEventListener("sitesmith:prompt", on);
  }, []);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const read = useMemo(() => readIntent(`${prompt} ${address}`, chain), [prompt, address, chain]);
  const addrRead = useMemo(() => {
    // A bare address, or a launchpad, DEX, chart or explorer link to one (lib/venues.ts).
    const r = readToken(address.trim());
    if (!r?.address) return null;
    return { address: r.address, chains: r.chains.length ? r.chains : detectAddress(r.address)?.chains ?? [] };
  }, [address]);

  // A pasted address names its chain; follow it so the picker never disagrees with the paste.
  useEffect(() => {
    const c = addrRead?.chains;
    if (c && c.length === 1 && c[0] !== chain) setChain(c[0]);
  }, [addrRead, chain]);
  useEffect(() => {
    if (read.chain && !address && read.chain !== chain) setChain(read.chain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // Look the token up as soon as the address is whole: logo, price and the socials we can find.
  useEffect(() => {
    setLookupErr(null);
    if (!addrRead) { setLookup(null); setLooking(false); return; }
    setLooking(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ address: addrRead.address, chain: addrRead.chains.length === 1 ? addrRead.chains[0] : chain });
        const r = await fetch(`/api/research?${q}`, { signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) { setLookup(null); setLookupErr(j.error ?? "Couldn't find that token."); return; }
        setLookup(j);
        setChain(j.token.chain);
        // Fill the socials we found, without touching what the person typed.
        const from: Partial<Record<SocialKey, string>> = {};
        const next: Partial<Record<SocialKey, string>> = {};
        for (const k of ["x", "telegram", "website"] as const) {
          const f = (j.links as Finding[]).find((l) => l.type === k);
          if (!f) continue;
          next[k] = k === "x" ? `@${f.url.split("/").pop()}` : f.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
          from[k] = f.source;
        }
        setSocials((s) => ({ x: s.x || next.x || "", telegram: s.telegram || next.telegram || "", website: s.website || next.website || "" }));
        setFoundFrom(from);
      } catch {
        /* superseded */
      } finally {
        if (!ctl.signal.aborted) setLooking(false);
      }
    }, 350);
    return () => { ctl.abort(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrRead?.address]);

  // Check the X handle once it stops changing: picture, name and whether we can read their posts.
  const xHandle = socials.x.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "").split(/[/?]/)[0];
  useEffect(() => {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(xHandle)) { setXCheck(null); setXChecking(false); return; }
    if (xCheck?.handle?.toLowerCase() === xHandle.toLowerCase()) return;
    setXChecking(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/x/profile?handle=${encodeURIComponent(xHandle)}`, { signal: ctl.signal });
        setXCheck({ handle: xHandle, ...(await r.json()) });
      } catch {
        /* superseded */
      } finally {
        if (!ctl.signal.aborted) setXChecking(false);
      }
    }, 700);
    return () => { ctl.abort(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xHandle]);

  const ready = (prompt.trim().length >= 3 || !!lookup) && !busy;

  async function draftPlan() {
    const text = prompt.trim() || (lookup ? `A website for ${lookup.token.name} ($${lookup.token.symbol})` : "");
    if (text.length < 3 || planning) return;
    setPlanning(true);
    const r = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json", ...modelHeader() }, body: JSON.stringify({ prompt: text, kind, chain, style: style === "auto" ? undefined : style }) }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as SitePlan) : null;
    setPlanning(false);
    if (j) { setSitePlan(j); setPlanFor(text); }
  }

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    let text = prompt.trim() || `A website for ${lookup!.token.name} ($${lookup!.token.symbol})`;
    // An accepted plan adds the sections it switched on; an import adds what the repo or design said.
    if (plan && sitePlan) {
      const on = sitePlan.sections.filter((x) => x.on && SECTION_WORDS[x.type] && !text.toLowerCase().includes(SECTION_WORDS[x.type]!)).map((x) => SECTION_WORDS[x.type]!);
      if (on.length) text = `${text}. Include ${on.join(", ")}.`;
    }
    if (imported) text = `${text}\n${imported.text}`;
    text = text.slice(0, 1200);
    const pickedStyle = style === "auto" ? (plan && sitePlan ? sitePlan.style : undefined) : style;
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json", ...modelHeader() },
        body: JSON.stringify({
          prompt: text, chain, kind, address: address.trim() || undefined, style: pickedStyle,
          socials: { x: socials.x.trim() || undefined, telegram: socials.telegram.trim() || undefined, website: socials.website.trim() || undefined },
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string; limit?: boolean };
      setRefusal(refusalOf(j));
      if (!r.ok || !j.id) throw new Error(j.error || "Couldn't start the build. Try again.");
      router.push(`/build/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the build.");
      setBusy(false);
    }
  }

  function toggleMic() {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      if (said) setPrompt((p) => (p ? `${p.trimEnd()} ${said}` : said));
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  async function pasteAddress() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) setAddress(t.slice(0, 200));
    } catch {
      /* clipboard blocked: the field is right there */
    }
    addrInput.current?.focus();
  }

  async function disconnectX() {
    await fetch("/api/x/me", { method: "DELETE" }).catch(() => undefined);
    setXAuth((a) => ({ ...a, me: null }));
    setSocials((s) => ({ ...s, x: "" }));
  }

  const chainItems = (Object.keys(CHAINS) as Chain[]).map((c) => ({ value: c, label: CHAINS[c].name, icon: <ChainIcon chain={c} size={15} /> }));
  const styleItems: Array<{ value: Style; label: string; icon: React.ReactNode; hint?: string }> = [
    { value: "auto", label: "Match their voice", icon: <Wand2 size={15} className="text-zinc-400" />, hint: "Auto" },
    ...(Object.keys(THEME_LABELS) as ThemeId[]).map((t) => ({ value: t as Style, label: THEME_LABELS[t], icon: <ThemeSwatch id={t} size={15} /> })),
  ];

  const readChips: Array<{ k: string; v: string; icon: React.ReactNode }> = [];
  if (lookup) readChips.push({ k: "Token", v: `${lookup.token.name} $${lookup.token.symbol}`, icon: <Coins size={13} /> });
  else if (read.ticker) readChips.push({ k: "Ticker", v: `$${read.ticker}`, icon: <Coins size={13} /> });
  readChips.push({ k: "Chain", v: CHAINS[chain].name, icon: <ChainIcon chain={chain} size={13} /> });
  const refHosts = read.refs.map((u) => new URL(u).host.replace(/^www\./, ""));
  readChips.push({ k: "Style", v: style === "auto" ? (refHosts.length ? `like ${refHosts[0]}` : xHandle ? "from their posts" : THEME_LABELS[read.theme]) : THEME_LABELS[style], icon: <Palette size={13} /> });
  for (const h of refHosts) readChips.push({ k: "Reference", v: `${h}: look, motion and layout, not its words`, icon: <Link2 size={13} /> });
  if (read.accent) readChips.push({ k: "Accent", v: read.accent, icon: <span className="h-3 w-3 rounded-full" style={{ background: read.accent }} /> });
  if (read.wants.size) readChips.push({ k: "Asked for", v: [...read.wants].map((b) => BLOCK_LABELS[b].toLowerCase()).join(", "), icon: <Sparkles size={13} /> });
  if (lookup?.sources.length) readChips.push({ k: "Reading", v: lookup.sources.join(", "), icon: <FileCode2 size={13} /> });

  const filled = (["x", "telegram", "website"] as const).filter((k) => socials[k].trim()).length;
  const found = lookup?.links.filter((l) => !["x", "telegram", "website"].includes(l.type)) ?? [];

  return (
    <div id="prompt-box" className="enter mt-10 w-full max-w-[760px] text-left [--d:3]">
      <div className="composer rounded-[22px] border border-white/10 bg-ink-900/85 shadow-[0_24px_80px_rgba(4,8,30,0.6)] backdrop-blur-xl" data-live={looking || busy}>
        {/* The sentence comes first; everything else is optional. */}
        <label htmlFor="prompt" className="sr-only">Describe your site</label>
        <textarea
          id="prompt"
          ref={area}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
          placeholder={lookup && !prompt ? `A website for ${lookup.token.name} ($${lookup.token.symbol}), or describe the look you want` : typed}
          className="block min-h-[76px] w-full resize-none bg-transparent px-5 pb-2 pt-5 text-[16px] leading-relaxed text-white outline-none placeholder:text-zinc-500"
        />

        {/* Optional: contract address and socials, folded away until asked for. */}
        <div className="px-3">
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            aria-controls="prompt-more"
            className="group flex h-8 items-center gap-2 rounded-lg px-2 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
          >
            <ChevronDown size={14} className={`transition-transform duration-300 [transition-timing-function:var(--ease-spring)] ${more ? "rotate-180" : "group-hover:translate-y-0.5"}`} />
            <span className="font-medium">Optional</span>
            <span className="text-zinc-500">contract address &amp; socials</span>
            {!more && (lookup || filled > 0) && (
              <span className="flex animate-pop items-center gap-1 rounded-md bg-lime/10 px-1.5 py-0.5 text-[11px] text-lime">
                <Check size={11} strokeWidth={3} /> {[lookup && `$${lookup.token.symbol}`, filled > 0 && `${filled} social${filled > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </button>
        </div>

        <div id="prompt-more" className="grow" data-open={more}>
          <div>
            <div className="px-4 pb-1 pt-2">
              <div className="mb-1.5 flex items-center gap-2 text-[12px]">
                <span className="font-medium text-zinc-300">Contract address<span className="font-normal text-zinc-500">, optional</span></span>
                <span className="hidden truncate text-zinc-500 sm:inline">· if it&apos;s live, we read DexScreener, the contract and its metadata</span>
              </div>
              <div className="group flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] pl-3 pr-1.5 transition-colors focus-within:border-sel/50 focus-within:bg-white/[0.05]">
                <FileCode2 size={15} className="shrink-0 text-zinc-500 transition-colors group-focus-within:text-sel" />
                <input
                  ref={addrInput}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contract address or DexScreener link"
                  aria-label="Contract address or DexScreener link"
                  spellCheck={false}
                  tabIndex={more ? 0 : -1}
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-white outline-none placeholder:font-sans placeholder:text-[13.5px] placeholder:text-zinc-500"
                />
                {looking && <Loader2 size={15} className="shrink-0 animate-spin text-sel" />}
                {addrRead && !looking && (
                  <span key={addrRead.chains.join()} className="flex shrink-0 animate-pop items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 text-[11.5px] text-zinc-300">
                    <ChainIcon chain={lookup?.token.chain ?? addrRead.chains[0]} size={12} />
                    {lookup ? CHAINS[lookup.token.chain].name : addrRead.chains.length > 1 ? "EVM" : CHAINS[addrRead.chains[0]].name}
                  </span>
                )}
                {address ? (
                  <button type="button" tabIndex={more ? 0 : -1} className="btn btn-ghost btn-icon h-8 w-8" aria-label="Clear contract address" onClick={() => { setAddress(""); setFoundFrom({}); }}><X size={14} className="turn" /></button>
                ) : (
                  <button type="button" tabIndex={more ? 0 : -1} className="btn btn-ghost h-8 px-2.5 text-[12.5px]" onClick={() => void pasteAddress()}><ClipboardPaste size={14} className="tilt" /> Paste</button>
                )}
              </div>

              {/* The token we found, with what we'll build from. */}
              <div className="grow" data-open={!!lookup || !!lookupErr}>
                <div>
                  {lookup && (
                    <div key={lookup.token.address} className="mt-2.5 flex animate-rise items-center gap-3 rounded-xl border border-white/[0.07] bg-ink-850/80 p-2.5">
                      <span className="grid h-10 w-10 shrink-0 animate-pop place-items-center overflow-hidden rounded-lg bg-ink-700">
                        {lookup.token.logo ? <img src={lookup.token.logo} alt="" className="h-full w-full object-cover" /> : <Coins size={16} className="text-zinc-400" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13.5px] font-medium text-white">
                          <span className="truncate">{lookup.token.name}</span>
                          <span className="shrink-0 text-zinc-500">${lookup.token.symbol}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-zinc-400">
                          {lookup.token.priceUsd != null && <span>{usd(lookup.token.priceUsd)}</span>}
                          {lookup.token.marketCap != null && <span>MC {usd(lookup.token.marketCap)}</span>}
                          <span className="text-zinc-500">via {[...new Set([...lookup.token.sources, ...lookup.sources])].join(", ")}</span>
                        </div>
                      </div>
                      {found.length > 0 && (
                        <div className="stagger hidden shrink-0 items-center gap-1 sm:flex">
                          {found.slice(0, 4).map((l) => (
                            <span key={l.url} title={`${l.label} · found on ${l.source}`} className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.05]">
                              {l.type === "discord" ? <BrandIcon icon={BRANDS.discord} size={13} color="#a1a1aa" /> : l.type === "github" ? <BrandIcon icon={BRANDS.github} size={13} color="#a1a1aa" /> : <Globe size={13} className="text-zinc-400" />}
                            </span>
                          ))}
                        </div>
                      )}
                      <Check size={16} className="shrink-0 animate-pop text-lime" />
                    </div>
                  )}
                  {lookupErr && !lookup && <p className="mt-2 animate-rise text-[12.5px] text-amber-300">{lookupErr} Check the address, or leave it empty if you haven&apos;t launched yet.</p>}
                </div>
              </div>
            </div>

            {/* Socials: we read their posts to write in their voice. */}
            <div className="px-4 pt-3">
              <div className="mb-1.5 flex items-center gap-2 text-[12px]">
                <span className="font-medium text-zinc-300">Socials<span className="font-normal text-zinc-500">, optional</span></span>
                <span className="truncate text-zinc-500">· we read your posts so the site sounds like you</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {SOCIAL_FIELDS.map((f) => {
                  if (f.key === "x" && xAuth.me) {
                    return (
                      <div key="x" className="flex h-10 animate-rise items-center gap-2 rounded-xl border border-lime/30 bg-lime/[0.06] pl-1.5 pr-1">
                        {xAuth.me.avatar ? <img src={xAuth.me.avatar} alt="" className="h-7 w-7 rounded-full" /> : <BrandIcon icon={BRANDS.x} size={13} color="#d4d4d8" />}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">@{xAuth.me.handle}</span>
                        <span className="text-[11px] text-lime">Connected</span>
                        <button type="button" tabIndex={more ? 0 : -1} className="btn btn-ghost btn-icon h-7 w-7" aria-label="Disconnect X" onClick={() => void disconnectX()}><LogOut size={13} className="nudge-r" /></button>
                      </div>
                    );
                  }
                  const isX = f.key === "x";
                  const from = foundFrom[f.key];
                  return (
                    <div key={f.key} className="flex gap-1.5">
                      <label className="group flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] pl-2.5 pr-1.5 transition-colors focus-within:border-sel/50 focus-within:bg-white/[0.05]">
                        <span className="shrink-0 transition-transform duration-300 group-focus-within:scale-110">{isX && xCheck?.avatar ? <img src={xCheck.avatar} alt="" className="h-5 w-5 animate-pop rounded-full" onError={() => setXCheck((c) => (c ? { ...c, avatar: null } : c))} /> : f.icon}</span>
                        <span className="sr-only">{f.label}</span>
                        <input
                          value={socials[f.key]}
                          onChange={(e) => { setSocials((s) => ({ ...s, [f.key]: e.target.value })); setFoundFrom((x) => ({ ...x, [f.key]: undefined })); }}
                          placeholder={f.placeholder}
                          spellCheck={false}
                          autoComplete="off"
                          tabIndex={more ? 0 : -1}
                          className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-zinc-500"
                        />
                        {isX && xChecking && <Loader2 size={13} className="shrink-0 animate-spin text-zinc-500" />}
                        {isX && !xChecking && xCheck?.name && <span className="shrink-0 animate-pop text-[11px] text-lime" title={`${xCheck.name}${xCheck.posts ? ` · ${xCheck.posts} recent posts` : ""}`}><Check size={13} /></span>}
                        {!isX && from && <span className="shrink-0 animate-pop rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-zinc-400" title={`Found on ${from}`}>found</span>}
                        {isX && from && !xCheck?.name && !xChecking && <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-zinc-400" title={`Found on ${from}`}>found</span>}
                      </label>
                      {isX && xAuth.oauth && !socials.x && (
                        <a href="/api/x/connect" tabIndex={more ? 0 : -1} className="btn btn-outline h-10 rounded-xl px-3 text-[12.5px]"><BrandIcon icon={BRANDS.x} size={12} color="currentColor" /> Connect</a>
                      )}
                    </div>
                  );
                })}
              </div>
              {xCheck?.error && <p className="mt-1.5 animate-rise text-[12px] text-zinc-500">{xCheck.error}</p>}
            </div>
          </div>
        </div>

        {imported && (
          <div className="mx-4 mt-3 flex min-w-0 items-center gap-2.5 rounded-[12px] border border-white/[0.07] bg-white/[0.02] p-3">
            {imported.image ? <img src={imported.image} alt="" className="h-9 w-12 shrink-0 rounded-md border border-white/10 object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-ink-850"><BrandIcon icon={BRANDS[imported.source]} size={15} color="#e4e4e7" /></span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] text-zinc-100">Starting from {imported.source === "github" ? "GitHub" : "Figma"}: {imported.title}</p>
              <p className="truncate text-[11.5px] text-zinc-500">{imported.text}</p>
            </div>
            {imported.accent && <span className="h-4 w-4 shrink-0 rounded" style={{ background: imported.accent }} title={`Accent ${imported.accent}`} />}
            <button type="button" className="btn btn-ghost btn-icon h-7 w-7 shrink-0" aria-label="Remove import" onClick={() => setImported(null)}><X size={13} /></button>
          </div>
        )}

        <div className="grow" data-open={plan}>
          <div>
            <div className="mx-4 mt-3 rounded-[12px] border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-zinc-400"><Lightbulb size={13} className="text-lime" /> What I read so far</div>
              <div className="stagger flex flex-wrap gap-1.5">
                {readChips.map((c) => (
                  <span key={c.k} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-850 px-2 text-[12px]">
                    <span className="text-zinc-400">{c.icon}</span><span className="text-zinc-500">{c.k}</span><span className="text-zinc-100">{c.v}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-zinc-400">Sections</span>
                  {sitePlan && planFor !== (prompt.trim() || planFor) && <span className="text-[11px] text-zinc-500">Your sentence changed since this plan.</span>}
                  <button type="button" className="btn btn-outline ml-auto h-7 px-2.5 text-[12px]" disabled={planning || (prompt.trim().length < 3 && !lookup)} onClick={() => void draftPlan()}>
                    {planning ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {sitePlan ? "Plan again" : "Draft the plan"}
                  </button>
                </div>
                {!sitePlan && !planning && <p className="mt-1.5 text-[12px] text-zinc-500">The agent lists the sections and style it would build. Switch any off or on, then build.</p>}
                {sitePlan && (
                  <>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {sitePlan.sections.map((x) => {
                        const locked = !OPTIONAL.has(x.type);
                        return (
                          <label key={x.type} className={`flex items-start gap-2 rounded-[10px] border px-2.5 py-2 ${x.on ? "border-white/[0.09] bg-ink-850" : "border-white/[0.05] opacity-60"} ${locked ? "" : "cursor-pointer hover:border-white/20"}`}>
                            <input type="checkbox" className="mt-0.5 accent-lime" checked={x.on} disabled={locked} onChange={() => setSitePlan((cur) => cur && { ...cur, sections: cur.sections.map((y) => (y.type === x.type ? { ...y, on: !y.on } : y)) })} />
                            <span className="min-w-0">
                              <span className="block text-[12.5px] text-zinc-100">{x.label}{locked && <span className="text-zinc-500"> · always</span>}</span>
                              {x.why && <span className="block text-[11.5px] leading-snug text-zinc-500">{x.why}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[12px] text-zinc-400">Style: <span className="text-zinc-100">{THEME_LABELS[sitePlan.style]}</span>{style === "auto" ? " (pick another under Style)" : ""}</p>
                    {sitePlan.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-zinc-500">{n}</p>)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.06] p-2.5 sm:p-3">
          <Menu
            label="Chain"
            up
            value={chain}
            onPick={setChain}
            items={chainItems}
            trigger={(o) => (
              <button type="button" data-tour="options" className="btn btn-outline" aria-label={`Chain: ${CHAINS[chain].name}`}>
                <span key={chain} className="animate-pop"><ChainIcon chain={chain} size={15} /></span>
                <span className="hidden sm:inline">{CHAINS[chain].name}</span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-300 ${o ? "rotate-180" : ""}`} />
              </button>
            )}
          />
          <Menu
            label="Style"
            up
            value={style}
            onPick={setStyle}
            items={styleItems}
            trigger={(o) => (
              <button type="button" className="btn btn-outline" aria-label={`Style: ${style === "auto" ? "auto" : THEME_LABELS[style]}`}>
                {style === "auto" ? <Palette size={15} className="tilt text-zinc-400" /> : <span key={style} className="animate-pop"><ThemeSwatch id={style} size={15} /></span>}
                <span className="hidden sm:inline">{style === "auto" ? "Style" : THEME_LABELS[style]}</span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-300 ${o ? "rotate-180" : ""}`} />
              </button>
            )}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            title="Try an example"
            aria-label="Try an example"
            onClick={() => { const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]; setPrompt(ex.text); setKind(ex.kind); area.current?.focus(); }}
          >
            <Sparkles size={15} className="pop" />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              data-tour="plan"
              onClick={() => setPlan((p) => !p)}
              aria-pressed={plan}
              className={`btn ${plan ? "border border-lime/40 bg-lime/10 text-lime" : "btn-ghost"}`}
              title="See the sections and style before it builds"
            >
              <Lightbulb size={15} className="pop" /> <span className="hidden sm:inline">Plan</span>
            </button>
            {canSpeak && (
              <button type="button" onClick={toggleMic} className={`btn btn-icon hidden sm:inline-flex ${listening ? "bg-red-500/15 text-red-300" : "btn-ghost"}`} aria-label={listening ? "Stop dictation" : "Dictate"}>
                {listening ? <MicOff size={16} /> : <Mic size={16} className="pop" />}
              </button>
            )}
            <button type="button" data-tour="build" onClick={() => void submit()} disabled={!ready} className="btn btn-primary" aria-label="Build now">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} className="nudge-up" />}
              <span className="hidden sm:inline">{busy ? "Starting" : "Build now"}</span>
            </button>
          </div>
        </div>
      </div>

      <StartFrom onImported={setImported} />

      {error && (refusal ? <Upsell body={refusal} className="mt-3 animate-rise" /> : <p role="alert" className="mt-3 animate-rise text-[13px] text-red-300">{error}</p>)}

      <div data-tour="kinds"><KindPicker kind={kind} onPick={setKind} /></div>
    </div>
  );
}

/** What are you building: a pill slides under the chosen one. */
function KindPicker({ kind, onPick }: { kind: Kind; onPick: (k: Kind) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-kind="${kind}"]`);
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [kind]);
  return (
    <div className="enter mt-5 flex justify-center [--d:5]">
      <div ref={wrap} className="relative flex flex-wrap items-center justify-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] p-1" role="radiogroup" aria-label="What are you building">
        {pill && <span aria-hidden="true" className="absolute top-1 h-8 rounded-full border border-white/15 bg-white/[0.09] transition-[left,width] duration-500 [transition-timing-function:var(--ease-spring)]" style={{ left: pill.left, width: pill.width }} />}
        {KINDS.map((k) => {
          const on = k.id === kind;
          const Icon = k.icon;
          return (
            <button
              key={k.id}
              data-kind={k.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={k.soon}
              onClick={() => !k.soon && onPick(k.id as Kind)}
              className={`group relative z-10 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-55 ${on ? "text-white" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              <Icon size={14} className={`transition-transform duration-300 [transition-timing-function:var(--ease-spring)] group-hover:scale-110 ${on ? "text-lime" : ""}`} />
              {k.label}
              {k.soon && <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-400">Soon</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
