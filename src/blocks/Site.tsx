import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowUpRight, Globe, Heart, Repeat2 } from "lucide-react";
import { BrandIcon, BRANDS, ChainIcon } from "@/components/brand";
import { BLOCK_LABELS, CHAINS, type Block, type SiteSpec, type TokenInfo } from "@/lib/spec";
import { SITE_CSS, themeVars } from "./css";
import { usd, num, ago } from "./format";
import { BuyBox, Chart, Count, CopyCA, LiveStats, LiveTrades, MotionFx, Ticker, WalletButton, type Mode } from "./client/parts";
import { Treasury } from "./client/treasury";
import { fxOf } from "@/lib/themes";
import type { TreasuryData } from "@/lib/treasury";

// Renders a SiteSpec. Each block carries data-block-id so the builder's select tool maps a click to one block,
// and inner parts carry data-el so a comment can name the exact element ("headline", "cta", …).

type P = Record<string, unknown>;
const s = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function Section({ b, children, className = "ss-sec", attrs }: { b: Block; children: ReactNode; className?: string; attrs?: Record<string, string> }) {
  return (
    <section id={b.type} data-block-id={b.id} data-block-type={b.type} data-block-label={BLOCK_LABELS[b.type]} className={className} {...attrs}>
      {children}
    </section>
  );
}

/** The logo the team uploaded, else the token's logo, else the team's X picture, else the ticker's first letter. */
function logoOf(spec: SiteSpec): string | null {
  return spec.logo ?? spec.token?.logo ?? spec.x?.profile.avatar ?? null;
}

function Logo({ spec, size = 36 }: { spec: SiteSpec; size?: number }) {
  const src = logoOf(spec);
  return (
    <span className="ss-logo" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" width={size} height={size} /> : spec.ticker.slice(0, 1)}
    </span>
  );
}

function Nav({ b, spec, mode, walletconnect, privy }: { b: Block; spec: SiteSpec; mode: Mode; walletconnect: string | null; privy: string | null }) {
  const has = (t: string) => spec.blocks.some((x) => x.type === t);
  return (
    <header data-block-id={b.id} data-block-type="nav" data-block-label="Navigation" className="ss-nav">
      <div className="ss-wrap ss-nav-in">
        <a href="#hero" className="ss-brand" data-el="brand"><Logo spec={spec} />{spec.name}</a>
        <nav className="ss-links" data-el="links">
          {has("story") && <a href="#story">Story</a>}
          {has("buy") && <a href="#buy">Buy</a>}
          {has("chart") && <a href="#chart">Chart</a>}
          {has("how") && <a href="#how">How to buy</a>}
          {has("treasury") && <a href="#treasury">Treasury</a>}
          {has("roadmap") && <a href="#roadmap">Roadmap</a>}
          {has("faq") && <a href="#faq">FAQ</a>}
        </nav>
        <div className="ss-nav-cta" data-el="wallet"><WalletButton chain={spec.chain} token={spec.token} walletconnect={walletconnect} privy={privy} /></div>
      </div>
      {fxOf(spec.theme).ticker && <Ticker token={spec.token} ticker={spec.ticker} tagline={spec.tagline} chain={spec.chain} mode={mode} />}
    </header>
  );
}

function Hero({ b, spec }: { b: Block; spec: SiteSpec }) {
  const p = b.props as P;
  return (
    <Section b={b} className="ss-hero" attrs={{ "data-layout": s(p.layout, "split"), "data-size": s(p.size, "lg") }}>
        <div className="ss-wrap ss-hero-in">
          <div className="ss-rise">
            <div className="ss-kicker ss-i1" data-el="kicker"><ChainIcon chain={spec.chain} size={14} mono="currentColor" /> ${spec.ticker} on {CHAINS[spec.chain].name}</div>
            <h1 className="ss-h1 ss-i2" data-el="headline">{s(p.headline, spec.name)}</h1>
            <p className="ss-sub ss-i3" data-el="subhead">{s(p.subhead, spec.tagline)}</p>
            <div className="ss-hero-ctas ss-i4">
              <a href="#buy" className={`ss-btn${s(p.ctaSize) === "xl" ? " ss-btn-xl" : s(p.ctaSize) === "md" ? " ss-btn-sm" : ""}`} data-el="cta">{s(p.cta, `Buy $${spec.ticker}`)} <ArrowDown size={16} /></a>
              {spec.token && <CopyCA address={spec.token.address} />}
            </div>
          </div>
          <div className="ss-hero-art ss-i5" data-el="art">
            {s(p.image) ? <img src={s(p.image)} alt="" /> : logoOf(spec) ? <img src={logoOf(spec)!} alt="" /> : spec.token?.header ? <img src={spec.token.header} alt="" /> : <span className="ss-monogram">${spec.ticker.slice(0, 1)}</span>}
          </div>
        </div>
    </Section>
  );
}

