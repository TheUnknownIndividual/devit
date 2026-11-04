import { THEMES } from "@/lib/themes";
import type { ThemeId } from "@/lib/spec";

/** A tiny two-colour tile so a style is recognisable at a glance in menus and cards. */
export function ThemeSwatch({ id, size = 16 }: { id: ThemeId; size?: number }) {
  const t = THEMES[id];
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: t.bg, borderColor: t.dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)" }}
      className="relative inline-block shrink-0 overflow-hidden rounded-[5px] border"
    >
      <span style={{ background: t.accent }} className="absolute bottom-0 right-0 h-1/2 w-1/2" />
    </span>
  );
}
