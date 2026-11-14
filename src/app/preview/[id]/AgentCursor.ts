// The agent's cursor in the builder preview: a small labelled pointer that glides to what the agent is working on,
// outlines it, and stays there (a small drift, the odd click) until the agent moves on to something else.
// It never takes input (pointer-events: none) and is plain DOM driven by one rAF loop, so it costs React nothing.

interface Focus { blockId: string; element?: string; text?: string }
export interface AgentState { label: string; focus: Focus[]; follow: boolean }

const ACCENT = "#C6F24E";
const INK = "#0A0B0D";
const ANCHOR = "[data-el], h1, h2, h3";
const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

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
  private x = innerWidth * 0.5;
  private y = innerHeight * 0.45;
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

  /**
   * The one thing the agent is on: the words a patch is changing when we know them, else the named part, else the
   * section's main heading. Several focuses (a multi-pick) take turns, a few seconds each.
   */
  private turn = 0;
  private targets(): Element[] {
    const out: Element[] = [];
    for (const f of this.state?.focus ?? []) {
      const block = document.querySelector(`[data-block-id="${CSS.escape(f.blockId)}"]`);
      if (!block) continue;
      const exact = (f.element ? block.querySelector(`[data-el="${CSS.escape(f.element)}"]`) : null) ?? (f.text ? this.byText(block, f.text) : null);
      // The page just re-rendered (the edit landed) and the words changed: stay on whatever is now under the pointer.
      const under = !exact && this.spot && !this.spot.el.isConnected ? document.elementFromPoint(this.x, this.y) : null;
      out.push(exact ?? (under && block.contains(under) ? under : null) ?? this.anchor(block));
    }
    return out;
  }
  /** The smallest element in the section whose words contain `text` (the start of what a patch finds). */
  private byText(block: Element, text: string): Element | null {
    const want = norm(text).slice(0, 40);
    if (want.length < 3) return null;
    let best: Element | null = null;
    let size = Infinity;
    for (const el of block.querySelectorAll("*")) {
      const t = norm(el.textContent ?? "");
      if (t.length < size && t.includes(want)) { best = el; size = t.length; }
    }
    return best;
  }
  /** Where a person would point in a section: its first named part or heading that's on screen, else the section. */
  private anchor(block: Element): Element {
    for (const el of block.querySelectorAll(ANCHOR)) {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) return el;
    }
    return block;
  }

  /** The next spot: the same target with a small drift, or the next one when there are several. */
  private pick(): Spot | null {
    const targets = this.targets();
    if (!targets.length) return this.spot;
    this.turn = (this.turn + 1) % targets.length;
    const el = targets[targets.length > 1 ? this.turn : 0];
    if (el === this.spot?.el) return { el, fx: Math.max(0.15, Math.min(0.85, this.spot.fx + rand(-0.12, 0.12))), fy: Math.max(0.3, Math.min(0.75, this.spot.fy + rand(-0.1, 0.1))) };
    return { el, fx: rand(0.3, 0.6), fy: rand(0.45, 0.65) };
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
      const was = this.spot?.el;
      this.spot = this.pick();
      // Only a new target gets a fresh outline and click; a drift on the same one keeps them.
      if (this.spot?.el !== was) { this.clicked = false; this.arrivedAt = 0; this.box.style.opacity = "0"; }
      this.nextAt = now + rand(2600, 4200);
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