function Title({ text }: { text: string }) {
  return <h2 className="ss-h2" data-el="title">{text}</h2>;
}

function Tokenomics({ b, spec }: { b: Block; spec: SiteSpec }) {
  const p = b.props as P;
  const rows = arr<{ label: string; pct: number }>(p.rows);
  const colors = ["var(--accent)", "var(--text)", "var(--muted)", "var(--border)"];
  let acc = 0;
  return (
    <Section b={b}>
      <div className="ss-wrap">
        <Title text={s(p.title, "Tokenomics")} />
        <div className="ss-grid ss-g2" style={{ alignItems: "center" }}>
          <div className="ss-card" data-el="chart">
            {s(p.style) === "donut" ? (
              <svg viewBox="0 0 42 42" width="100%" style={{ maxWidth: 260, margin: "0 auto", display: "block" }} aria-hidden="true">
                {rows.map((r, i) => {
                  const el = <circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={colors[i % colors.length]} strokeWidth="6" strokeDasharray={`${r.pct} ${100 - r.pct}`} strokeDashoffset={25 - acc} />;
                  acc += r.pct;
                  return el;
                })}
              </svg>
            ) : (
              <div className="ss-bar">{rows.map((r, i) => <span key={i} style={{ width: `${r.pct}%`, background: colors[i % colors.length] }} />)}</div>
            )}
            <div className="ss-legend">
              {rows.map((r, i) => <div key={i}><i style={{ background: colors[i % colors.length] }} />{r.label}<span className="ss-muted" style={{ marginLeft: "auto" }}>{r.pct}%</span></div>)}
            </div>
          </div>
          <div className="ss-grid">
            <div className="ss-card ss-stat"><div className="k">Total supply</div><div className="v">{num(spec.token?.supply)}</div></div>
            <div className="ss-card ss-stat"><div className="k">Contract</div><div className="v ss-mono" style={{ fontSize: 14, wordBreak: "break-all" }}>{spec.token?.address ?? "[ADD CA]"}</div></div>
          </div>
        </div>
      </div>
    </Section>
  );
}

const SOCIAL_ICON: Record<string, typeof BRANDS.x> = { twitter: BRANDS.x, x: BRANDS.x, "x-community": BRANDS.x, telegram: BRANDS.telegram, discord: BRANDS.discord, github: BRANDS.github };

function TreasuryBlock({ b, mode }: { b: Block; mode: Mode }) {
  const p = b.props as P;
  const accounts = [...arr<string>(p.accounts), s(p.account)].filter((a, i, l) => a && l.indexOf(a) === i).slice(0, 3);
  return (
    <Section b={b}>
      <div className="ss-wrap">
        <Title text={s(p.title, "Treasury")} />
        {s(p.body) && <p className="ss-muted ss-tr-body" data-el="body">{s(p.body)}</p>}
        {accounts.length
          ? <Treasury accounts={accounts} snapshot={(p.snapshot as TreasuryData | undefined) ?? null} mode={mode} />
          : <div className="ss-card ss-muted" data-el="treasury"><BrandIcon icon={BRANDS.near} size={18} color="currentColor" /> [ADD TREASURY ACCOUNT, e.g. yourdao.sputnik-dao.near]</div>}
      </div>
    </Section>
  );
}

function Story({ b, spec }: { b: Block; spec: SiteSpec }) {
  const p = b.props as P;
  const points = arr<string>(p.points);
  const art = s(p.image) || spec.token?.header || spec.x?.profile.banner || null;
  return (
    <Section b={b}>
      <div className={`ss-wrap ss-grid${art ? " ss-g2" : ""}`} style={{ alignItems: "center", gap: 40 }}>
        <div>
          <Title text={s(p.title, "The lore")} />
          {s(p.body) && <p className="ss-story" data-el="body">{s(p.body)}</p>}
          {points.length > 0 && (
            <ul className="ss-points" data-el="points">
              {points.map((t, i) => <li key={i}><span className="ss-step-n">{i + 1}</span>{t}</li>)}
            </ul>
          )}
        </div>
        {art && <div className="ss-story-art" data-el="art"><img src={art} alt="" /></div>}
      </div>
    </Section>
  );
}

