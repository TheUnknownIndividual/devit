// Reference sites named in a sentence. Pure, so the landing page shows them as you type (lib/intent.ts).

// "ref: x.com", "reference x.com", "inspired by x.com": any domain. "like …" only with a full address ("like
// https://x.com" or "like www.x.com"), so "like pump.fun" stays a named look (themes.ts REFERENCES) and "like
// token.near" is not read as a website.
const REF_WORD = /\b(?:refs?|references?|inspo|inspired by|inspiration|similar to|in the style of|style of)\s*[:=]?\s*((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;)]*)?)/gi;
const LIKE_URL = /\b(?:look(?:s)? like|like)\s+((?:https?:\/\/|www\.)(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;)]*)?)/gi;
const NOT_WEB = /\.(near|tg|sol|eth|testnet)$/i;

/** URLs given as references, at most three, one per host. */
export function refsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of [...text.matchAll(REF_WORD), ...text.matchAll(LIKE_URL)]) {
    const raw = m[1].replace(/[.,;)]+$/, "");
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(url);
      if (NOT_WEB.test(u.hostname)) continue;
      if (!out.some((x) => new URL(x).host === u.host)) out.push(u.toString());
    } catch { /* not a URL */ }
  }
  return out.slice(0, 3);
}

/** The text with its reference URLs (and the word that introduced them) taken out, so they aren't read as the team's own site. */
export function withoutRefs(text: string): string {
  return text.replace(REF_WORD, (m, url: string) => (NOT_WEB.test(url) ? m : " ")).replace(LIKE_URL, " ").replace(/\s{2,}/g, " ").trim();
}
