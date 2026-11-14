"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, Check, Copy, Loader2, X } from "lucide-react";
import { renderSVG } from "uqr";

// One popup for every wallet, buy and bridge step on a site. A centred card on wide screens and a bottom sheet on
// phones. It keeps one frame while its screens change: the new screen slides in from the side you're going (forward
// from the right, back from the left), the card's height glides to fit it, and the header keeps Back, the title and
// Close in the same places. Open and close are a fade and a small scale (a slide up on phones). Transforms and
// opacity only, apart from the card's height; nothing moves under prefers-reduced-motion.

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const SHEET_OUT_MS = 180;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type Dir = "fwd" | "back" | "none";

/** The screens of one popup as a stack: open, go forward, go back, replace (for a step that can't be returned to), close. */
export interface Flow<S extends string> {
  screen: S | null;
  dir: Dir;
  closing: boolean;
  canBack: boolean;
  open(s: S): void;
  go(s: S): void;
  replace(s: S): void;
  back(): void;
  close(): void;
}

export function useFlow<S extends string>(): Flow<S> {
  const [stack, setStack] = useState<S[]>([]);
  const [dir, setDir] = useState<Dir>("none");
  const [closing, setClosing] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const open = useCallback((s: S) => { clearTimeout(t.current); setClosing(false); setDir("none"); setStack([s]); }, []);
  const go = useCallback((s: S) => { clearTimeout(t.current); setClosing(false); setDir("fwd"); setStack((st) => (st.length ? [...st, s] : [s])); }, []);
  const replace = useCallback((s: S) => { setDir("fwd"); setStack((st) => (st.length ? [...st.slice(0, -1), s] : [s])); }, []);
  const back = useCallback(() => { setDir("back"); setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)); }, []);
  const close = useCallback(() => {
    clearTimeout(t.current);
    setClosing(true);
    t.current = window.setTimeout(() => { setStack([]); setClosing(false); }, reduced() ? 0 : SHEET_OUT_MS);
  }, []);
  const screen = stack.length ? stack[stack.length - 1] : null;
  return useMemo(() => ({ screen, dir, closing, canBack: stack.length > 1, open, go, replace, back, close }), [screen, dir, closing, stack.length, open, go, replace, back, close]);
}

/**
 * The popup. `screen` names what's showing (a change of it plays the slide); `onBack` shows the Back arrow. Esc and a
 * tap outside close it, Tab stays inside, the page behind doesn't scroll, and focus goes back to whatever opened it.
 * On phones the card can be dragged down by its top to close.
 */
