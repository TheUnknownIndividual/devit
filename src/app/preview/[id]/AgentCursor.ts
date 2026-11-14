// The agent's cursor in the builder preview: a small labelled pointer that glides to what the agent is working on,
// outlines the part it's on, clicks now and then, and moves on to the next part, like a person working on the page.
// It never takes input (pointer-events: none) and is plain DOM driven by one rAF loop, so it costs React nothing.

interface Focus { blockId: string; element?: string }
export interface AgentState { label: string; focus: Focus[]; follow: boolean }

const ACCENT = "#C6F24E";
const INK = "#0A0B0D";
const PARTS = "[data-el], h1, h2, h3, h4, p, img, a, button, li, figure, svg, input";

/** A spot to work on: an element and where on it the pointer rests (fractions of its box). */
interface Spot { el: Element; fx: number; fy: number }

const visible = (r: DOMRect) => r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class AgentCursor {
  private root: HTMLDivElement;
  private pointer: HTMLDivElement;
  private tag: HTMLSpanElement;
  private box: HTMLDivElement;
  private state: AgentState | null = null;
  private spot: Spot | null = null;
  private x = innerWidth * 0.72;
  private y = innerHeight * 0.78;
  private shown = 0;
  private nextAt = 0;
  private arrivedAt = 0;
  private raf = 0;
  private last = 0;
  private clicked = false;
  private reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor() {
    this.root = document.createElement("div");
    this.root.setAttribute("aria-hidden", "true");
    this.root.setAttribute("data-ss-agent", "");
    Object.assign(this.root.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483600", opacity: "0", transition: "opacity .35s ease" });
    const style = document.createElement("style");
    style.textContent = `
      @keyframes ss-agent-dots { 0%,20% { opacity: .2 } 50% { opacity: 1 } 100% { opacity: .2 } }
      @keyframes ss-agent-ripple { from { transform: translate(-50%,-50%) scale(.3); opacity: .7 } to { transform: translate(-50%,-50%) scale(1.6); opacity: 0 } }
      [data-ss-agent] .dots i { font-style: normal; animation: ss-agent-dots 1.2s infinite; }
      [data-ss-agent] .dots i:nth-child(2) { animation-delay: .2s } [data-ss-agent] .dots i:nth-child(3) { animation-delay: .4s }
      @media (prefers-reduced-motion: reduce) { [data-ss-agent] .dots i { animation: none; opacity: .8 } }`;
    this.root.appendChild(style);

    this.box = document.createElement("div");
    Object.assign(this.box.style, {
      position: "fixed", left: "0", top: "0", width: "0", height: "0", borderRadius: "6px", opacity: "0",
      outline: `1.5px solid ${ACCENT}`, outlineOffset: "3px", background: "rgba(198,242,78,0.07)",
      transition: "opacity .25s ease", boxShadow: "0 0 0 6px rgba(198,242,78,0.06)",
    });
    this.root.appendChild(this.box);

    this.pointer = document.createElement("div");
    Object.assign(this.pointer.style, { position: "fixed", left: "0", top: "0", willChange: "transform", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.45))" });
    this.pointer.innerHTML = `<svg width="18" height="20" viewBox="0 0 18 20" style="display:block"><path d="M2 1.5 L2 16.2 L6.1 12.6 L8.9 18.6 L11.6 17.4 L8.9 11.5 L14.6 11.2 Z" fill="${ACCENT}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    this.tag = document.createElement("span");
    Object.assign(this.tag.style, {
      position: "absolute", left: "16px", top: "17px", whiteSpace: "nowrap", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis",
      background: ACCENT, color: INK, font: "600 11px/18px ui-sans-serif, system-ui, -apple-system, sans-serif", padding: "1px 8px", borderRadius: "9px 9px 9px 3px",
    });
    this.pointer.appendChild(this.tag);
    this.root.appendChild(this.pointer);
    document.body.appendChild(this.root);
  }

  set(next: AgentState | null) {
    const prev = this.state;
    this.state = next;
    if (!next) { this.root.style.opacity = "0"; this.box.style.opacity = "0"; return; }
    this.tag.innerHTML = "";
    this.tag.append(`devit · ${next.label}`);
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.innerHTML = "<i>.</i><i>.</i><i>.</i>";
    this.tag.appendChild(dots);
    this.root.style.opacity = "1";
    const key = (s: AgentState | null) => (s ? s.focus.map((f) => `${f.blockId}|${f.element ?? ""}`).join() : "");
    if (key(prev) !== key(next)) {
      this.nextAt = 0;
      // A new place to work: bring it into view (the builder scrolls by itself while a build streams in).
      const first = this.targets()[0];
      if (next.follow && first) {
        const r = first.getBoundingClientRect();
        const seen = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        if (seen < Math.min(r.height, innerHeight) * 0.5) first.scrollIntoView({ block: r.height > innerHeight ? "start" : "center", behavior: this.reduce ? "auto" : "smooth" });
      }
    }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.remove();
  }

  /** The elements the agent is on: its focus, or (with none) the page itself. */
  private targets(): Element[] {
    const out: Element[] = [];
    for (const f of this.state?.focus ?? []) {
      const block = document.querySelector(`[data-block-id="${CSS.escape(f.blockId)}"]`);
      const el = (f.element && block?.querySelector(`[data-el="${CSS.escape(f.element)}"]`)) || block;
      if (el) out.push(el);
    }
    return out;
  }

  /** The next spot: a visible part inside what it's working on (or anywhere on screen while it reads the page). */
  private pick(): Spot | null {
    const targets = this.targets();
    const pool: Element[] = [];
    const scopes = targets.length ? targets : [document.body];
    for (const t of scopes) {
      for (const el of t.querySelectorAll(PARTS)) {
        if (el.closest("[data-ss-agent]")) continue;
        const r = el.getBoundingClientRect();
        // Parts, not whole panels: something a person would point at.
        if (visible(r) && r.width * r.height < innerWidth * innerHeight * 0.3 && r.height < innerHeight * 0.6) pool.push(el);
      }
      const r = t.getBoundingClientRect();
      if (t !== document.body && visible(r) && !pool.length) pool.push(t);
    }
    if (!pool.length) return null;
    // Prefer the named parts (data-el) and not the one it was just on.
    const named = pool.filter((el) => el.hasAttribute("data-el") && el !== this.spot?.el);
    const from = named.length && Math.random() < 0.7 ? named : pool.filter((el) => el !== this.spot?.el);
    const el = (from.length ? from : pool)[Math.floor(Math.random() * (from.length || pool.length))];
    return { el, fx: rand(0.25, 0.75), fy: rand(0.35, 0.7) };
  }

  private ripple(x: number, y: number) {
    if (this.reduce) return;
    const r = document.createElement("span");
    Object.assign(r.style, { position: "fixed", left: `${x}px`, top: `${y}px`, width: "26px", height: "26px", borderRadius: "50%", border: `2px solid ${ACCENT}`, animation: "ss-agent-ripple .6s ease-out forwards" });
    this.root.appendChild(r);
    setTimeout(() => r.remove(), 650);
  }

  private tick = (now: number) => {
    const dt = Math.min(64, now - this.last) / 1000;
    this.last = now;
    const on = !!this.state;
    this.shown += ((on ? 1 : 0) - this.shown) * Math.min(1, dt * 6);
    if (!on && this.shown < 0.02) { this.raf = 0; return; }

    if (on && (now >= this.nextAt || !this.spot?.el.isConnected)) {
      this.spot = this.pick();
      this.clicked = false;
      this.arrivedAt = 0;
      this.box.style.opacity = "0";
      this.nextAt = now + rand(1700, 2900);
    }

    let tx = this.x, ty = this.y;
    let r: DOMRect | null = null;
    if (this.spot) {
      r = this.spot.el.getBoundingClientRect();
      tx = r.left + r.width * this.spot.fx;
      ty = r.top + r.height * this.spot.fy;
    }
    // Off screen (the person scrolled away): wait at the nearest edge.
    tx = Math.max(10, Math.min(innerWidth - 24, tx));
    ty = Math.max(10, Math.min(innerHeight - 30, ty));
    if (this.reduce) { this.x = tx; this.y = ty; }
    else {
      const k = 1 - Math.exp(-dt * 5.5);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
    }
    const near = Math.hypot(tx - this.x, ty - this.y) < 4;
    // A little life while it rests, the way a hand is never quite still.
    const wob = this.reduce || !near ? 0 : Math.sin(now / 420) * 1.2;
    this.pointer.style.transform = `translate(${this.x + wob}px, ${this.y - wob * 0.6}px)`;

    const small = !!r && r.width * r.height < innerWidth * innerHeight * 0.3;
    if (on && near && r && visible(r) && small) {
      if (!this.arrivedAt) this.arrivedAt = now;
      Object.assign(this.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, opacity: "1" });
      if (!this.clicked && now - this.arrivedAt > 350) { this.clicked = true; if (Math.random() < 0.55) this.ripple(this.x, this.y); }
    } else if (!small) this.box.style.opacity = "0";
    else if (this.spot && r) {
      Object.assign(this.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
