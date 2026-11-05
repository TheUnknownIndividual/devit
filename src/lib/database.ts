import { appendFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { seal, unseal } from "./secrets";
import type { Project, ProjectDatabase } from "./spec";

// A hosted database for each project, so a site's signup forms work in production without the team running a server:
//  - Neon instant: one click makes a free Postgres on neon.new; the team claims it into their own Neon account
//    (unclaimed ones expire after 72 hours, the form then falls back to local storage until they connect another).
//  - Neon: paste a connection string. Queries go over Neon's HTTP SQL endpoint, so no driver is needed.
//  - Supabase: paste the project URL and the service_role key. Rows go in through PostgREST; the table is made by
//    running our SQL once in their SQL editor (PostgREST can't create tables).
// Until a database is connected, form entries are kept here (data/forms/<id>.jsonl, capped) and moved over on connect.

export const TABLE = "sitesmith_signups";

export interface Signup {
  site: string;
  kind: string;
  email?: string | null;
  wallet?: string | null;
  name?: string | null;
  message?: string | null;
  data?: Record<string, unknown>;
  created_at?: string;
}

type Creds = { cs: string } | { url: string; key: string };

const NEON_COLS = `id bigint generated always as identity primary key,
  site text not null,
  kind text not null default 'signup',
  email text,
  wallet text,
  name text,
  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()`;

/** What the team runs once in Supabase's SQL editor. RLS on with no policies: only the service key can read or write. */
export const SUPABASE_SQL = `create table if not exists public.${TABLE} (
  ${NEON_COLS}
);
create index if not exists ${TABLE}_created on public.${TABLE} (created_at desc);
alter table public.${TABLE} enable row level security;`;

export function supabaseSqlUrl(url: string): string | null {
  const ref = supabaseRef(url);
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new?content=${encodeURIComponent(SUPABASE_SQL)}` : null;
}

// ---------- validating what the team pastes ----------

/** A Neon connection string, or an error. Only *.neon.tech hosts: our server fetches it, so nothing internal. */
export function parseNeon(raw: string): { cs: string; host: string } | { error: string } {
  const cs = raw.trim().replace(/^psql\s+/, "").replace(/^['"]|['"]$/g, "");
  let u: URL;
  try { u = new URL(cs); } catch { return { error: "That isn't a connection string. It starts with postgresql://" }; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return { error: "That isn't a connection string. It starts with postgresql://" };
  if (!/^[a-z0-9.-]+\.neon\.tech$/i.test(u.hostname)) return { error: "Paste a Neon connection string (the host ends in .neon.tech)." };
  if (!u.username || !u.password) return { error: "The connection string needs the user and password in it." };
  return { cs, host: u.hostname };
}

function supabaseRef(url: string): string | null {
  return url.trim().match(/^https:\/\/([a-z0-9]{10,40})\.supabase\.co\/?$/i)?.[1]?.toLowerCase() ?? null;
}

export function parseSupabase(url: string, key: string): { url: string; key: string; host: string } | { error: string } {
  const ref = supabaseRef(url);
  if (!ref) return { error: "Paste the Project URL, like https://abcd1234.supabase.co (Settings → API)." };
  const k = key.trim();
  if (!/^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_secret_[\w-]{20,})$/.test(k)) return { error: "Paste the service_role key (or a secret key starting sb_secret_)." };
  if (k.startsWith("eyJ")) {
    try {
      const role = JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString("utf8")).role;
      if (role !== "service_role") return { error: "That's the anon key. Paste the service_role key: the anon one can't write past row-level security." };
    } catch { return { error: "That key couldn't be read." }; }
  }
  return { url: `https://${ref}.supabase.co`, key: k, host: `${ref}.supabase.co` };
}

// ---------- talking to each provider ----------

async function neonSql(cs: string, query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const host = new URL(cs).hostname;
  const r = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "content-type": "application/json", "Neon-Connection-String": cs },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => null)) as { rows?: Record<string, unknown>[]; message?: string } | null;
  if (!r.ok) throw new Error(j?.message?.slice(0, 200) || `Neon answered ${r.status}`);
  return j?.rows ?? [];
}

function sbHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", ...extra };
}

async function sb(c: { url: string; key: string }, pathAndQuery: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  return fetch(`${c.url}/rest/v1/${pathAndQuery}`, { ...init, headers: sbHeaders(c.key, init.headers), signal: AbortSignal.timeout(10_000) });
}

