"use client";

import { useEffect } from "react";
import { AtSign, Bell, BellRing, Check, Globe, Loader2, MessageCircle, Send } from "lucide-react";
import type { BuildBoard as Board, BuildStep } from "@/lib/spec";
import { CHAINS } from "@/lib/spec";
import { usd, num } from "@/blocks/format";
import { ChainIcon } from "@/components/brand";
import { ProjectLogo } from "@/components/projects/ProjectList";
import { PHASE, clock, type BuildProgress } from "./eta";

// What the preview pane shows while a site is being built and before its first section exists: everything the build
// has found and decided so far, newest on top, with an honest countdown. Watching the work happen (the token read
// from the chain, the links and posts found, the colours pulled from the art, the concept and fonts picked) makes the
// wait feel shorter and shows what the site is being made from.

const SHIMMER = "animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.11),rgba(255,255,255,0.04))] bg-[length:200%_100%]";

/** Why each step matters to the site, shown under what is happening now. */
const WHY: Record<string, string> = {
  intent: "Working out which token and what kind of site you want.",
  chain: "Live price, market cap and holders feed the site's widgets.",
  research: "Their website, X and Telegram become the site's links, and their lore becomes its story.",
  voice: "So the words on the site sound like the community, not like a template.",
  wallet: "The buy box will trade the real token from the visitor's own wallet.",
  understand: "Only facts with a source make it onto the site.",
  direction: "No template: this decides how your site looks, from the token's own art.",
  design: "Each section appears in the preview as soon as it is written.",
  review: "Anything cut off, overlapping or too small gets fixed before you see it.",
  copy: "Headlines and sections in the project's voice.",
  style: "A look that suits the token's art.",
  blocks: "The sections the site will have.",
  reference: "Borrowing the layout of the site you pointed to.",
};

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 animate-rise overflow-hidden rounded-[14px] border border-white/[0.08] bg-ink-900 ${className}`}>
      <h3 className="border-b border-white/[0.06] px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-zinc-500">{title}</h3>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

function useFonts(href: string | undefined) {
  useEffect(() => {
    if (!href || !/^https:\/\/fonts\.googleapis\.com\//.test(href)) return;
    if (document.querySelector(`link[data-board-font="${CSS.escape(href)}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.boardFont = href;
    document.head.appendChild(l);
  }, [href]);
}

const LINK_ICON: Record<string, typeof Globe> = { x: AtSign, telegram: Send, discord: MessageCircle, website: Globe };

