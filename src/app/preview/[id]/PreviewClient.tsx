"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Site } from "@/blocks/Site";
import type { SiteSpec } from "@/lib/spec";

// Runs inside the builder's iframe. In select mode it outlines what's under the cursor, turns clicks into
// selections (shift-click adds or removes one, so a comment can cover several), lets a press-and-drag box select whole
// blocks (or the parts of one block), and pins numbered markers on blocks that have pending comments. Talks to the
// builder by postMessage.

export type FromBuilder =
  | { type: "ss:spec"; spec: SiteSpec }
  | { type: "ss:select"; on: boolean }
  | { type: "ss:markers"; items: Array<{ blockId: string; n: number }> }
  | { type: "ss:selected"; items: Sel[] }
  | { type: "ss:focus"; blockId: string };

export type FromPreview =
  | { type: "ss:ready" }
  /** add: shift was held, so the pick joins (or leaves) the selection instead of replacing it. */
  | { type: "ss:pick"; blockId: string; label: string; element: string | null; add: boolean }
  /** A drag-select: everything the box covered, replacing the selection unless shift was held. */
  | { type: "ss:picks"; items: Array<{ blockId: string; label: string; element: string | null }>; add: boolean }
  | { type: "ss:clear" }
  /** Double-click typing: the words as they were and as typed, in one block. */
  | { type: "ss:text"; blockId: string; before: string; after: string };

/** Text a double-click can type over: an element whose words are its own (no blocks inside), short enough to be copy. */
const INLINE = new Set(["SPAN", "B", "STRONG", "EM", "I", "U", "A", "BR", "SMALL", "MARK", "SUP", "SUB"]);
function typeable(t: EventTarget | null): HTMLElement | null {
  let el = t instanceof HTMLElement ? t : null;
  // A click on an inline word inside a heading types over the whole heading.
  while (el && INLINE.has(el.tagName) && el.parentElement && !el.parentElement.hasAttribute("data-block-id") && [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) el = el.parentElement;
  if (!el || !el.closest("[data-block-id]") || el.closest("button, input, textarea, select, svg, canvas, iframe")) return null;
  if (![...el.children].every((c) => INLINE.has(c.tagName))) return null;
  const words = (el.textContent ?? "").trim();
  return words.length > 0 && words.length <= 600 ? el : null;
}

export interface Sel { blockId: string; element: string | null }
const same = (a: Sel, b: Sel) => a.blockId === b.blockId && (a.element ?? null) === (b.element ?? null);

interface Box { top: number; left: number; width: number; height: number }
const rectOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };

/** A box in page coordinates (scroll included), so it stays put while the page scrolls under the drag. */
interface Area { x1: number; y1: number; x2: number; y2: number }
const DRAG_START = 6;
const pageRect = (el: Element): Area => { const r = el.getBoundingClientRect(); return { x1: r.left + scrollX, y1: r.top + scrollY, x2: r.right + scrollX, y2: r.bottom + scrollY }; };
const norm = (a: Area): Area => ({ x1: Math.min(a.x1, a.x2), y1: Math.min(a.y1, a.y2), x2: Math.max(a.x1, a.x2), y2: Math.max(a.y1, a.y2) });
const meets = (a: Area, b: Area) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
const holds = (a: Area, b: Area) => b.x1 >= a.x1 && b.x2 <= a.x2 && b.y1 >= a.y1 && b.y2 <= a.y2;

/**
 * What a drag box selects: the parts (data-el) wholly inside it, across every block it covers, never a whole block.
 * A part inside another picked part goes with its parent. When the box holds no whole part, the smallest parts it
 * touches are taken; only a box over blocks with no parts at all falls back to those blocks.
 */