function creds(db: ProjectDatabase): Creds | null {
  const raw = unseal(db.secret);
  if (!raw) return null;
  try { return JSON.parse(raw) as Creds; } catch { return null; }
}

/** Makes the table if it can. Neon: yes. Supabase: only checks; false means the SQL hasn't been run yet. */
async function ensureTable(c: Creds): Promise<{ ready: boolean; error?: string }> {
  if ("cs" in c) {
    await neonSql(c.cs, `create table if not exists ${TABLE} (${NEON_COLS})`);
    await neonSql(c.cs, `create index if not exists ${TABLE}_created on ${TABLE} (created_at desc)`);
    return { ready: true };
  }
  const r = await sb(c, `${TABLE}?select=id&limit=1`);
  if (r.ok) return { ready: true };
  if (r.status === 401 || r.status === 403) return { ready: false, error: "Supabase refused the key. Paste the service_role key from Settings → API." };
  return { ready: false };
}

async function insertRows(c: Creds, rows: Signup[]): Promise<void> {
  if (!rows.length) return;
  if ("cs" in c) {
    // One statement per call on the HTTP endpoint; batches of 50 rows keep the parameter list small.
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const params: unknown[] = [];
      const values = chunk.map((r) => {
        const at = params.length;
        params.push(r.site, r.kind, r.email ?? null, r.wallet ?? null, r.name ?? null, r.message ?? null, JSON.stringify(r.data ?? {}), r.created_at ?? new Date().toISOString());
        return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6}, $${at + 7}::jsonb, $${at + 8}::timestamptz)`;
      });
      await neonSql(c.cs, `insert into ${TABLE} (site, kind, email, wallet, name, message, data, created_at) values ${values.join(", ")}`, params);
    }
    return;
  }
  const r = await sb(c, TABLE, { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(rows.map((x) => ({ ...x, data: x.data ?? {} }))) });
  if (!r.ok) throw new Error(`Supabase answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function readRows(c: Creds, limit: number): Promise<{ rows: Signup[]; count: number }> {
  if ("cs" in c) {
    const [rows, n] = await Promise.all([
      neonSql(c.cs, `select site, kind, email, wallet, name, message, data, created_at from ${TABLE} order by created_at desc limit $1`, [limit]),
      neonSql(c.cs, `select count(*)::int as n from ${TABLE}`),
    ]);
    return { rows: rows.map(normRow), count: Number(n[0]?.n ?? 0) };
  }
  const r = await sb(c, `${TABLE}?select=site,kind,email,wallet,name,message,data,created_at&order=created_at.desc&limit=${limit}`, { headers: { prefer: "count=exact" } });
  if (!r.ok) throw new Error(`Supabase answered ${r.status}`);
  const count = Number(r.headers.get("content-range")?.split("/")[1] ?? NaN);
  const rows = ((await r.json()) as Record<string, unknown>[]).map(normRow);
  return { rows, count: Number.isFinite(count) ? count : rows.length };
}

function normRow(r: Record<string, unknown>): Signup {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    site: str(r.site) ?? "", kind: str(r.kind) ?? "signup", email: str(r.email), wallet: str(r.wallet), name: str(r.name), message: str(r.message),
    data: r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {},
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at) ?? undefined,
  };
}

// ---------- local holding file ----------

const FORMS = path.join(process.cwd(), "data", "forms");
const LOCAL_CAP = 2_000_000; // bytes per project; past this new entries are refused until a database is connected
const localFile = (id: string) => {
  if (!/^[a-z0-9]{6,24}$/.test(id)) throw new Error("bad project id");
  return path.join(FORMS, `${id}.jsonl`);
};

async function localRows(id: string): Promise<Signup[]> {
  const txt = await readFile(localFile(id), "utf8").catch(() => "");
  return txt.split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as Signup]; } catch { return []; } });
}

async function localAppend(id: string, row: Signup): Promise<boolean> {
  await mkdir(FORMS, { recursive: true });
  const size = await stat(localFile(id)).then((s) => s.size).catch(() => 0);
  if (size > LOCAL_CAP) return false;
  await appendFile(localFile(id), `${JSON.stringify(row)}\n`, { mode: 0o600 });
  return true;
}

// ---------- what routes call ----------

