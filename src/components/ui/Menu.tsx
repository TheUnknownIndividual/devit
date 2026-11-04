"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

// A small dropdown: one trigger, a list of rows with an icon, a label and an optional hint.
// Closes on outside click and Escape. Opens upward when `up` is set (toolbars at the bottom of a box).

export interface MenuItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
  disabled?: boolean;
}

export function Menu<T extends string>({
  trigger, items, value, onPick, up, align = "left", width = 240, label, header,
}: {
  trigger: (open: boolean) => ReactNode;
  items: MenuItem<T>[];
  value?: T;
  onPick: (v: T) => void;
  up?: boolean;
  align?: "left" | "right";
  width?: number;
  label: string;
  /** A non-interactive top row (who's signed in, say). */
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{ width }}
          className={`absolute z-50 animate-menu rounded-xl border border-white/10 bg-ink-850 p-1 shadow-[0_16px_48px_rgba(0,0,0,0.5)] ${up ? "bottom-full mb-2 [--my0:4px]" : "top-full mt-2 [--my0:-4px]"} ${align === "right" ? "right-0" : "left-0"} ${align === "right" ? (up ? "origin-bottom-right" : "origin-top-right") : up ? "origin-bottom-left" : "origin-top-left"}`}
        >
          {header && <div className="mb-1 border-b border-white/[0.07] px-2.5 pb-2 pt-1.5">{header}</div>}
          {items.map((it) => (
            <button
              key={it.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === it.value}
              disabled={it.disabled}
              onClick={() => { onPick(it.value); setOpen(false); }}
              className="group/item flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            >
              <span className="grid w-5 shrink-0 place-items-center transition-transform duration-300 group-hover/item:scale-110">{it.icon}</span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-[11px] text-zinc-500">{it.hint}</span>}
              {value === it.value && <Check size={14} className="text-lime" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
