import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: { 950: "#08080A", 900: "#0E0E11", 850: "#131317", 800: "#18181D", 700: "#232329", 600: "#2E2E36" },
        line: "rgba(255,255,255,0.08)",
        sel: "#7C9CFF",
        lime: { DEFAULT: "#C6F24E", 600: "#A9D63A" },
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        pop: { "0%": { transform: "scale(0.6)", opacity: "0" }, "70%": { transform: "scale(1.08)" }, "100%": { transform: "scale(1)", opacity: "1" } },
        drift: { "0%,100%": { transform: "translate3d(0,0,0) scale(1)" }, "50%": { transform: "translate3d(3%,-2%,0) scale(1.06)" } },
        menu: { "0%": { opacity: "0", transform: "scale(.96) translateY(var(--my0, 4px))" }, "100%": { opacity: "1", transform: "none" } },
        caret: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        dash: { to: { strokeDashoffset: "-14" } },
      },
      animation: {
        rise: "rise .35s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        pop: "pop .32s ease-out both",
        drift: "drift 18s ease-in-out infinite",
        menu: "menu .18s cubic-bezier(.2,.8,.2,1) both",
        caret: "caret 1s steps(1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