export function BuildBoard({ board, steps, progress, name, notify, onNotify }: {
  board: Board;
  steps: BuildStep[];
  progress: BuildProgress;
  name: string;
  notify: "unsupported" | "off" | "on" | "blocked";
  onNotify: () => void;
}) {
  const d = board.direction;
  useFonts(d?.fontsHref);
  const t = board.token;
  const display = d ? `'${d.display}', ${d.light ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined;
  const body = d ? `'${d.body}', system-ui, sans-serif` : undefined;
  const upNext = progress.planned.filter((id) => id !== progress.current && !steps.some((s) => s.id === id));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-ink-850">
      {/* Countdown */}
      <div className="sticky top-0 z-10 border-b border-white/[0.07] bg-ink-850/95 backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ProjectLogo src={t?.logo ?? board.found?.x?.avatar ?? null} name={t?.symbol || name} size={34} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-white">Building {t ? `$${t.symbol}` : name || "your site"}</div>
              <div className="truncate text-[12px] text-zinc-400">{progress.phase}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <div className="text-[13px] font-medium text-white">{progress.label}</div>
              <div className="font-mono text-[11px] text-zinc-500">{Math.round(progress.pct)}% · {clock(progress.elapsedMs)} elapsed</div>
            </div>
            {notify !== "unsupported" && (
              <button type="button" onClick={onNotify} disabled={notify !== "off"} title={notify === "blocked" ? "Notifications are blocked for this site in your browser settings" : undefined}
                className="btn btn-outline h-8 px-2.5 text-[12px] disabled:opacity-70">
                {notify === "on" ? <><BellRing size={13} className="text-lime" /> We&apos;ll notify you</> : notify === "blocked" ? <><Bell size={13} /> Notifications blocked</> : <><Bell size={13} /> Notify me when ready</>}
              </button>
            )}
          </div>
        </div>
        <div className="h-[3px] bg-white/[0.05]">
          <div className="h-full bg-lime transition-[width] duration-1000 ease-linear" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-3 p-4">
        {/* Now */}
        <section className="min-w-0 rounded-[14px] border border-sel/25 bg-sel/[0.05] p-4">
          <div className="flex items-start gap-3">
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-sel" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-white">{progress.phase}</div>
              {progress.current && WHY[progress.current] && <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{WHY[progress.current]}</p>}
              {progress.sections && (
                <div className="mt-3 flex gap-1">{Array.from({ length: progress.sections.of }, (_, i) => (
                  <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-sm ${i < progress.sections!.done ? "bg-lime" : i === progress.sections!.done ? SHIMMER : "bg-white/[0.07]"}`} />
                ))}</div>
              )}
              {upNext.length > 0 && (
                <p className="mt-3 text-[12px] text-zinc-500">Then: {upNext.map((id) => (PHASE[id] ?? id).split(":")[0].toLowerCase()).join(" → ")}</p>
              )}
            </div>
          </div>
        </section>

        {/* Section plan, once art direction has planned the page */}
        {d && d.sections.length > 0 && (
          <Card title={`The page · ${d.sections.length} sections`}>
            <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {d.sections.map((s, i) => {
                const done = progress.sections ? i < progress.sections.done : steps.some((x) => x.id === "design" && x.state !== "running");
                const writing = progress.sections ? i === progress.sections.done : progress.current === "design" && i === 0;
                return (
                  <li key={s.id} title={s.purpose} className={`flex min-w-0 items-center gap-2.5 rounded-[9px] border px-2.5 py-2 ${writing ? "border-sel/30 bg-sel/[0.06]" : "border-white/[0.06] bg-white/[0.02]"}`}>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.06] font-mono text-[11px] text-zinc-400">
                      {done ? <Check size={11} strokeWidth={3} className="text-lime" /> : writing ? <Loader2 size={11} className="animate-spin text-sel" /> : i + 1}
                    </span>
                    <span className={`min-w-0 truncate text-[12.5px] ${done || writing ? "text-zinc-100" : "text-zinc-500"}`}>{s.label}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        {/* Art direction, with a taste of the look before any code exists */}
        {d && (
          <Card title={`Art direction · ${d.archetype.replace(/-/g, " ")}`}>
            <div className="overflow-hidden rounded-[12px] border border-white/[0.08] p-5" style={{ background: d.bg, color: d.text }}>
              <div className="break-words text-[34px] leading-[1.05]" style={{ fontFamily: display }}>{t?.name ?? name}</div>
              {board.story?.oneLiner && <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed opacity-80" style={{ fontFamily: body }}>{board.story.oneLiner}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3" style={{ fontFamily: body }}>
                <span className="inline-flex h-9 items-center rounded-[8px] px-4 text-[13px] font-semibold" style={{ background: d.accent, color: d.bg }}>Buy {t ? `$${t.symbol}` : "now"}</span>
                <span className="text-[12px] opacity-70">{d.display} + {d.body}</span>
              </div>
            </div>
            {d.palette.length > 0 && (
              <div className="mt-3 flex overflow-hidden rounded-[9px] border border-white/[0.08]">
                {d.palette.map((c) => <span key={c} title={c} className="h-8 min-w-0 flex-1" style={{ background: c }} />)}
              </div>
            )}
            <p className="mt-4 text-[13.5px] leading-relaxed text-zinc-200">{d.concept}</p>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0"><dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">Hero</dt><dd className="mt-1 text-[12.5px] leading-relaxed text-zinc-300">{d.heroIdea}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">Signature detail</dt><dd className="mt-1 text-[12.5px] leading-relaxed text-zinc-300">{d.signature}</dd></div>
            </dl>
          </Card>
        )}

        {/* What it borrows from */}
        {d && d.inspiration.length > 0 && (
          <Card title="Borrowing ideas from">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {d.inspiration.slice(0, 4).map((x) => (
                <figure key={x.ref} className="min-w-0 overflow-hidden rounded-[10px] border border-white/[0.07] bg-ink-850">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/refshot/${encodeURIComponent(x.ref)}`} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover object-top" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  <figcaption className="p-3">
                    <div className="truncate text-[12px] font-medium text-zinc-200">{x.ref.startsWith("devit-") ? "A site made on devit" : x.ref}</div>
                    <p className="mt-1 line-clamp-4 text-[12px] leading-relaxed text-zinc-400">{x.borrow}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>
        )}

        {/* The story */}
        {board.story && (
          <Card title="What the project is">
            <p className="text-[15px] leading-relaxed text-white">{board.story.oneLiner}</p>
            {board.story.facts.length > 0 && (
              <ul className="mt-3 space-y-2">
                {board.story.facts.map((f, i) => (
                  <li key={i} className="flex min-w-0 gap-2.5 text-[12.5px] leading-relaxed">
                    <Check size={13} className="mt-1 shrink-0 text-lime" />
                    <span className="min-w-0 text-zinc-300">{f.claim} <span className="text-zinc-500">· {f.source}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {board.story.tone.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[12px] text-zinc-500">Voice:</span>
                {board.story.tone.map((x) => <span key={x} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11.5px] text-zinc-300">{x}</span>)}
              </div>
            )}
          </Card>
        )}

        {/* Colours from the art */}
        {board.colours && board.colours.length > 0 && (
          <Card title="Colours from the artwork">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {board.colours.slice(0, 6).map((c, i) => (
                <div key={c} className="min-w-0 animate-pop" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="aspect-square rounded-[9px] border border-white/[0.08]" style={{ background: c }} />
                  <div className="mt-1 truncate text-center font-mono text-[11px] text-zinc-500">{c}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Found online */}
        {board.found && (board.found.x || board.found.links.length > 0 || board.found.posts.length > 0 || board.found.lore) && (
          <Card title="Found online">
            {board.found.x && (
              <div className="flex min-w-0 items-center gap-3">
                <ProjectLogo src={board.found.x.avatar} name={board.found.x.name} size={36} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-white">{board.found.x.name}</div>
                  <div className="truncate text-[12px] text-zinc-500">@{board.found.x.handle}{board.found.x.followers != null ? ` · ${num(board.found.x.followers)} followers` : ""}</div>
                </div>
              </div>
            )}
            {board.found.links.length > 0 && (
              <div className={`flex flex-wrap gap-1.5 ${board.found.x ? "mt-3" : ""}`}>
                {board.found.links.map((l) => {
                  const Icon = LINK_ICON[l.type] ?? Globe;
                  return <span key={l.url} title={l.url} className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[12px] text-zinc-300"><Icon size={12} className="shrink-0 text-zinc-500" /><span className="truncate">{l.label}</span></span>;
                })}
              </div>
            )}
            {board.found.posts.some((x) => x.image) && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {board.found.posts.filter((x) => x.image).slice(0, 4).map((x, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={x.image!} alt="" loading="lazy" className="aspect-square w-full rounded-[9px] border border-white/[0.07] object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ))}
              </div>
            )}
            {board.found.lore && <p className="mt-3 line-clamp-4 text-[12.5px] leading-relaxed text-zinc-400">{board.found.lore}</p>}
          </Card>
        )}

        {/* The token */}
        {t && (
          <Card title="On chain">
            {t.header && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.header} alt="" className="-mx-4 -mt-4 mb-4 block h-28 w-[calc(100%+2rem)] max-w-none object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="flex min-w-0 items-center gap-3">
              <ProjectLogo src={t.logo} name={t.symbol} size={40} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white">{t.name} <span className="font-normal text-zinc-500">${t.symbol}</span></div>
                <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-500"><ChainIcon chain={t.chain} size={12} /><span className="truncate">{CHAINS[t.chain].name}{t.launchpad ? ` · ${t.launchpad}` : ""}{t.stage ? ` · ${t.stage}` : ""}</span></div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["Price", usd(t.priceUsd)], ["Market cap", usd(t.marketCap)], ["Holders", num(t.holders)], ["24h", t.change24h == null ? "—" : `${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(1)}%`]] as const).map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-[9px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <dt className="text-[11px] text-zinc-500">{k}</dt>
                  <dd className={`truncate font-mono text-[13px] ${k === "24h" && t.change24h != null ? (t.change24h >= 0 ? "text-lime" : "text-rose-400") : "text-zinc-100"}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {/* Nothing found yet */}
        {!t && !board.found && !board.story && !d && (
          <div className="space-y-3">
            {[0, 1].map((i) => <div key={i} className={`h-28 ${SHIMMER}`} style={{ animationDelay: `${i * 120}ms` }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** A slim bar over the preview once sections are showing: which one is being written, or the browser check. */
export function BuildStrip({ progress, follow, onFollow }: { progress: BuildProgress; follow: boolean; onFollow: () => void }) {
  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-ink-850">
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-[12px]">
        <Loader2 size={13} className="shrink-0 animate-spin text-sel" />
        <span className="min-w-0 flex-1 truncate text-zinc-200">{progress.phase}</span>
        <span className="shrink-0 text-zinc-400">{progress.label}</span>
        {progress.current === "design" && (
          <button type="button" onClick={onFollow} aria-pressed={follow} className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 sm:inline">
            {follow ? "Following the writing" : "Follow the writing"}
          </button>
        )}
      </div>
      <div className="h-[2px] bg-white/[0.05]"><div className="h-full bg-lime transition-[width] duration-1000 ease-linear" style={{ width: `${progress.pct}%` }} /></div>
    </div>
  );
}