function Posts({ b, spec }: { b: Block; spec: SiteSpec }) {
  const p = b.props as P;
  const x = spec.x;
  const n = typeof p.count === "number" ? p.count : 3;
  const posts = (x?.posts ?? []).slice(0, n);
  return (
    <Section b={b}>
      <div className="ss-wrap">
        <div className="ss-row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 28 }}>
          <h2 className="ss-h2" data-el="title" style={{ margin: 0 }}>{s(p.title, x ? `From @${x.profile.handle}` : "From X")}</h2>
          {x && <a className="ss-btn ss-btn-ghost ss-btn-sm" href={`https://x.com/${x.profile.handle}`} target="_blank" rel="noreferrer"><BrandIcon icon={BRANDS.x} size={14} color="currentColor" /> Follow</a>}
        </div>
        <div className="ss-grid ss-g3" data-el="posts">
          {posts.length ? posts.map((t) => (
            <a key={t.id} className="ss-card ss-post" href={t.url} target="_blank" rel="noreferrer">
              <div className="ss-post-head">
                {x?.profile.avatar ? <img src={x.profile.avatar} alt="" width={36} height={36} /> : <span className="ss-logo">{spec.ticker.slice(0, 1)}</span>}
                <div style={{ minWidth: 0 }}><b>{x?.profile.name}</b><div className="ss-muted">@{x?.profile.handle} · {ago(t.at)}</div></div>
                <BrandIcon icon={BRANDS.x} size={15} color="currentColor" />
              </div>
              <p className="ss-post-text">{t.text}</p>
              {t.image && <img className="ss-post-img" src={t.image} alt="" loading="lazy" />}
              <div className="ss-post-foot"><span><Heart size={14} /> {num(t.likes)}</span><span><Repeat2 size={14} /> {num(t.reposts)}</span><ArrowUpRight size={14} style={{ marginLeft: "auto" }} /></div>
            </a>
          )) : <div className="ss-card ss-muted">[YOUR LATEST POSTS SHOW HERE]</div>}
        </div>
      </div>
    </Section>
  );
}

function Socials({ b, spec }: { b: Block; spec: SiteSpec }) {
  const links = spec.links?.length ? spec.links : spec.token?.links ?? [];
  return (
    <Section b={b}>
      <div className="ss-wrap">
        <Title text={s((b.props as P).title, "Join us")} />
        <div className="ss-socials" data-el="links">
          {links.length ? links.map((l) => (
            <a key={l.url} className="ss-social" href={l.url} target="_blank" rel="noreferrer">
              {SOCIAL_ICON[l.type] ? <BrandIcon icon={SOCIAL_ICON[l.type]} size={18} color="currentColor" /> : <Globe size={18} />}{l.label}
            </a>
          )) : ["[ADD X LINK]", "[ADD TELEGRAM LINK]"].map((t) => <span key={t} className="ss-social ss-muted">{t}</span>)}
        </div>
      </div>
    </Section>
  );
}

