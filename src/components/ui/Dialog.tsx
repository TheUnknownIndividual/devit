"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ open, onClose, title, icon, width = 560, children, footer }: {
  open: boolean; onClose: () => void; title: string; icon?: ReactNode; width?: number; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[min(760px,calc(100vh-32px))] w-full animate-rise flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.07] px-4">
          {icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-zinc-300">{icon}</span>}
          <h2 className="text-[15px] font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon ml-auto h-8 w-8" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