/** Creates a free Neon database on neon.new. It is the team's once they open the claim link. */
export async function createInstantNeon(): Promise<{ db: ProjectDatabase } | { error: string }> {
  const r = await fetch("https://neon.new/api/v1/database", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: "sitesmith" }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { connection_string?: string; claim_url?: string; expires_at?: string } | null;
  if (!r?.ok || !j?.connection_string) return { error: "Neon couldn't make a database just now. Try again in a minute, or paste your own." };
  const n = parseNeon(j.connection_string);
  if ("error" in n) return { error: "Neon sent back a connection string we couldn't read." };
  return connect({ cs: n.cs }, "neon", n.host, { claimUrl: j.claim_url, expiresAt: j.expires_at ? Date.parse(j.expires_at) : undefined });
}

/** Checks the credentials, makes the table where it can, and seals them for the project file. */
export async function connect(c: Creds, provider: ProjectDatabase["provider"], host: string, extra: Pick<ProjectDatabase, "claimUrl" | "expiresAt"> = {}): Promise<{ db: ProjectDatabase } | { error: string }> {
  try {
    const t = await ensureTable(c);
    if (t.error) return { error: t.error };
    return { db: { provider, host, secret: seal(JSON.stringify(c)), ready: t.ready, at: Date.now(), ...extra } };
  } catch (e) {
    return { error: `Couldn't reach the database: ${(e as Error).message}` };
  }
}

/** Re-checks a Supabase table after the team ran the SQL, and moves held entries over once it's there. */
export async function recheck(p: Project): Promise<ProjectDatabase | null> {
  const db = p.database;
  const c = db && creds(db);
  if (!db || !c) return null;
  const t = await ensureTable(c).catch(() => ({ ready: false }));
  if (t.ready) await flushLocal(p.id, c);
  return { ...db, ready: t.ready };
}

/** Moves entries held locally into the database, then drops the file. */
export async function flushLocal(id: string, c?: Creds | null, db?: ProjectDatabase): Promise<number> {
  const cc = c ?? (db ? creds(db) : null);
  if (!cc) return 0;
  const rows = await localRows(id);
  if (!rows.length) return 0;
  await insertRows(cc, rows);
  await rm(localFile(id), { force: true });
  return rows.length;
}

export async function flushFor(p: Project): Promise<number> {
  return p.database?.ready ? flushLocal(p.id, null, p.database).catch(() => 0) : 0;
}

/** Saves one form entry: into the database when it's ready, else into the local holding file. */
export async function saveSignup(p: Project, entry: Signup): Promise<"db" | "held" | "full"> {
  const row = { ...entry, created_at: entry.created_at ?? new Date().toISOString() };
  const db = p.database;
  const c = db?.ready ? creds(db) : null;
  if (c && !(db?.expiresAt && db.expiresAt < Date.now() && db.claimUrl)) {
    try { await insertRows(c, [row]); return "db"; } catch (e) { console.warn(`[forms] ${p.id} database write failed, holding locally: ${(e as Error).message}`); }
  }
  return (await localAppend(p.id, row)) ? "held" : "full";
}

/** The builder's view: latest rows and the count, from the database and the holding file. */
export async function readSignups(p: Project, limit = 50): Promise<{ rows: Signup[]; count: number; held: number; error?: string }> {
  const held = await localRows(p.id);
  const db = p.database;
  const c = db?.ready ? creds(db) : null;
  if (!c) return { rows: held.slice(-limit).reverse(), count: held.length, held: held.length };
  try {
    const r = await readRows(c, limit);
    return { rows: [...held.slice().reverse(), ...r.rows].slice(0, limit), count: r.count + held.length, held: held.length };
  } catch (e) {
    return { rows: held.slice(-limit).reverse(), count: held.length, held: held.length, error: (e as Error).message };
  }
}

/** Removes the local holding file for a project (when the project is deleted). */
export async function dropLocal(id: string): Promise<void> {
  await rm(localFile(id), { force: true }).catch(() => {});
}

/** What the builder may see of the connection: never the sealed credentials. */
export function databaseView(db: ProjectDatabase | undefined) {
  if (!db) return null;
  const expired = !!(db.claimUrl && db.expiresAt && db.expiresAt < Date.now());
  return { provider: db.provider, host: db.host, ready: db.ready && !expired, instant: !!db.claimUrl, expiresAt: db.expiresAt ?? null, expired, at: db.at };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows: Signup[]): string {
  const cols: Array<keyof Signup> = ["created_at", "kind", "email", "wallet", "name", "message", "site"];
  return [cols.join(","), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(","))].join("\n");
}