function BlockView({ b, spec, mode, walletconnect, privy, credit }: { b: Block; spec: SiteSpec; mode: Mode; walletconnect: string | null; privy: string | null; credit: string | null }) {
  const p = b.props as P;
  const count = mode === "live" && fxOf(spec.theme).count !== false;
  switch (b.type) {
    case "nav": return <Nav b={b} spec={spec} mode={mode} walletconnect={walletconnect} privy={privy} />;
    case "hero": return <Hero b={b} spec={spec} />;
    case "stats":
      return <Section b={b}><div className="ss-wrap"><LiveStats count={count} token={spec.token} items={arr<string>(p.items).length ? arr<string>(p.items) : ["price", "marketCap", "liquidity", "volume24h"]} mode={mode} /></div></Section>;
    case "buy":
      return (
        <Section b={b}>
          <div className="ss-wrap ss-grid ss-g2" style={{ alignItems: "start" }}>
            <div>
              <Title text={s(p.title, `Buy $${spec.ticker}`)} />
              <p className="ss-muted" data-el="body" style={{ maxWidth: 420, margin: 0 }}>{s(p.body, `Buy with ${CHAINS[spec.chain].native}, or pay with SOL, ETH, BTC or USDC from any chain through NEAR Intents.`)}</p>
            </div>
            <BuyBox chain={spec.chain} token={spec.token} ticker={spec.ticker} />
          </div>
        </Section>
      );
    case "chart": return <Section b={b}><div className="ss-wrap"><Title text={s(p.title, "Chart")} /><Chart token={spec.token} mode={mode} dark={spec.theme.dark} /></div></Section>;
    case "trades": return <Section b={b}><div className="ss-wrap"><Title text={s(p.title, "Live trades")} /><LiveTrades token={spec.token} mode={mode} /></div></Section>;
    case "how":
      return (
        <Section b={b}>
          <div className="ss-wrap">
            <Title text={s(p.title, "How to buy")} />
            <div className="ss-grid ss-g3">
              {arr<{ title: string; body: string }>(p.steps).map((st, i) => (
                <div key={i} className="ss-card ss-step" data-el={`step:${i + 1}`}><div className="ss-step-n">{i + 1}</div><h3>{st.title}</h3><p>{st.body}</p></div>
              ))}
            </div>
          </div>
        </Section>
      );
    case "tokenomics": return <Tokenomics b={b} spec={spec} />;
    case "holders":
      return (
        <Section b={b}>
          <div className="ss-wrap">
            <Title text={s(p.title, "Holders")} />
            <div className="ss-grid ss-g3">
              <div className="ss-card ss-stat"><div className="k">Holders</div><div className="v">{spec.token?.holders != null ? <Count text={num(spec.token.holders)} on={count} /> : <span className="ss-muted" style={{ fontSize: 16 }}>Shown on the explorer</span>}</div></div>
              <div className="ss-card ss-stat"><div className="k">Liquidity</div><div className="v"><Count text={usd(spec.token?.liquidityUsd)} on={count} /></div></div>
              <a className="ss-card ss-stat" href={spec.token ? `${CHAINS[spec.chain].explorer}${spec.token.address}` : undefined} target="_blank" rel="noreferrer">
                <div className="k">Every holder</div><div className="v" style={{ fontSize: 18 }}>See on the explorer ↗</div>
              </a>
            </div>
          </div>
        </Section>
      );
    case "treasury": return <TreasuryBlock b={b} mode={mode} />;
    case "roadmap":
      return (
        <Section b={b}>
          <div className="ss-wrap">
            <Title text={s(p.title, "Roadmap")} />
            <div className="ss-grid ss-g3">
              {arr<{ when: string; title: string; body: string }>(p.items).map((it, i) => (
                <div key={i} className="ss-card ss-road" data-el={`item:${i + 1}`}><span className="ss-road-when">{it.when}</span><h3>{it.title}</h3><p>{it.body}</p></div>
              ))}
            </div>
          </div>
        </Section>
      );
    case "faq":
      return (
        <Section b={b}>
          <div className="ss-wrap" style={{ maxWidth: 820 }}>
            <Title text={s(p.title, "FAQ")} />
            <div className="ss-faq">
              {arr<{ q: string; a: string }>(p.items).map((f, i) => <details key={i} open={i === 0} data-el={`q:${i + 1}`}><summary>{f.q}</summary><p>{f.a}</p></details>)}
            </div>
          </div>
        </Section>
      );
    case "socials": return <Socials b={b} spec={spec} />;
    case "story": return <Story b={b} spec={spec} />;
    case "posts": return <Posts b={b} spec={spec} />;
    case "footer":
      return (
        <footer data-block-id={b.id} data-block-type="footer" data-block-label="Footer" className="ss-foot">
          <div className="ss-wrap ss-foot-in">
            <div data-el="disclaimer" style={{ maxWidth: 560 }}>
              <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{spec.name} · ${spec.ticker}</div>
              {s(p.disclaimer)}
            </div>
            {credit && <a className="ss-built" href={credit} target="_blank" rel="noopener" data-el="credit">Built with <b>sitesmith</b></a>}
          </div>
        </footer>
      );
  }
}

/**
 * walletconnect / privy: the project's WalletConnect project ID and Privy App ID (public by design: both check the site's domain).
 * credit: where the free plan's "Built with sitesmith" line links (lib/credit.ts), or null for none.
 */
export function Site({ spec, mode, walletconnect = null, privy = null, credit = null }: { spec: SiteSpec; mode: Mode; walletconnect?: string | null; privy?: string | null; credit?: string | null }) {
  const t = spec.theme;
  const fx = fxOf(t);
  return (
    <>
      {/* React 19 hoists these into <head>. */}
      <link rel="stylesheet" href={t.fontsHref} precedence="default" />
      <style href="ss-site-css" precedence="default">{SITE_CSS}</style>
      <div
        className={`ss${t.uppercase ? " ss-upper" : ""}`} data-ss-theme={t.id} data-ss-mode={mode} style={themeVars(t) as CSSProperties}
        data-bg={fx.bg} data-surface={fx.surface} data-motion={fx.motion} data-density={fx.density} data-pill={fx.pill ? "" : undefined} data-dark={t.dark ? "" : undefined}
        data-reveal={fx.reveal ?? "rise"} data-hover={fx.hover} data-parallax={fx.parallax ? "" : undefined}
        data-transition={fx.transition ?? "none"} data-stagger={fx.stagger === false ? undefined : ""} data-intro={fx.intro === false ? undefined : ""} data-nav={fx.nav ?? "compact"}
      >
        {mode === "live" && fx.progress && <div className="ss-progress" aria-hidden="true" />}
        {spec.blocks.map((b) => <BlockView key={b.id} b={b} spec={spec} mode={mode} walletconnect={walletconnect} privy={privy} credit={credit} />)}
        {credit && !spec.blocks.some((b) => b.type === "footer") && <div className="ss-wrap ss-credit"><a className="ss-built" href={credit} target="_blank" rel="noopener">Built with <b>sitesmith</b></a></div>}
        <MotionFx mode={mode} toTop={fx.toTop !== false} progress={!!fx.progress} nav={(fx.nav ?? "compact") === "compact"} />
      </div>
    </>
  );
}
