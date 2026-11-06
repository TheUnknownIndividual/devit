import type { Theme } from "@/lib/spec";

// One stylesheet per generated site, driven by the theme's tokens. Everything is scoped under .ss so the
// builder's own styles never leak into a site and a site never leaks into the builder.

export function themeVars(t: Theme): Record<string, string> {
  return {
    "--bg": t.bg, "--surface": t.surface, "--text": t.text, "--muted": t.muted, "--border": t.border,
    "--accent": t.accent, "--accent-text": t.accentText, "--radius": `${t.radius}px`,
    "--r-sm": `${Math.min(t.radius, 12)}px`, "--font-display": t.fontDisplay, "--font-body": t.fontBody, "--font-mono": t.fontMono,
  };
}

export const SITE_CSS = `
.ss{background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:16px;line-height:1.55;min-height:100%;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
.ss *{box-sizing:border-box}
.ss a{color:inherit;text-decoration:none}
.ss img{max-width:100%;display:block}
.ss-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.ss-sec{padding:72px 0;border-top:1px solid var(--border)}
.ss-sec:first-of-type{border-top:0}
.ss-h2{font-family:var(--font-display);font-size:clamp(28px,4vw,44px);line-height:1.05;margin:0 0 28px;letter-spacing:-0.02em;font-weight:800}
.ss-upper .ss-h2,.ss-upper .ss-h1,.ss-upper .ss-btn,.ss-upper .ss-kicker{text-transform:uppercase;letter-spacing:.01em}
.ss-muted{color:var(--muted)}
.ss-mono{font-family:var(--font-mono)}
.ss-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.ss-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 22px;border-radius:var(--r-sm);font-weight:700;font-size:15px;border:0;cursor:pointer;background:var(--accent);color:var(--accent-text);font-family:var(--font-body);white-space:nowrap}
.ss a.ss-btn{color:var(--accent-text)}
.ss a.ss-btn-ghost{color:var(--text)}
.ss-btn:disabled{opacity:.5;cursor:not-allowed}
.ss-btn-xl{height:60px;padding:0 30px;font-size:18px}
.ss-btn-sm{height:40px;padding:0 16px;font-size:14px}
.ss-btn-ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
.ss-input{height:48px;width:100%;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg);color:var(--text);padding:0 14px;font-size:16px;font-family:var(--font-body);outline:none}
.ss-input:focus{border-color:var(--accent)}
.ss-signup{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;padding:clamp(24px,4vw,44px)}
.ss-signup .ss-h2{margin-bottom:12px}
.ss-signup-body{color:var(--muted);font-size:17px;margin:0;max-width:480px}
.ss-signup-form{display:flex;flex-direction:column;gap:10px}
.ss-signup-form .ss-btn{width:100%}
.ss-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.ss-signup-done{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;color:var(--accent)}
.ss-signup-err{color:#f87171;font-size:14px}
.ss-signup-note{color:var(--muted);font-size:13px}
@media (max-width:760px){.ss-signup{grid-template-columns:1fr;gap:20px}}
.ss-grid{display:grid;gap:16px}.ss-grid>*{min-width:0}
.ss-grid>*{min-width:0}
@media(min-width:760px){.ss-g2{grid-template-columns:1fr 1fr}.ss-g3{grid-template-columns:repeat(3,1fr)}.ss-g4{grid-template-columns:repeat(4,1fr)}}
@media(max-width:759px){.ss-g4{grid-template-columns:1fr 1fr}}

/* nav */
.ss-nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.ss-nav-in{display:flex;align-items:center;gap:16px;height:68px}
.ss-brand{display:flex;align-items:center;gap:10px;font-family:var(--font-display);font-weight:800;font-size:20px}
.ss-logo{width:36px;height:36px;border-radius:var(--r-sm);object-fit:cover;background:var(--surface);border:1px solid var(--border);display:grid;place-items:center;font-weight:800;color:var(--accent);flex-shrink:0;overflow:hidden}
.ss-links{display:none;gap:22px;margin-left:auto;font-size:14px;color:var(--muted)}
.ss-links a:hover{color:var(--text)}
@media(min-width:860px){.ss-links{display:flex}}
.ss-nav-cta{margin-left:auto}
@media(min-width:860px){.ss-nav-cta{margin-left:8px}}

/* hero */
.ss-hero{padding:88px 0 72px}
.ss-hero-in{display:grid;gap:40px;align-items:center}
.ss-hero-in>*{min-width:0}
@media(min-width:900px){.ss-hero[data-layout=split] .ss-hero-in{grid-template-columns:1.2fr .8fr}}
.ss-hero[data-layout=center] .ss-hero-in{text-align:center;justify-items:center}
.ss-hero[data-layout=center] .ss-hero-art{display:none}
.ss-kicker{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:18px}
.ss-h1{font-family:var(--font-display);font-weight:800;line-height:.98;letter-spacing:-0.03em;margin:0;font-size:clamp(44px,7vw,84px)}
.ss-hero[data-size=md] .ss-h1{font-size:clamp(36px,5vw,60px)}
.ss-hero[data-size=xl] .ss-h1{font-size:clamp(56px,10vw,128px)}
.ss-sub{font-size:19px;color:var(--muted);max-width:560px;margin:20px 0 0}
.ss-hero[data-layout=center] .ss-sub{margin-left:auto;margin-right:auto}
.ss-hero-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px;align-items:center}
.ss-hero[data-layout=center] .ss-hero-ctas{justify-content:center}
.ss-hero-art{aspect-ratio:1;width:100%;max-width:380px;justify-self:center;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);display:grid;place-items:center;overflow:hidden}
.ss-hero-art img{width:100%;height:100%;object-fit:cover}
.ss-monogram{font-family:var(--font-display);font-size:120px;font-weight:800;color:var(--accent);line-height:1}
.ss-ca{display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 6px 0 14px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);font-family:var(--font-mono);font-size:13px;max-width:100%}
.ss-ca span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.ss-ca button{flex-shrink:0}
.ss-ca button{height:36px;padding:0 12px;border-radius:calc(var(--r-sm) - 2px);border:0;background:var(--bg);color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px}

/* stats */
.ss-stat .k{font-size:13px;color:var(--muted)}
.ss-stat .v{font-family:var(--font-display);font-size:30px;font-weight:800;margin-top:6px;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:759px){.ss-stat .v{font-size:22px}}
.ss-up{color:#22c55e}.ss-down{color:#ef4444}
.ss-src{margin-top:14px;font-size:12px;color:var(--muted)}

/* buy */
.ss-buy{max-width:520px}
.ss-route{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.ss-route button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-sm);background:transparent;color:var(--muted);cursor:pointer;font-family:var(--font-body);text-align:left;transition:border-color .15s,background-color .15s}
.ss-route button b{color:var(--text);font-size:14px}
.ss-route button span{font-size:12px}
.ss-route button[aria-checked=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
.ss-private{display:flex;gap:12px;align-items:flex-start;width:100%;margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-sm);background:transparent;color:var(--text);cursor:pointer;font-family:var(--font-body);font-size:14px;text-align:left}
.ss-private[aria-checked=true]{border-color:var(--accent)}
.ss-private:disabled{opacity:.6;cursor:default}
.ss-switch{position:relative;flex:none;width:34px;height:20px;margin-top:1px;border-radius:999px;background:var(--border);transition:background-color .15s}
.ss-switch i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
.ss-private[aria-checked=true] .ss-switch{background:var(--accent)}
.ss-private[aria-checked=true] .ss-switch i{transform:translateX(14px)}
.ss-tabs{display:flex;gap:4px;padding:4px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg);margin-bottom:16px}
.ss-tabs button{flex:1;height:38px;border:0;border-radius:calc(var(--r-sm) - 2px);background:transparent;color:var(--muted);font-weight:600;cursor:pointer;font-family:var(--font-body);font-size:14px}
.ss-tabs button[aria-selected=true]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--border)}
.ss-row{display:flex;gap:8px;align-items:center}
.ss-label{font-size:13px;color:var(--muted);margin:14px 0 6px;display:block}
.ss-select{height:48px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg);color:var(--text);padding:0 12px;font-family:var(--font-body);font-size:15px}
.ss-quote{margin-top:14px;padding:14px;border-radius:var(--r-sm);background:var(--bg);border:1px solid var(--border);font-size:14px}
.ss-quote b{font-family:var(--font-display);font-size:22px}
.ss-note{font-size:12px;color:var(--muted);margin-top:10px}
.ss-err{color:#ef4444;font-size:13px;margin-top:10px}

/* chart + trades */
.ss-chart{height:460px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);background:var(--surface)}
.ss-chart iframe{width:100%;height:100%;border:0}
.ss-chart-ph{height:100%;display:grid;place-items:center;color:var(--muted);font-size:14px;position:relative}
.ss-trades{width:100%;border-collapse:collapse;font-size:14px}
.ss-trades td{padding:12px 8px;border-top:1px solid var(--border)}
.ss-trades tr:first-child td{border-top:0}

/* how, roadmap, faq */
.ss-step-n{width:36px;height:36px;border-radius:var(--r-sm);background:var(--accent);color:var(--accent-text);display:grid;place-items:center;font-weight:800;font-family:var(--font-display);margin-bottom:14px}
.ss-step h3,.ss-road h3{margin:0 0 6px;font-size:18px;font-family:var(--font-display)}
.ss-step p,.ss-road p{margin:0;color:var(--muted);font-size:15px}
.ss-road-when{display:inline-block;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid var(--border);margin-bottom:12px;color:var(--muted)}
.ss-faq details{border-top:1px solid var(--border);padding:18px 0}
.ss-faq details:first-child{border-top:0}
.ss-faq summary{cursor:pointer;font-weight:700;font-size:17px;list-style:none;display:flex;justify-content:space-between;gap:12px}
.ss-faq summary::-webkit-details-marker{display:none}
.ss-faq summary::after{content:"+";color:var(--accent);font-weight:800}
.ss-faq details[open] summary::after{content:"–"}
.ss-faq p{margin:10px 0 0;color:var(--muted)}

/* tokenomics */
.ss-bar{display:flex;height:22px;border-radius:999px;overflow:hidden;border:1px solid var(--border)}
.ss-legend{display:grid;gap:10px;margin-top:20px}
.ss-legend div{display:flex;align-items:center;gap:10px;font-size:15px}
.ss-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}

/* story + posts */
.ss-story{font-size:19px;line-height:1.6;margin:0;max-width:640px}
.ss-points{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:12px}
.ss-points li{display:flex;gap:14px;align-items:flex-start;font-size:16px}
.ss-points .ss-step-n{margin:0;flex-shrink:0;width:30px;height:30px;font-size:14px}
.ss-story-art{border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);aspect-ratio:3/1;background:var(--surface)}
.ss-story-art img{width:100%;height:100%;object-fit:cover}
.ss-post{display:flex;flex-direction:column;gap:12px;transition:border-color .2s}
.ss-post:hover{border-color:var(--accent)}
.ss-post-head{display:flex;align-items:center;gap:10px;font-size:14px}
.ss-post-head img{width:36px;height:36px;border-radius:999px;object-fit:cover;flex-shrink:0}
.ss-post-head b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-post-head>svg{margin-left:auto;flex-shrink:0;opacity:.7}
.ss-post-text{margin:0;font-size:15px;white-space:pre-line;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;overflow:hidden}
.ss-post-img{border-radius:var(--r-sm);border:1px solid var(--border);aspect-ratio:16/9;object-fit:cover;width:100%}
.ss-post-foot{display:flex;gap:16px;align-items:center;color:var(--muted);font-size:13px;margin-top:auto}
.ss-post-foot span{display:inline-flex;align-items:center;gap:5px}

/* socials + footer */
.ss-socials{display:flex;flex-wrap:wrap;gap:12px}
.ss-social{display:inline-flex;align-items:center;gap:10px;height:52px;padding:0 20px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--surface);font-weight:700}
.ss-foot{padding:40px 0 56px;border-top:1px solid var(--border);font-size:13px;color:var(--muted)}
.ss-foot-in{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}
.ss-built{display:inline-flex;align-items:center;gap:4px;align-self:flex-end;font-size:12px;color:var(--muted);opacity:.85;transition:opacity .15s,color .15s}
.ss a.ss-built:hover{opacity:1;color:var(--text)}
.ss-built b{font-weight:600;color:var(--text)}
.ss-credit{display:flex;justify-content:flex-end;padding-top:24px;padding-bottom:32px;border-top:1px solid var(--border)}

/* wallet modal */
.ss-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100;display:grid;place-items:center;padding:16px}
.ss-modal{position:relative;width:100%;max-width:380px;max-height:calc(100dvh - 32px);overflow-y:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.ss-modal h3{margin:0 0 4px;padding-right:40px;font-size:18px;font-family:var(--font-display)}
.ss-modal-x{position:absolute;top:12px;right:12px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:var(--r-sm);background:transparent;color:var(--muted);cursor:pointer}
.ss-modal-x:hover{color:var(--text);background:var(--bg)}
.ss-modal-back{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0;margin-bottom:8px;border:0;background:transparent;color:var(--muted);font-family:var(--font-body);font-size:13px;font-weight:600;cursor:pointer}
.ss-modal .ss-ca{display:flex;width:100%}
.ss-wallet{display:flex;align-items:center;gap:12px;width:100%;height:56px;padding:0 14px;margin-top:8px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;font-size:15px;font-family:var(--font-body);text-align:left;transition:border-color .15s}
.ss-wallet:hover:not(:disabled){border-color:var(--accent)}
.ss-wallet:disabled{cursor:progress;opacity:.75}
.ss-wallet[aria-disabled=true]{pointer-events:none;opacity:.5}
.ss-wallet img,.ss-wallet .ss-wi{width:28px;height:28px;border-radius:7px;flex-shrink:0;object-fit:contain}
.ss-wallet .ss-wi,.ss-acct .ss-wi{display:grid;place-items:center;background:var(--surface);color:var(--muted);border:1px solid var(--border)}
.ss-wallet small{margin-left:auto;color:var(--muted);font-weight:500;font-size:12px;white-space:nowrap}
.ss-wallet small.on{color:var(--accent);font-weight:700}
.ss-wsep{margin:16px 0 0;font-size:12px;color:var(--muted)}
.ss-qr{position:relative;margin:16px auto 0;width:100%;max-width:260px;aspect-ratio:1;display:grid;background:#fff;border-radius:var(--r-sm);padding:14px}
.ss-qr-code,.ss-qr-code svg{display:block;width:100%;height:100%}
.ss-qr img{position:absolute;left:50%;top:50%;width:46px;height:46px;transform:translate(-50%,-50%);background:#fff;border-radius:12px;padding:5px}
.ss-acct{display:flex;align-items:center;gap:12px;padding-right:40px}
.ss-acct img,.ss-acct .ss-wi{width:40px;height:40px;border-radius:10px;flex-shrink:0;object-fit:contain}
.ss-chip{gap:8px;max-width:100%}
.ss-upper .ss-chip .ss-mono{text-transform:none}
.ss-chip-bal{color:var(--muted);font-weight:600}
.ss-chip-warn{display:inline-flex;align-items:center;gap:4px;color:#f59e0b;font-weight:700}
@media(max-width:359px){.ss-chip-bal{display:none}}

/* theme flourishes */
[data-ss-theme=degen] .ss-card,[data-ss-theme=degen] .ss-btn-ghost{border-width:2px}
[data-ss-theme=degen] .ss-h1{text-shadow:4px 4px 0 color-mix(in srgb,var(--accent) 35%,transparent)}
[data-ss-theme=retro] .ss-h1{font-size:clamp(28px,5vw,56px);line-height:1.25;text-shadow:4px 4px 0 #00E5FF}
[data-ss-theme=retro] .ss-h2{font-size:clamp(20px,3vw,30px);line-height:1.3}
.ss[data-ss-theme=retro]{font-size:20px}
[data-ss-theme=retro] .ss-stat .v{font-size:20px}
[data-ss-theme=terminal] .ss-h1{font-weight:600;letter-spacing:-0.035em}
[data-ss-theme=terminal] .ss-h2{font-weight:600;letter-spacing:-0.03em}
[data-ss-theme=terminal] .ss-stat .v,[data-ss-theme=terminal] .ss-trades{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
[data-ss-theme=terminal] .ss-stat .k,[data-ss-theme=terminal] .ss-kicker{text-transform:uppercase;letter-spacing:.08em;font-size:11px}
[data-ss-theme=app] .ss-h1{font-weight:800;letter-spacing:-0.045em;line-height:.92}
[data-ss-theme=app] .ss-hero[data-size=xl] .ss-h1{font-size:clamp(60px,11vw,150px)}
[data-ss-theme=app] .ss-h2{letter-spacing:-0.035em}
[data-ss-theme=brutal] .ss-h1{font-weight:900;line-height:.86;letter-spacing:-0.01em}
[data-ss-theme=brutal] .ss-h2{font-weight:900}
[data-ss-theme=brutal] .ss-btn{font-family:var(--font-display);font-weight:800;font-size:18px;letter-spacing:.03em}
[data-ss-theme=brutal] .ss-kicker{background:var(--accent);color:var(--accent-text);padding:2px 8px;border:2px solid var(--border)}
[data-ss-theme=glass] .ss-h1{font-weight:600;letter-spacing:-0.04em}
[data-ss-theme=glass] .ss-h1,[data-ss-theme=glass] .ss-h2{background:linear-gradient(180deg,var(--text) 30%,color-mix(in srgb,var(--text) 55%,var(--accent)));-webkit-background-clip:text;background-clip:text;color:transparent}

/* background behind the hero (data-bg) */
.ss-hero{position:relative;isolation:isolate;overflow:hidden}
.ss-hero::before,.ss-hero::after{content:"";position:absolute;pointer-events:none;z-index:-1}
.ss-hero::before{inset:0}
.ss[data-bg=grid] .ss-hero::before{background:linear-gradient(color-mix(in srgb,var(--text) 9%,transparent) 1px,transparent 1px) 0 0/44px 44px,linear-gradient(90deg,color-mix(in srgb,var(--text) 9%,transparent) 1px,transparent 1px) 0 0/44px 44px;-webkit-mask-image:radial-gradient(80% 70% at 50% 30%,#000 30%,transparent 80%);mask-image:radial-gradient(80% 70% at 50% 30%,#000 30%,transparent 80%)}
.ss[data-bg=dots] .ss-hero::before{background:radial-gradient(color-mix(in srgb,var(--text) 16%,transparent) 1.2px,transparent 1.6px) 0 0/18px 18px;-webkit-mask-image:radial-gradient(90% 80% at 50% 40%,#000 35%,transparent 85%);mask-image:radial-gradient(90% 80% at 50% 40%,#000 35%,transparent 85%)}
.ss[data-bg=stripes] .ss-hero::before{background:repeating-linear-gradient(-45deg,color-mix(in srgb,var(--text) 6%,transparent) 0 2px,transparent 2px 14px)}
.ss[data-bg=glow] .ss-hero::before{background:radial-gradient(50% 55% at 78% 28%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 70%),radial-gradient(32% 38% at 6% 58%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 70%)}
/* Soft colour fields that fade out inside the hero, so nothing is cut off at its edge. */
.ss[data-bg=orbs] .ss-hero::before{background:radial-gradient(42% 58% at 88% 12%,color-mix(in srgb,var(--accent) 55%,transparent),transparent 70%),radial-gradient(34% 46% at 6% 55%,color-mix(in srgb,var(--accent) 40%,#3CF0FF 25%),transparent 70%);filter:blur(24px)}
.ss[data-bg=orbs]:not([data-dark]) .ss-hero::before{opacity:.55}
/* glass panels need colour behind them all the way down */
.ss[data-surface=glass]{background:radial-gradient(60vmax 40vmax at 100% 20%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 70%) fixed,radial-gradient(50vmax 40vmax at 0% 80%,color-mix(in srgb,var(--accent) 8%,transparent),transparent 70%) fixed,var(--bg)}

/* surfaces (data-surface) */
.ss[data-surface=soft] .ss-card,.ss[data-surface=soft] .ss-chart,.ss[data-surface=soft] .ss-hero-art{border-color:color-mix(in srgb,var(--border) 60%,transparent);box-shadow:0 1px 2px rgba(20,16,40,.05),0 10px 30px -8px rgba(20,16,40,.12)}
.ss[data-surface=soft][data-dark] .ss-card{box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 12px 32px -10px rgba(0,0,0,.6)}
.ss[data-surface=soft] .ss-btn{box-shadow:0 6px 20px -6px color-mix(in srgb,var(--accent) 60%,transparent)}
.ss[data-surface=glass] .ss-card,.ss[data-surface=glass] .ss-ca,.ss[data-surface=glass] .ss-social,.ss[data-surface=glass] .ss-chart,.ss[data-surface=glass] .ss-hero-art,.ss[data-surface=glass] .ss-modal{background:color-mix(in srgb,var(--surface) 70%,transparent);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 20px 40px -20px rgba(0,0,0,.5)}
.ss[data-surface=glass] .ss-input,.ss[data-surface=glass] .ss-select,.ss[data-surface=glass] .ss-quote,.ss[data-surface=glass] .ss-tabs{background:color-mix(in srgb,var(--bg) 55%,transparent)}
.ss[data-surface=offset] .ss-card,.ss[data-surface=offset] .ss-btn,.ss[data-surface=offset] .ss-social,.ss[data-surface=offset] .ss-ca,.ss[data-surface=offset] .ss-hero-art,.ss[data-surface=offset] .ss-chart{border:2px solid var(--border);box-shadow:5px 5px 0 var(--border)}
.ss[data-surface=offset] .ss-btn-ghost{background:var(--surface)}

/* buttons (data-pill) */
.ss[data-pill] .ss-btn,.ss[data-pill] .ss-social,.ss[data-pill] .ss-ca,.ss[data-pill] .ss-tabs{border-radius:999px}
.ss[data-pill] .ss-ca button,.ss[data-pill] .ss-tabs button{border-radius:999px}

/* density (data-density) */
.ss[data-density=compact]{font-size:15px}
.ss[data-density=compact] .ss-sec{padding:44px 0}
.ss[data-density=compact] .ss-hero{padding:56px 0 40px}
.ss[data-density=compact] .ss-h2{font-size:clamp(22px,2.6vw,30px);margin-bottom:18px}
.ss[data-density=compact] .ss-card{padding:14px}
.ss[data-density=compact] .ss-grid{gap:10px}
.ss[data-density=compact] .ss-stat .v{font-size:22px}
.ss[data-density=compact] .ss-sub{font-size:17px}
.ss[data-density=compact] .ss-nav-in{height:56px}
.ss[data-density=airy] .ss-sec{padding:112px 0}
.ss[data-density=airy] .ss-hero{padding:120px 0 96px}
.ss[data-density=airy] .ss-grid{gap:20px}
.ss[data-density=airy] .ss-card{padding:26px}
@media(max-width:759px){.ss[data-density=airy] .ss-sec{padding:76px 0}.ss[data-density=airy] .ss-hero{padding:80px 0 64px}}

/* slogan ticker under the nav */
.ss-ticker{overflow:hidden;border-top:1px solid var(--border);background:var(--accent);color:var(--accent-text);font-size:13px;font-weight:600;white-space:nowrap;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.ss-ticker-run{display:inline-flex;gap:0;padding:8px 0}
.ss-tick-item{display:inline-flex;align-items:center;padding:0 22px;position:relative}
.ss-tick-item::after{content:"";position:absolute;right:-2px;width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.5}
.ss-tick-item i{font-style:normal}
.ss-ticker .ss-up,.ss-ticker .ss-down{color:inherit;opacity:.8}
.ss[data-ss-theme=terminal] .ss-ticker,.ss[data-ss-theme=glass] .ss-ticker{background:transparent;color:var(--muted);font-family:var(--font-mono);font-weight:500;font-size:12px}
.ss[data-ss-theme=terminal] .ss-ticker b{color:var(--text)}
.ss[data-ss-theme=terminal] .ss-ticker .ss-up{color:#22c55e;opacity:1}
.ss[data-ss-theme=terminal] .ss-ticker .ss-down{color:#ef4444;opacity:1}
.ss.ss-upper .ss-ticker{text-transform:uppercase;letter-spacing:.04em}
.ss[data-surface=offset] .ss-ticker{border-top:2px solid var(--border);border-bottom:2px solid var(--border)}

/* focus, overflow and the cross-over between sections (theme.fx.transition). These shape the page, so preview shows them too. */
.ss{overflow-x:clip;--tint:color-mix(in srgb,var(--surface) 55%,var(--bg))}
.ss :focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.ss .ss-input:focus-visible{outline:0}
.ss[data-transition=fade] .ss-sec{border-top:0}
.ss[data-transition=fade]>section:nth-of-type(even){background:linear-gradient(180deg,transparent,var(--tint) 22%,var(--tint) 78%,transparent)}
.ss[data-transition=angle]{--cut:clamp(20px,4vw,56px)}
.ss[data-transition=angle]>section{clip-path:polygon(0 0,100% 0,100% calc(100% - var(--cut)),0 100%)}
.ss[data-transition=angle]>.ss-sec{margin-top:calc(var(--cut) * -1);border-top:var(--cut) solid transparent;clip-path:polygon(0 var(--cut),100% 0,100% calc(100% - var(--cut)),0 100%)}
.ss[data-transition=angle]>section:nth-of-type(even){background:var(--tint)}
.ss[data-transition=stack]{--lap:28px;--sheet:min(calc(var(--radius) * 2),36px)}
.ss[data-transition=stack]>.ss-sec{position:relative;margin-top:calc(var(--lap) * -1);border-top:var(--lap) solid transparent;background-color:var(--bg);border-radius:var(--sheet) var(--sheet) 0 0;box-shadow:0 -18px 36px -22px rgba(0,0,0,.4)}
.ss[data-transition=stack]>section:nth-of-type(even){background-color:var(--tint)}
.ss[data-transition=stack][data-surface=glass]>.ss-sec{background-color:color-mix(in srgb,var(--bg) 78%,transparent)}
.ss[data-transition=wave]>.ss-sec{position:relative;border-top:0}
.ss[data-transition=wave]>.ss-sec>.ss-wrap{position:relative;z-index:1}
.ss[data-transition=wave]>section:nth-of-type(even){background:var(--tint)}
.ss[data-transition=wave]>.ss-sec::before{content:"";position:absolute;left:0;right:0;top:-1px;height:clamp(18px,3vw,36px);pointer-events:none;background:var(--bg);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 60' preserveAspectRatio='none'%3E%3Cpath d='M0 0H1200V30C1050 60 900 60 750 30S450 0 300 30S75 60 0 30Z'/%3E%3C/svg%3E") 0 0/100% 100% no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 60' preserveAspectRatio='none'%3E%3Cpath d='M0 0H1200V30C1050 60 900 60 750 30S450 0 300 30S75 60 0 30Z'/%3E%3C/svg%3E") 0 0/100% 100% no-repeat}
.ss[data-transition=wave]>.ss-sec:nth-of-type(odd)::before{background:var(--tint)}
.ss-progress{position:fixed;left:0;top:0;right:0;height:3px;z-index:30;background:var(--accent);transform-origin:0 50%;transform:scaleX(var(--prog,0));pointer-events:none}
@supports (animation-timeline:scroll()){.ss-progress{animation:ssProg linear both;animation-timeline:scroll(root block)}}
.ss-top{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:40;width:44px;height:44px;border-radius:var(--r-sm);display:grid;place-items:center;background:var(--accent);color:var(--accent-text);border:0;cursor:pointer;box-shadow:0 10px 28px -10px rgba(0,0,0,.55);animation:ssRise .3s var(--ease) both}
.ss[data-pill] .ss-top{border-radius:999px}

/* live mode only. Preview never animates, so scrolling it stays plain. */
.ss{--dur:.6s;--ease:cubic-bezier(.2,.8,.2,1);--rise:16px;--stag:.06s}
.ss[data-motion=snappy]{--dur:.35s;--ease:cubic-bezier(.2,.8,.2,1);--rise:10px;--stag:.04s}
.ss[data-motion=calm]{--dur:.9s;--ease:cubic-bezier(.16,1,.3,1);--rise:24px;--stag:.09s}
.ss[data-motion=bouncy]{--dur:.75s;--ease:cubic-bezier(.34,1.56,.64,1);--rise:28px;--stag:.07s}
[data-ss-mode=live] .ss-rise{animation:ssRise var(--dur) var(--ease) both}
[data-ss-mode=live] .ss-spin{animation:ssSpin 1s linear infinite}
[data-ss-mode=live] .ss-sec.ss-wait{opacity:0;transform:translateY(var(--rise))}
[data-ss-mode=live] .ss-sec.ss-in{transition:opacity var(--dur) ease-out,transform var(--dur) var(--ease)}
/* Children come in one after another (MotionFx numbers them --i); backwards fill so hover transforms still work afterwards. */
[data-ss-mode=live][data-stagger] .ss-sec.ss-in :is(.ss-grid>*,.ss-points>li,.ss-faq>details,.ss-socials>*){animation:ssRise var(--dur) var(--ease) backwards;animation-delay:calc(var(--i,0) * var(--stag))}
/* First load: nav fades, then the hero's kicker, headline, subhead, buttons and art in sequence. */
[data-ss-mode=live][data-intro] .ss-rise{animation:none}
[data-ss-mode=live][data-intro] :is(.ss-i1,.ss-i2,.ss-i3,.ss-i4){animation:ssRise calc(var(--dur) * 1.1) var(--ease) backwards}
[data-ss-mode=live][data-intro] .ss-i2{animation-delay:.08s}
[data-ss-mode=live][data-intro] .ss-i3{animation-delay:.18s}
[data-ss-mode=live][data-intro] .ss-i4{animation-delay:.28s}
[data-ss-mode=live][data-intro] .ss-i5{animation:ssPop calc(var(--dur) * 1.2) var(--ease) .2s backwards}
[data-ss-mode=live][data-intro][data-motion=bouncy] .ss-hero-art{animation:ssPop calc(var(--dur) * 1.2) var(--ease) .2s backwards,ssFloat 5.5s ease-in-out 1.4s infinite}
[data-ss-mode=live][data-intro] .ss-nav-in{animation:ssFade .5s ease-out backwards}
[data-ss-mode=live] .ss-btn,[data-ss-mode=live] .ss-social,[data-ss-mode=live] .ss-card{transition:transform .2s var(--ease),box-shadow .2s var(--ease),filter .2s,border-color .2s}
[data-ss-mode=live] .ss-btn:hover{filter:brightness(1.07)}
[data-ss-mode=live] .ss-btn:active{transform:scale(.97)}
[data-ss-mode=live][data-surface=offset] .ss-btn:hover,[data-ss-mode=live][data-surface=offset] .ss-social:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--border)}
[data-ss-mode=live][data-surface=offset] .ss-btn:active{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--border)}
[data-ss-mode=live][data-surface=outline] .ss-card:hover,[data-ss-mode=live][data-surface=glass] .ss-card:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}
[data-ss-mode=live] .ss-social:hover{border-color:var(--accent)}
[data-ss-mode=live] .ss-ticker-run{animation:ssMarquee 38s linear infinite}
[data-ss-mode=live][data-motion=snappy] .ss-ticker-run{animation-duration:28s}
[data-ss-mode=live][data-motion=calm] .ss-ticker-run{animation-duration:54s}
[data-ss-mode=live] .ss-ticker:hover .ss-ticker-run{animation-play-state:paused}
[data-ss-mode=live][data-motion=bouncy] .ss-hero-art{animation:ssFloat 5.5s ease-in-out infinite}
[data-ss-mode=live][data-bg=orbs] .ss-hero::before{animation:ssDrift 18s ease-in-out infinite alternate}
[data-ss-mode=live][data-bg=glow] .ss-hero .ss-btn{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 60%,transparent),0 10px 36px -6px color-mix(in srgb,var(--accent) 55%,transparent)}
/* How sections come in (theme.fx.reveal, read off a reference site when one was given); rise is the default above. */
[data-ss-mode=live][data-reveal=fade] .ss-sec.ss-wait{transform:none}
[data-ss-mode=live][data-reveal=scale] .ss-sec.ss-wait{transform:scale(.94)}
[data-ss-mode=live][data-reveal=slide] .ss-sec.ss-wait{transform:translateX(-36px)}
[data-ss-mode=live][data-reveal=blur] .ss-sec.ss-wait{transform:translateY(8px);filter:blur(12px)}
[data-ss-mode=live][data-reveal=blur] .ss-sec.ss-in{transition:opacity var(--dur) ease-out,transform var(--dur) var(--ease),filter var(--dur) ease-out}
[data-ss-mode=live][data-reveal=fade] .ss-sec.ss-in :is(.ss-grid>*,.ss-points>li,.ss-faq>details,.ss-socials>*),[data-ss-mode=live][data-reveal=blur] .ss-sec.ss-in :is(.ss-grid>*,.ss-points>li,.ss-faq>details,.ss-socials>*){animation-name:ssFade}
[data-ss-mode=live][data-reveal=scale] .ss-sec.ss-in :is(.ss-grid>*,.ss-points>li,.ss-faq>details,.ss-socials>*){animation-name:ssPop}
[data-ss-mode=live][data-reveal=slide] .ss-sec.ss-in :is(.ss-grid>*,.ss-points>li,.ss-faq>details,.ss-socials>*){animation-name:ssSlide}
/* Nav: link underline follows the section in view; once scrolled it blurs and tightens (no height change, so nothing shifts). */
[data-ss-mode=live] .ss-links a{position:relative}
[data-ss-mode=live] .ss-links a::after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:2px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .25s var(--ease)}
[data-ss-mode=live] .ss-links a:hover::after,[data-ss-mode=live] .ss-links a[aria-current]::after{transform:scaleX(1)}
[data-ss-mode=live] .ss-links a[aria-current]{color:var(--text)}
[data-ss-mode=live][data-nav=compact] .ss-nav{transition:background .25s,box-shadow .25s}
[data-ss-mode=live][data-nav=compact] .ss-brand{transform-origin:left center;transition:transform .25s var(--ease)}
[data-ss-mode=live][data-nav=compact][data-stuck] .ss-brand{transform:scale(.88)}
[data-ss-mode=live][data-nav=compact][data-stuck] .ss-nav{background:color-mix(in srgb,var(--bg) 74%,transparent);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);box-shadow:0 10px 30px -18px rgba(0,0,0,.5)}
[data-ss-mode=live] .ss-stat .v{font-variant-numeric:tabular-nums}
/* What cards and buttons do under the cursor (theme.fx.hover). */
[data-ss-mode=live][data-hover=lift] .ss-card:hover,[data-ss-mode=live][data-hover=lift] .ss-btn:hover,[data-ss-mode=live][data-hover=lift] .ss-social:hover{transform:translateY(-4px);box-shadow:0 14px 34px -14px color-mix(in srgb,var(--text) 35%,transparent)}
[data-ss-mode=live][data-hover=scale] .ss-card:hover,[data-ss-mode=live][data-hover=scale] .ss-btn:hover,[data-ss-mode=live][data-hover=scale] .ss-social:hover{transform:scale(1.035)}
[data-ss-mode=live][data-hover=glow] .ss-card:hover,[data-ss-mode=live][data-hover=glow] .ss-btn:hover,[data-ss-mode=live][data-hover=glow] .ss-social:hover{box-shadow:0 0 0 1px var(--accent),0 0 32px -6px color-mix(in srgb,var(--accent) 70%,transparent);border-color:var(--accent)}
[data-ss-mode=live][data-hover=none] .ss-card:hover,[data-ss-mode=live][data-hover=none] .ss-btn:hover{transform:none;filter:none}
/* Parallax (theme.fx.parallax): the hero art drifts slower than the page; MotionFx sets --scroll. */
[data-ss-mode=live][data-parallax] .ss-hero-art{transform:translate3d(0,calc(var(--scroll,0) * .25px),0);will-change:transform}
[data-ss-mode=live][data-parallax] .ss-story-art{transform:translate3d(0,calc((var(--scroll,0) - 900) * -.06px),0)}
[data-ss-mode=live] .ss-flash-up{animation:ssFlashUp .9s ease-out}
[data-ss-mode=live] .ss-flash-down{animation:ssFlashDown .9s ease-out}
@keyframes ssSpin{to{transform:rotate(360deg)}}
@keyframes ssFade{from{opacity:0}to{opacity:1}}
@keyframes ssRise{from{opacity:0;transform:translateY(var(--rise,12px))}to{opacity:1;transform:none}}
@keyframes ssPop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes ssSlide{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none}}
@keyframes ssProg{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes ssMarquee{to{transform:translateX(-50%)}}
@keyframes ssFloat{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-12px) rotate(-1.5deg)}}
@keyframes ssDrift{from{transform:translate(0,0) scale(1)}to{transform:translate(-4%,3%) scale(1.06)}}
/* showcase demo chart + trade rows */
.ss-demo-chart{display:flex;flex-direction:column;padding:16px 18px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);overflow:hidden}
.ss-demo-chart-head{display:flex;align-items:baseline;gap:8px;font-size:14px;font-variant-numeric:tabular-nums}
.ss-demo-chart svg{flex:1;width:100%;min-height:0;margin-top:10px}
[data-ss-mode=live] .ss-demo-line{stroke-dasharray:2400;animation:ssDraw 1.6s cubic-bezier(.22,1,.36,1) both}
[data-ss-mode=live] .ss-demo-dot{animation:ssPulse 2.4s ease-out infinite;transform-box:fill-box;transform-origin:center}
[data-ss-mode=live] .ss-row-in{animation:ssRowIn .5s cubic-bezier(.22,1,.36,1)}
@keyframes ssDraw{from{stroke-dashoffset:2400}to{stroke-dashoffset:0}}
@keyframes ssPulse{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}
@keyframes ssRowIn{from{opacity:0;transform:translateY(-6px);background:color-mix(in srgb,var(--accent) 14%,transparent)}}
@keyframes ssFlashUp{from{color:#22c55e;text-shadow:0 0 12px rgba(34,197,94,.5)}}
@keyframes ssFlashDown{from{color:#ef4444;text-shadow:0 0 12px rgba(239,68,68,.5)}}
@media (prefers-reduced-motion:reduce){[data-ss-mode=live] *{animation:none!important;transition:none!important}.ss-progress{display:none}[data-ss-mode=live] .ss-sec.ss-wait{opacity:1;transform:none}}
[data-ss-mode=preview] *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
/* treasury */
.ss-tr{display:grid;gap:36px}.ss-tr>*{min-width:0}
.ss-tr-acc{display:grid;gap:16px}.ss-tr-acc>*{min-width:0}
.ss-tr-body{margin:-12px 0 24px;max-width:640px}
.ss-tr-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:14px;font-size:14px;min-width:0}
.ss-tr-name{font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ss-tr-name:hover,.ss-tr-link:hover{text-decoration:underline}
.ss-tr-link{text-decoration:underline}
.ss-tr-h{font-family:var(--font-display);font-size:18px;margin:0 0 8px}
.ss-tr-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--border);font-size:14px}
.ss-tr-row:hover{color:var(--accent)}
.ss-tr-l{display:grid;place-items:center;min-width:28px;color:var(--muted)}
.ss-tr-m,.ss-tr-r{display:flex;flex-direction:column;min-width:0}
.ss-tr-m>*,.ss-tr-r>*{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-tr-m b{display:flex;align-items:center;gap:5px}
.ss-tr-r{text-align:right;align-items:flex-end;font-variant-numeric:tabular-nums}
.ss-tr-m span,.ss-tr-r span{font-size:12px}
.ss-tr-coin{width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--bg);border:1px solid var(--border)}
.ss-tr-coin-i{display:grid;place-items:center;font-weight:800;font-size:13px;color:var(--accent)}
.ss-tr-id{font-family:var(--font-mono);font-size:12px;color:var(--muted)}
.ss-tr-status{font-size:12px;font-weight:700;padding:2px 10px;border:1px solid var(--border);border-radius:var(--r-sm)}
.ss-tr-status[data-s=approved]{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
.ss-tr-status[data-s=voting]{border-color:var(--text)}
.ss-tr-empty{margin:6px 0 0;font-size:14px}
.ss-tr-note{margin:10px 0 0;font-size:12px}
.ss-tr-row:first-of-type{border-top:0}
.ss-tr-acc .ss-stat .v{font-size:26px}
@media(max-width:759px){.ss-tr-acc .ss-stat .v{font-size:20px}.ss-tr-row{grid-template-columns:28px minmax(0,1fr) auto;gap:10px}}
.ss-presets{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.ss-presets button{height:36px;padding:0 12px;font-size:13px}
.ss-toast-dock{position:fixed;left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));z-index:40;max-width:min(340px,calc(100vw - 32px))}
.ss-toast-dock.ss-toast-sample{position:sticky;left:auto;bottom:16px;height:0;max-width:none;overflow:visible}
.ss-toast-sample .ss-toast{position:absolute;left:16px;bottom:0;width:min(340px,calc(100vw - 32px))}
.ss-toast{display:flex;align-items:flex-start;gap:10px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px 12px 12px 14px;font-size:14px;line-height:1.35;box-shadow:0 10px 28px -12px rgba(0,0,0,.5)}
.ss-toast b{font-weight:700}
.ss-toast .ss-toast-x{margin-left:auto;flex-shrink:0;width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:calc(var(--r-sm) - 2px);background:transparent;color:var(--muted);cursor:pointer}
.ss-toast .ss-toast-x:hover{color:var(--text)}
.ss-toast-when{display:block;font-size:12px;color:var(--muted);margin-top:2px}
@media(prefers-reduced-motion:no-preference){[data-ss-mode=live] .ss-toast{animation:ssRise .4s var(--ease) both}}
.ss-lb td:first-child{width:36px;color:var(--muted);font-weight:700}
.ss-lb a{text-decoration:underline;text-underline-offset:3px}
.ss-lb .ss-lb-n{text-align:right;color:var(--muted)}
.ss-whatif{display:grid;gap:20px}
.ss-whatif-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.ss-whatif-amt{max-width:160px}
.ss-whatif-big{font-family:var(--font-display);font-size:56px;font-weight:800;letter-spacing:-0.02em;line-height:1.05}
.ss-whatif-big small{font-size:24px;margin-left:12px}
.ss-seg{display:inline-flex;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden}
.ss-seg button{height:40px;padding:0 14px;border:0;background:transparent;color:var(--text);font-family:var(--font-body);font-size:14px;font-weight:600;cursor:pointer}
.ss-seg button[aria-pressed=true]{background:var(--accent);color:var(--accent-text)}
.ss-seg button:disabled{opacity:.4;cursor:not-allowed}
.ss-raid{display:grid;gap:12px}
.ss-raid-post{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.ss-raid-post p{margin:0;flex:1 1 320px;white-space:pre-wrap;word-break:break-word}
.ss-raid-acts{display:flex;gap:8px;flex-wrap:wrap}
.ss-bar{height:14px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg);overflow:hidden;margin:14px 0 8px}
.ss-bar>i{display:block;height:100%;background:var(--accent)}
@media(prefers-reduced-motion:no-preference){[data-ss-mode=live] .ss-bar>i{transition:width .8s var(--ease)}}
.ss-ms-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline}
.ss-ms-big{font-family:var(--font-display);font-size:34px;font-weight:800;letter-spacing:-0.02em}
@media(max-width:759px){.ss-whatif-big{font-size:40px}.ss-ms-big{font-size:26px}}
`;
