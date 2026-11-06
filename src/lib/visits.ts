import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Page views of published sites, per project per UTC day, with the top referrer hosts and a rough count of unique
// visitors. No cookies, and no IP address is ever written: a visitor is a hash of IP + user agent + day + a secret
// made fresh in memory when the server starts, and those hashes live only in memory for the day they belong to.
// Counts build up in memory and go to data/visits/<projectId>.json every 30 s and on shutdown; 90 days are kept.

const DIR = path.join(process.cwd(), "data", "visits");
const KEEP_DAYS = 90;
const FLUSH_MS = 30_000;
/** Distinct referrer hosts kept per day; past this the rest count as "other". */
const MAX_REFS = 100;
/** Unique-visitor hashes held for today across all sites; past this, uniques stop counting until tomorrow. */
const MAX_SEEN = 200_000;

/** Crawlers, link previews, monitors and scripts. Rough on purpose: a few slip through, people aren't dropped. */
const BOT = /bot|crawl|spider|slurp|scrap|preview|fetch|curl|wget|python|httpx|axios|okhttp|go-http|java\/|ruby|perl|php|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|facebookexternalhit|embedly|quora|whatsapp|skypeuri|bingpreview|vkshare|w3c_validator|ia_archiver|archive\.org/i;

export interface DayRow { views: number; uniques: number; refs: Record<string, number> }
interface VisitFile { days: Record<string, DayRow> }

interface State {
  secret: Buffer;
  /** Counts not yet on disk: project → day → row. */
  pending: Map<string, Map<string, DayRow>>;
  /** Today's visitor hashes (project:hash), never written anywhere. */
  seen: { day: string; set: Set<string> };
  timer: ReturnType<typeof setInterval> | null;
  flushing: Promise<void> | null;
  hooked: boolean;
}
const g = globalThis as typeof globalThis & { __ssVisits?: State };
const s: State = (g.__ssVisits ??= { secret: randomBytes(32), pending: new Map(), seen: { day: "", set: new Set() }, timer: null, flushing: null, hooked: false });

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const okId = (id: string) => /^[a-z0-9]{6,24}$/.test(id);
const file = (id: string) => path.join(DIR, `${id}.json`);
const row = (): DayRow => ({ views: 0, uniques: 0, refs: {} });

export const isBot = (ua: string | null) => !ua || ua.length < 10 || BOT.test(ua);

/** The referrer as a bare host, or null for direct visits and the site's own pages. */
function refHost(referer: string | null, self: string | null): string | null {
  if (!referer) return null;
  try {
    const h = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    return h && h !== self?.replace(/^www\./, "") ? h.slice(0, 80) : null;
  } catch {
    return null;
  }
}

function addRef(r: DayRow, host: string, n = 1) {
  if (r.refs[host] == null && Object.keys(r.refs).length >= MAX_REFS) host = "other";
  r.refs[host] = (r.refs[host] ?? 0) + n;
}

/** Counts one page view. Call it where the published page renders; it never throws and never waits on disk. */
export function recordVisit(v: { projectId: string; ip: string | null; ua: string | null; referer: string | null; host: string | null }): void {
  try {
    if (!okId(v.projectId) || isBot(v.ua)) return;
    const day = utcDay();
    if (s.seen.day !== day) s.seen = { day, set: new Set() };
    const who = `${v.projectId}:${createHash("sha256").update(s.secret).update(`${v.ip ?? ""}|${v.ua ?? ""}|${day}`).digest("base64url").slice(0, 16)}`;
    let fresh = false;
    if (!s.seen.set.has(who) && s.seen.set.size < MAX_SEEN) { s.seen.set.add(who); fresh = true; }
    let days = s.pending.get(v.projectId);
    if (!days) s.pending.set(v.projectId, (days = new Map()));
    let r = days.get(day);
    if (!r) days.set(day, (r = row()));
    r.views++;
    if (fresh) r.uniques++;
    const ref = refHost(v.referer, v.host);
    if (ref) addRef(r, ref);
    start();
  } catch { /* counting must never break the page */ }
}

