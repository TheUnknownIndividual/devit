import { isVenueHost } from "./venues";
import type { SocialInput } from "./spec";

// Pure helpers for socials named in text: safe on the client (the landing composer) and the server.

const RESERVED_X = new Set(["i", "home", "intent", "search", "share", "hashtag", "explore", "settings", "messages", "notifications"]);

export function xHandle(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  const h = m ? m[1] : s.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h) || RESERVED_X.has(h.toLowerCase())) return null;
  return h;
}

/** Socials named in a chat message: links, or an @handle next to the word X/Twitter (or on its own). */
export function socialsFromText(text: string): SocialInput {
  const out: SocialInput = {};
  const x = text.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\b/i)?.[1]
    ?? (/\b(x|twitter|handle)\b/i.test(text) || /^\s*@[A-Za-z0-9_]{1,15}\s*$/.test(text) ? text.match(/(?:^|\s)@([A-Za-z0-9_]{1,15})\b/)?.[1] : undefined);
  if (x && xHandle(x)) out.x = x;
  const tg = text.match(/(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/]{3,64}/i)?.[0] ?? (/\btelegram\b/i.test(text) ? text.match(/(?:^|\s)@([A-Za-z0-9_]{4,32})\b/)?.[1] : undefined);
  if (tg && tg !== out.x) out.telegram = tg;
  const dc = text.match(/discord\.(?:gg|com\/invite)\/[A-Za-z0-9-]+/i)?.[0];
  if (dc) out.discord = dc;
  for (const m of text.matchAll(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s]*)?/gi)) {
    const host = m[1].toLowerCase().replace(/^www\./, "");
    if (/^(x|twitter|t|telegram|discord)\.(com|me|gg)$/.test(host) || /\.near$|\.tg$/.test(host) || isVenueHost(host)) continue;
    // A bare word with a dot ("Bonk.fun" in a headline edit) counts only as a link or next to the word site.
    if (!/^(https?:\/\/|www\.)/i.test(m[0]) && !/\b(web)?site\b/i.test(text) && text.trim() !== m[0]) continue;
    out.website = m[0];
    break;
  }
  return out;
}