export function Sheet({ screen, dir = "none", closing = false, title, label, onClose, onBack, children }: {
  screen: string; dir?: Dir; closing?: boolean; title: ReactNode; label?: string; onClose: () => void; onBack?: () => void; children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  const [anim, setAnim] = useState(false);
  const hRef = useRef<number | null>(null);
  const animT = useRef<number | undefined>(undefined);
  const ro = useRef<ResizeObserver | null>(null);

  // The card follows its screen's height, gliding between sizes (a quote arriving, a step opening, a new screen).
  const measure = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const set = () => {
      const n = el.offsetHeight;
      if (hRef.current === n) return;
      if (hRef.current != null && !reduced()) {
        setAnim(true);
        clearTimeout(animT.current);
        animT.current = window.setTimeout(() => setAnim(false), 300);
      }
      hRef.current = n;
      setH(n);
    };
    set();
    ro.current = new ResizeObserver(set);
    ro.current.observe(el);
  }, []);
  useEffect(() => () => { ro.current?.disconnect(); clearTimeout(animT.current); }, []);
  useLayoutEffect(() => { if (body.current) body.current.scrollTop = 0; }, [screen]);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prev = { overflow: html.style.overflow, pad: html.style.paddingRight };
    const bar = innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    if (bar > 0) html.style.paddingRight = `${bar}px`;
    card.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = prev.overflow;
      html.style.paddingRight = prev.pad;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !card.current) return;
      const f = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || at === card.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !card.current.contains(at))) { e.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  // Phones: drag the sheet down by its handle or header; past a third of a thumb's reach it closes.
  const drag = useRef<{ y: number; id: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || innerWidth > 560 || (e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !card.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    card.current.style.transition = "none";
    card.current.style.transform = `translateY(${dy}px)`;
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || !card.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current = null;
    const c = card.current;
    c.style.transition = "transform .2s cubic-bezier(.2,.8,.2,1)";
    if (dy > 90) { c.style.transform = "translateY(100%)"; window.setTimeout(onClose, 120); }
    else { c.style.transform = ""; window.setTimeout(() => { c.style.transition = ""; }, 220); }
  };

  const root = typeof document !== "undefined" ? document.querySelector(".ss") ?? document.body : null;
  if (!root) return null;
  // Rendered at the site's root: a nav's backdrop blur would otherwise become the box a fixed overlay sits in.
  return createPortal(
    <div className={`ss-sh-bg${closing ? " is-out" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="ss-sh ss-modal" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : "Dialog")} tabIndex={-1}>
        <div className="ss-sh-top" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="ss-sh-grab" aria-hidden />
          <div className="ss-sh-head">
            {onBack ? <button type="button" className="ss-sh-ic" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button> : <span className="ss-sh-ic" aria-hidden />}
            <h3 className="ss-sh-title" key={screen}>{title}</h3>
            <button type="button" className="ss-sh-ic" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div ref={body} className="ss-sh-body" data-anim={anim || undefined} style={h != null ? { height: h } : undefined}>
          <div ref={measure} key={screen} className="ss-sh-screen" data-dir={dir}>{children}</div>
        </div>
      </div>
    </div>,
    root,
  );
}

/** Something happening in a wallet or on a chain: the coin or wallet in a turning ring, a title and what to do. */
export function Working({ icon, title, sub, failed = false, children }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; failed?: boolean; children?: ReactNode }) {
  return (
    <div className="ss-sh-state" data-failed={failed || undefined} role="status" aria-live="polite">
      <div className="ss-sh-ring">
        <svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r="37" className="ss-sh-ring-bg" /><circle cx="40" cy="40" r="37" className="ss-sh-ring-arc" /></svg>
        <span className="ss-sh-ring-ic">{icon ?? <Loader2 size={26} className="ss-spin" />}</span>
        {failed && <span className="ss-sh-ring-badge"><AlertTriangle size={12} /></span>}
      </div>
      <b>{title}</b>
      {sub && <p>{sub}</p>}
      {children}
    </div>
  );
}

/** The end of a flow: a check that draws itself (or a cross), a title, and what's next. */
export function Result({ ok, title, sub, children }: { ok: boolean; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ss-sh-state" data-ok={ok || undefined} data-failed={!ok || undefined} role="status" aria-live="polite">
      <div className="ss-sh-done" aria-hidden>
        {ok ? (
          <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27 l7.5 7.5 L37.5 19" /></svg>
        ) : (
          <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M18 18 L34 34 M34 18 L18 34" /></svg>
        )}
      </div>
      <b>{title}</b>
      {sub && <p>{sub}</p>}
      {children}
    </div>
  );
}

/** Label / value rows, as a receipt: You pay, You get, Route, Arrives in. */
export function Review({ rows }: { rows: Array<[ReactNode, ReactNode] | null | false | undefined | "" | 0> }) {
  return (
    <dl className="ss-sh-kv">
      {rows.filter(Boolean).map((r, i) => {
        const [k, v] = r as [ReactNode, ReactNode];
        return <div key={i}><dt>{k}</dt><dd>{v}</dd></div>;
      })}
    </dl>
  );
}

export type StepState = "todo" | "now" | "done" | "fail";
export interface Step { text: string; state: StepState; sub?: string }

/** Numbered steps; the one in progress turns, finished ones tick. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="ss-steps ss-sh-steps">
      {steps.map((s, i) => (
        <li key={i} data-state={s.state}>
          <span className="ss-step-ic" aria-hidden>{s.state === "done" ? <Check size={13} /> : s.state === "now" ? <Loader2 size={13} className="ss-spin" /> : s.state === "fail" ? <X size={13} /> : i + 1}</span>
          <span className="ss-step-tx">{s.text}{s.sub && <span>{s.sub}</span>}</span>
        </li>
      ))}
    </ol>
  );
}

/** A small progress line for a flow with fixed stages (Details, Send, Arrives). */
export function Stages({ names, at }: { names: string[]; at: number }) {
  return (
    <div className="ss-sh-stages" aria-label={`Step ${at + 1} of ${names.length}: ${names[at]}`}>
      {names.map((n, i) => <span key={n} data-on={i <= at || undefined}><i />{n}</span>)}
    </div>
  );
}

/** Rows that stand in for a list while it loads, so the card opens at its real size. */
export function SkeletonRows({ n = 4 }: { n?: number }) {
  return <div className="ss-sh-skel" aria-hidden>{Array.from({ length: n }, (_, i) => <div key={i}><i /><span><b /><em /></span></div>)}</div>;
}

/** A problem inside a screen, in words, with Retry when there's something to retry. */
export function SheetError({ msg, onRetry }: { msg: ReactNode; onRetry?: () => void }) {
  return (
    <div className="ss-sh-err" role="alert">
      <AlertTriangle size={14} />
      <span>{msg}</span>
      {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** A deposit address: its QR code, the address in full, and Copy. */
export function AddressQR({ address, logo }: { address: string; logo?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const svg = useMemo(() => renderSVG(address, { ecc: "M", border: 0 }), [address]);
  return (
    <div className="ss-sh-addr">
      <div className="ss-qr ss-sh-qr" data-el="deposit-qr">
        <span className="ss-qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
        {logo && <span className="ss-sh-qr-logo">{logo}</span>}
      </div>
      <button type="button" className="ss-sh-copy" onClick={() => { void navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1400); }} aria-label="Copy address">
        <code className="ss-mono">{address}</code>
        <span>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