function start() {
  if (!s.timer) {
    s.timer = setInterval(() => void flushVisits(), FLUSH_MS);
    s.timer.unref?.();
  }
  if (s.hooked) return;
  s.hooked = true;
  // On the way down, write what's buffered synchronously (async work doesn't finish once exit starts).
  process.on("exit", flushSync);
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      flushSync();
      // Nobody else listening: do what the signal would have done without us.
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
    });
  }
}

function addRow(into: DayRow, add: DayRow) {
  into.views += add.views;
  into.uniques += add.uniques;
  for (const [h, n] of Object.entries(add.refs)) addRef(into, h, n);
}

function merge(f: VisitFile, days: Map<string, DayRow>): VisitFile {
  for (const [d, add] of days) addRow((f.days[d] ??= row()), add);
  const oldest = utcDay(Date.now() - (KEEP_DAYS - 1) * 86_400_000);
  for (const d of Object.keys(f.days)) if (d < oldest) delete f.days[d];
  return f;
}

const parse = (raw: string): VisitFile => {
  const j = JSON.parse(raw) as Partial<VisitFile>;
  return { days: j && typeof j.days === "object" && j.days ? j.days : {} };
};

async function load(id: string): Promise<VisitFile> {
  try { return parse(await readFile(file(id), "utf8")); } catch { return { days: {} }; }
}

/** Writes buffered counts to disk, one project file at a time (tmp file + rename, like the project store). */
export function flushVisits(): Promise<void> {
  if (s.flushing) return s.flushing;
  s.flushing = (async () => {
    const batch = s.pending;
    s.pending = new Map();
    if (!batch.size) return;
    await mkdir(DIR, { recursive: true });
    for (const [id, days] of batch) {
      try {
        const f = merge(await load(id), days);
        const tmp = `${file(id)}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(f));
        await rename(tmp, file(id));
      } catch {
        // Put it back for the next round rather than lose it.
        const back = s.pending.get(id) ?? new Map<string, DayRow>();
        for (const [d, r] of days) { if (!back.has(d)) back.set(d, row()); addRow(back.get(d)!, r); }
        s.pending.set(id, back);
      }
    }
  })().finally(() => { s.flushing = null; });
  return s.flushing;
}

function flushSync() {
  const batch = s.pending;
  s.pending = new Map();
  if (!batch.size) return;
  try { mkdirSync(DIR, { recursive: true }); } catch { return; }
  for (const [id, days] of batch) {
    try {
      let f: VisitFile = { days: {} };
      try { f = parse(readFileSync(file(id), "utf8")); } catch { /* first write */ }
      const tmp = `${file(id)}.${process.pid}.exit.tmp`;
      writeFileSync(tmp, JSON.stringify(merge(f, days)));
      renameSync(tmp, file(id));
    } catch { /* shutting down; nothing more to do */ }
  }
}

export interface VisitSummary { days: Array<{ d: string; views: number; uniques: number }>; referrers: Array<{ host: string; n: number }>; total: number; uniques: number }

/** The last `n` UTC days for a project (oldest first, empty days as zeros), counts on disk plus those still buffered. */
export async function visitSummary(projectId: string, n = 30): Promise<VisitSummary> {
  const days = Math.max(1, Math.min(KEEP_DAYS, Math.floor(n)));
  const f = okId(projectId) ? await load(projectId) : { days: {} };
  const pending = s.pending.get(projectId);
  if (pending) merge(f, pending);
  const out: VisitSummary["days"] = [];
  const refs: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = utcDay(Date.now() - i * 86_400_000);
    const r = f.days[d];
    out.push({ d, views: r?.views ?? 0, uniques: r?.uniques ?? 0 });
    for (const [h, c] of Object.entries(r?.refs ?? {})) refs[h] = (refs[h] ?? 0) + c;
  }
  const referrers = Object.entries(refs).map(([host, c]) => ({ host, n: c })).sort((a, b) => b.n - a.n).slice(0, 10);
  return { days: out, referrers, total: out.reduce((a, x) => a + x.views, 0), uniques: out.reduce((a, x) => a + x.uniques, 0) };
}