function underArea(box: Area): Array<{ blockId: string; label: string; element: string | null }> {
  const blocks = [...document.querySelectorAll("[data-block-id]")].filter((b) => meets(box, pageRect(b)));
  const out: Array<{ blockId: string; label: string; element: string | null }> = [];
  for (const b of blocks) {
    const blockId = b.getAttribute("data-block-id")!, label = b.getAttribute("data-block-label") ?? "Block";
    const parts = [...b.querySelectorAll("[data-el]")].filter((el) => el.closest("[data-block-id]") === b);
    let picked = parts.filter((el) => holds(box, pageRect(el)));
    picked = picked.filter((el) => !picked.some((o) => o !== el && o.contains(el)));
    if (!picked.length) {
      const touched = parts.filter((el) => meets(box, pageRect(el)));
      picked = touched.filter((el) => !touched.some((o) => o !== el && el.contains(o)));
    }
    for (const n of new Set(picked.map((el) => el.getAttribute("data-el")!))) out.push({ blockId, label, element: n });
  }
  return out.length ? out : blocks.map((b) => ({ blockId: b.getAttribute("data-block-id")!, label: b.getAttribute("data-block-label") ?? "Block", element: null }));
}

export function PreviewClient({ initial, walletconnect, credit }: { initial: SiteSpec; walletconnect: string | null; credit: string | null }) {
  const [spec, setSpec] = useState(initial);
  const [selectOn, setSelectOn] = useState(true);
  // The hovered element itself, not a box: the outline is measured on every render, so it moves with the page.
  const [hover, setHover] = useState<{ el: Element; label: string } | null>(null);
  const [sel, setSel] = useState<Sel[]>([]);
  const [markers, setMarkers] = useState<Array<{ blockId: string; n: number }>>([]);
  const [area, setArea] = useState<Area | null>(null);
  // Outside the select effect: picking re-runs that effect between a drag's mouseup and the click that follows it.
  const swallowClick = useRef(false);
  const [, force] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Where the cursor last was. Scrolling fires no mousemove, so a scroll re-checks what is now under it.
  const pointer = useRef<{ x: number; y: number; alt: boolean } | null>(null);

  const post = useCallback((m: FromPreview) => window.parent?.postMessage(m, window.location.origin), []);
  // Typing over words in place: a textarea laid over the element (React keeps its own nodes untouched).
  const [editing, setEditing] = useState<{ el: HTMLElement; blockId: string; before: string; value: string; style: React.CSSProperties } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const finish = useCallback((save: boolean) => {
    const e = editingRef.current;
    if (!e) return;
    editingRef.current = null;
    e.el.style.visibility = "";
    setEditing(null);
    const after = e.value.replace(/\s+/g, " ").trim();
    if (save && after && after !== e.before) post({ type: "ss:text", blockId: e.blockId, before: e.before, after });
  }, [post]);
  useEffect(() => {
    if (!selectOn) return;
    const dbl = (ev: MouseEvent) => {
      if ((ev.target as Element | null)?.closest?.("[data-ss-editor]")) return;
      const el = typeable(ev.target);
      const block = el?.closest("[data-block-id]");
      if (!el || !block) return;
      ev.preventDefault();
      getSelection()?.removeAllRanges();
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const before = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      const style: React.CSSProperties = {
        position: "fixed", top: r.top, left: r.left, width: Math.max(r.width, 60), minHeight: r.height,
        font: cs.font, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform as React.CSSProperties["textTransform"], textAlign: cs.textAlign as React.CSSProperties["textAlign"],
        color: cs.color, lineHeight: cs.lineHeight, padding: cs.padding, background: "transparent", border: 0, outline: "2px solid #C6F24E", outlineOffset: 2, borderRadius: 4, resize: "none", overflow: "hidden", pointerEvents: "auto", margin: 0,
      };
      el.style.visibility = "hidden";
      setEditing({ el, blockId: block.getAttribute("data-block-id")!, before, value: el.textContent?.trim() ?? "", style });
    };
    document.addEventListener("dblclick", dbl, true);
    return () => document.removeEventListener("dblclick", dbl, true);
  }, [selectOn]);
  // A new spec (the save came back) or leaving select mode ends any typing.
  useEffect(() => () => { const e = editingRef.current; if (e) e.el.style.visibility = ""; }, []);
  useEffect(() => { if (!selectOn) finish(false); }, [selectOn, finish]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as FromBuilder;
      if (m?.type === "ss:spec") setSpec(m.spec);
      else if (m?.type === "ss:select") { setSelectOn(m.on); if (!m.on) setHover(null); }
      else if (m?.type === "ss:markers") setMarkers(m.items);
      else if (m?.type === "ss:selected") setSel(m.items ?? []);
      else if (m?.type === "ss:focus") document.querySelector(`[data-block-id="${CSS.escape(m.blockId)}"]`)?.scrollIntoView({ block: "start" });
    };
    window.addEventListener("message", on);
    post({ type: "ss:ready" });
    return () => window.removeEventListener("message", on);
  }, [post]);

  // Boxes follow the page as it scrolls or reflows.
  useEffect(() => {
    const re = () => force((n) => n + 1);
    window.addEventListener("scroll", re, true);
    window.addEventListener("resize", re);
    const ro = new ResizeObserver(re);
    if (root.current) ro.observe(root.current);
    return () => { window.removeEventListener("scroll", re, true); window.removeEventListener("resize", re); ro.disconnect(); };
  }, []);

  const targetOf = useCallback((t: EventTarget | null, wholeBlock: boolean) => {
    const el = t instanceof Element ? t : null;
    const block = el?.closest("[data-block-id]");
    if (!block) return null;
    const part = wholeBlock ? null : el?.closest("[data-el]");
    const inBlock = part && block.contains(part) ? part : null;
    return { block, part: inBlock };
  }, []);

  useEffect(() => {
    if (!selectOn) return;
    let frame = 0;
    const hoverAt = (target: EventTarget | null, alt: boolean) => {
      const t = targetOf(target, alt);
      if (!t) { setHover(null); return; }
      const label = t.block.getAttribute("data-block-label") ?? "Block";
      const el = t.part?.getAttribute("data-el");
      const id = t.block.getAttribute("data-block-id");
      // The selected element already has its own outline.
      if (id && sel.some((s) => same(s, { blockId: id, element: el ?? null }))) { setHover(null); return; }
      const next = t.part ?? t.block;
      const text = el ? `${label} · ${el}` : label;
      setHover((h) => (h?.el === next && h.label === text ? h : { el: next, label: text }));
    };
    const inEditor = (e: Event) => !!(e.target as Element | null)?.closest?.("[data-ss-editor]");
    const move = (e: MouseEvent) => {
      if (inEditor(e)) return;
      pointer.current = { x: e.clientX, y: e.clientY, alt: e.altKey };
      hoverAt(e.target, e.altKey);
    };
    const recheck = () => {
      if (!pointer.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const at = pointer.current;
        if (at) hoverAt(document.elementFromPoint(at.x, at.y), at.alt);
      });
    };
    // Press and drag: a box. Under DRAG_START px of movement it stays a click.
    let drag: { start: Area; add: boolean; on: boolean; x: number; y: number } | null = null;
    let scrollTimer = 0;
    const edgeScroll = () => {
      if (!drag?.on) return;
      const dy = drag.y < 48 ? -18 : drag.y > innerHeight - 48 ? 18 : 0;
      if (dy) {
        scrollBy(0, dy);
        drag.start = { ...drag.start, x2: drag.x + scrollX, y2: drag.y + scrollY };
        setArea(norm(drag.start));
      }
      scrollTimer = requestAnimationFrame(edgeScroll);
    };
    const dragMove = (e: MouseEvent) => {
      if (!drag) return;
      if (!(e.buttons & 1)) { drag = null; setArea(null); return; }
      drag.x = e.clientX; drag.y = e.clientY;
      drag.start = { ...drag.start, x2: e.clientX + scrollX, y2: e.clientY + scrollY };
      if (!drag.on && Math.hypot(drag.start.x2 - drag.start.x1, drag.start.y2 - drag.start.y1) < DRAG_START) return;
      if (!drag.on) {
        drag.on = true;
        getSelection()?.removeAllRanges();
        document.documentElement.style.userSelect = "none";
        setHover(null);
        scrollTimer = requestAnimationFrame(edgeScroll);
      }
      setArea(norm(drag.start));
    };
    const dragEnd = () => {
      const d = drag;
      drag = null;
      cancelAnimationFrame(scrollTimer);
      if (!d?.on) return;
      document.documentElement.style.userSelect = "";
      setArea(null);
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 50);
      const items = underArea(norm(d.start));
      if (!items.length) return;
      setSel((cur) => {
        const base = d.add ? cur : [];
        return [...base, ...items.filter((x) => !base.some((s) => same(s, x)))].map(({ blockId, element }) => ({ blockId, element }));
      });
      post({ type: "ss:picks", items, add: d.add });
    };
    const noNativeDrag = (e: DragEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      if (inEditor(e)) return;
      if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); swallowClick.current = false; return; }
      const t = targetOf(e.target, e.altKey);
      e.preventDefault();
      e.stopPropagation();
      if (!t) { if (!e.shiftKey) { setSel([]); post({ type: "ss:clear" }); } return; }
      const blockId = t.block.getAttribute("data-block-id")!;
      const element = t.part?.getAttribute("data-el") ?? null;
      const pick = { blockId, element };
      setSel((cur) => (e.shiftKey ? (cur.some((s) => same(s, pick)) ? cur.filter((s) => !same(s, pick)) : [...cur, pick]) : [pick]));
      post({ type: "ss:pick", blockId, label: t.block.getAttribute("data-block-label") ?? "Block", element, add: e.shiftKey });
    };
    const key = (e: KeyboardEvent) => {
      if (inEditor(e)) return;
      if (e.key === "Escape") { setSel([]); post({ type: "ss:clear" }); }
      // Arrow up widens the last pick from an element to its block, like bolt's select tool.
      const last = sel[sel.length - 1];
      if (e.key === "ArrowUp" && last?.element) {
        e.preventDefault();
        const blockEl = document.querySelector(`[data-block-id="${CSS.escape(last.blockId)}"]`);
        const label = blockEl?.getAttribute("data-block-label") ?? "Block";
        // Shift-picked: the element leaves and its block joins; otherwise the block replaces it.
        if (sel.length > 1) {
          post({ type: "ss:pick", blockId: last.blockId, label, element: last.element, add: true });
          if (!sel.some((s) => same(s, { blockId: last.blockId, element: null }))) post({ type: "ss:pick", blockId: last.blockId, label, element: null, add: true });
        } else post({ type: "ss:pick", blockId: last.blockId, label, element: null, add: false });
      }
    };
    const leave = () => { pointer.current = null; setHover(null); };
    // Shift-click would select the page's text between the two clicks.
    const down = (e: MouseEvent) => {
      if (inEditor(e)) return;
      if (editingRef.current) finish(true);
      if (e.shiftKey) e.preventDefault();
      if (e.button === 0) { const x = e.clientX + scrollX, y = e.clientY + scrollY; drag = { start: { x1: x, y1: y, x2: x, y2: y }, add: e.shiftKey, on: false, x: e.clientX, y: e.clientY }; }
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mousemove", dragMove, true);
    document.addEventListener("mouseup", dragEnd, true);
    document.addEventListener("dragstart", noNativeDrag, true);
    // Wheel too: smooth scrolling keeps moving after the wheel event, and scroll catches the rest of it.
    window.addEventListener("scroll", recheck, { capture: true, passive: true });
    window.addEventListener("wheel", recheck, { passive: true });
    document.addEventListener("click", click, true);
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key);
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mousemove", dragMove, true);
      document.removeEventListener("mouseup", dragEnd, true);
      document.removeEventListener("dragstart", noNativeDrag, true);
      cancelAnimationFrame(scrollTimer);
      document.documentElement.style.userSelect = "";
      setArea(null);
      window.removeEventListener("scroll", recheck, true);
      window.removeEventListener("wheel", recheck);
      cancelAnimationFrame(frame);
      document.removeEventListener("click", click, true);
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key);
      document.documentElement.removeEventListener("mouseleave", leave);
    };
  }, [selectOn, targetOf, post, sel, finish]);

  const hoverBox = hover && hover.el.isConnected ? rectOf(hover.el) : null;

  const selBoxes = sel.flatMap((s) => {
    const block = document.querySelector(`[data-block-id="${CSS.escape(s.blockId)}"]`);
    if (!block) return [];
    const part = s.element ? block.querySelector(`[data-el="${CSS.escape(s.element)}"]`) : null;
    return [{ key: `${s.blockId}|${s.element ?? ""}`, box: rectOf(part ?? block) }];
  });

  return (
    <>
      <div ref={root} style={{ cursor: selectOn ? "default" : undefined }}>
        <Site spec={spec} mode="preview" walletconnect={walletconnect} credit={credit} />
      </div>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }}>
        {area && (
          <div style={{ position: "fixed", top: area.y1 - scrollY, left: area.x1 - scrollX, width: area.x2 - area.x1, height: area.y2 - area.y1, border: "1px solid #7C9CFF", background: "rgba(124,156,255,0.10)", borderRadius: 2 }} />
        )}
        {selectOn && !area && hoverBox && (
          <div style={{ position: "fixed", top: hoverBox.top, left: hoverBox.left, width: hoverBox.width, height: hoverBox.height, outline: "2px solid #7C9CFF", outlineOffset: -2, background: "rgba(124,156,255,0.06)", borderRadius: 4 }}>
            <span style={{ position: "absolute", top: hoverBox.top < 24 ? 4 : -22, left: 0, background: "#7C9CFF", color: "#08080A", font: "600 11px/18px system-ui, sans-serif", padding: "0 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{hover!.label}</span>
          </div>
        )}
        {/* One dimming layer for all picks: a shadow per box would darken the page once for each. */}
        {selBoxes.length > 0 && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.12)", clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${selBoxes.map(({ box: b }) => `${b.left}px ${b.top}px, ${b.left + b.width}px ${b.top}px, ${b.left + b.width}px ${b.top + b.height}px, ${b.left}px ${b.top + b.height}px, ${b.left}px ${b.top}px, 0 0`).join(", ")})` }} />}
        {selBoxes.map(({ key, box }) => (
          <div key={key} style={{ position: "fixed", top: box.top, left: box.left, width: box.width, height: box.height, outline: "2px solid #C6F24E", outlineOffset: -2, borderRadius: 4 }} />
        ))}
        {editing && (
          <textarea
            data-ss-editor=""
            autoFocus
            aria-label="Edit text"
            style={editing.style}
            value={editing.value}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => { const value = e.target.value; setEditing((x) => (x ? { ...x, value } : x)); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); } if (e.key === "Escape") { e.preventDefault(); finish(false); } }}
            onBlur={() => finish(true)}
          />
        )}
        {markers.map((m) => {
          const el = document.querySelector(`[data-block-id="${CSS.escape(m.blockId)}"]`);
          if (!el) return null;
          const r = rectOf(el);
          return (
            <span key={m.blockId} style={{ position: "fixed", top: Math.max(6, r.top + 10), left: r.left + r.width - 38, width: 26, height: 26, borderRadius: 13, background: "#7C9CFF", color: "#08080A", display: "grid", placeItems: "center", font: "700 12px system-ui, sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>{m.n}</span>
          );
        })}
      </div>
    </>
  );
}
