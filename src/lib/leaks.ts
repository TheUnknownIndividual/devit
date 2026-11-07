// The leak firewall: finds secrets in text before it goes anywhere it shouldn't (a model, a log line, a published
// page). Shapes are the issuers' own documented prefixes, so ordinary copy and contract addresses don't trip it.
// A wallet private key is only taken as one when the text calls it a key: a bare 64-hex string is usually a tx hash,
// and a bare 88-char base58 string a Solana signature.

export type Leak = { kind: string; start: number; end: number };

const RULES: Array<{ kind: string; re: RegExp; group?: number }> = [
  { kind: "a private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "a wallet private key", re: /\b(?:private[\s_-]?key|priv[\s_-]?key|secret[\s_-]?key|pk)\b["'`]?\s*(?:is|=|:|-)?\s*["'`]?((?:0x)?[a-fA-F0-9]{64})\b/gi, group: 1 },
  // Same length as a transaction signature, so only when it's called a key.
  { kind: "a Solana secret key", re: /\b(?:private[\s_-]?key|secret[\s_-]?key|priv[\s_-]?key|pk|keypair)\b["'`]?\s*(?:is|=|:|-)?\s*["'`]?([1-9A-HJ-NP-Za-km-z]{86,88})\b/gi, group: 1 },
  { kind: "a Solana secret key", re: /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/g },
  { kind: "a NEAR private key", re: /\bed25519:[1-9A-HJ-NP-Za-km-z]{80,90}\b/g },
  { kind: "an Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "an OpenAI API key", re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
  { kind: "a Stripe secret key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g },
  { kind: "a GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g },
  { kind: "an AWS access key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { kind: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "a Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "a Telegram bot token", re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { kind: "a Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g },
  { kind: "a signed token (JWT)", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "an API key in a URL", re: /[?&](?:api[-_]?key|apikey|access[-_]?token|auth[-_]?token|client[-_]?secret|secret)=([A-Za-z0-9_-]{16,})/gi, group: 1 },
  { kind: "a password in a URL", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]{4,})@/gi, group: 1 },
];

/** Every secret-shaped span in the text, longest first where they overlap. */
export function findLeaks(text: string): Leak[] {
  if (!text) return [];
  const out: Leak[] = [];
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      const g = r.group ? m[r.group] : m[0];
      if (!g) continue;
      const start = (m.index ?? 0) + (r.group ? m[0].indexOf(g) : 0);
      out.push({ kind: r.kind, start, end: start + g.length });
    }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  return out.filter((l, i) => !out.slice(0, i).some((o) => o.start <= l.start && o.end >= l.end));
}

/** The text with each secret replaced by a label saying what was there, and the kinds removed. */
export function redactLeaks(text: string): { text: string; removed: string[] } {
  const leaks = findLeaks(text);
  if (!leaks.length) return { text, removed: [] };
  let s = text;
  for (const l of [...leaks].reverse()) s = `${s.slice(0, l.start)}[removed: ${l.kind}]${s.slice(l.end)}`;
  return { text: s, removed: [...new Set(leaks.map((l) => l.kind))] };
}

/** A sentence for the chat when something was taken out. */
export function removedNote(removed: string[]): string {
  return `I took ${removed.join(" and ")} out of your message before it reached the model. It isn't stored or sent anywhere. Never paste keys in chat: add API keys under Keys, where they're sealed.`;
}
