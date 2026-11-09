"use client";

import { Bot, Cpu, Sparkles, Zap } from "lucide-react";
import { BrandIcon, BRANDS } from "@/components/brand";
import type { LlmProviderId } from "@/lib/llm-providers";

// A provider's mark: grey in lists, its own colour when `on` (the picked model, a saved key).

const TINT: Partial<Record<string, string>> = {
  nearai: "#00EC97", anthropic: "#D97757", openai: "#10A37F", openrouter: "#94A3FF", gemini: "#8E75FF", xai: "#FFFFFF",
  groq: "#F55036", mistral: "#FA520F", deepseek: "#4D6BFE", huggingface: "#FFD21E",
};

export function ProviderMark({ provider, on = false, size = 13 }: { provider: LlmProviderId | "auto"; on?: boolean; size?: number }) {
  const color = on ? TINT[provider] ?? "#d4d4d8" : "#a1a1aa";
  const brand = { nearai: BRANDS.near, anthropic: BRANDS.claude, openrouter: BRANDS.openrouter, gemini: BRANDS.gemini, xai: BRANDS.x, mistral: BRANDS.mistral, deepseek: BRANDS.deepseek, huggingface: BRANDS.huggingface }[provider as string];
  if (brand) return <BrandIcon icon={brand} size={size} color={color} />;
  if (provider === "openai") return <Bot size={size} style={{ color }} />;
  if (provider === "groq") return <Zap size={size} style={{ color }} />;
  if (provider === "auto") return <Sparkles size={size} className={on ? "text-lime" : "text-zinc-400"} />;
  return <Cpu size={size} style={{ color }} />;
}
