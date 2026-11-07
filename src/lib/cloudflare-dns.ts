import { txtName } from "./domains";

// "Set it up for me" for a domain whose DNS is on Cloudflare: the team pastes an API token with Zone → DNS → Edit and we
// write the records the Custom domain section lists. The token is used for this one request: never stored, never logged.

const API = "https://api.cloudflare.com/client/v4";
type Cf<T> = { ok: true; result: T } | { ok: false; status: number; error: string };
type Rec = { id: string; type: string; name: string; content: string };

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<Cf<T>> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, error: "Couldn't reach Cloudflare." };
  const j = (await r.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] } | null;
  if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, error: "Cloudflare refused that token. It needs Zone → DNS → Edit for this domain." };
  if (!r.ok || !j?.success) return { ok: false, status: r.status, error: j?.errors?.[0]?.message ?? `Cloudflare answered ${r.status}.` };
  return { ok: true, result: j.result as T };
}

/** The Cloudflare zone that holds the host (the host itself or a parent) on the token's account. */
export async function cfZoneFor(token: string, host: string): Promise<{ id: string; name: string } | { error: string }> {
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join(".");
    const r = await call<Array<{ id: string; name: string; status: string }>>(token, "GET", `/zones?name=${encodeURIComponent(name)}`);
    if (!r.ok) return { error: r.error };
    const z = r.result.find((x) => x.name === name);
    if (z) return { id: z.id, name: z.name };
  }
  return { error: `${host} isn't on the Cloudflare account that token belongs to.` };
}

/**
 * Writes the ownership TXT (and Cloudflare's certificate TXT when there is one), then points the host at the target
 * with a DNS-only CNAME (a root CNAME is flattened by Cloudflare). A/AAAA/CNAME records already on the host are
 * replaced, since the domain can only point one way; the answer says which ones went.
 */
export async function cfPoint(token: string, zoneId: string, host: string, verify: string, target: string, cfTxt?: { name: string; value: string }): Promise<{ replaced: string[] } | { error: string }> {
  const list = async (name: string) => {
    const r = await call<Rec[]>(token, "GET", `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=50`);
    return r.ok ? r.result : { error: r.error };
  };
  const txt = async (name: string, value: string) => {
    const have = await list(name);
    if ("error" in have) return have.error;
    if (have.some((x) => x.type === "TXT" && x.content.replace(/^"|"$/g, "") === value)) return null;
    const r = await call<Rec>(token, "POST", `/zones/${zoneId}/dns_records`, { type: "TXT", name, content: `"${value}"`, ttl: 300, comment: "devit" });
    return r.ok ? null : r.error;
  };

  const e1 = await txt(txtName(host), verify);
  if (e1) return { error: e1 };
  if (cfTxt) { const e2 = await txt(cfTxt.name, cfTxt.value); if (e2) return { error: e2 }; }

  const have = await list(host);
  if ("error" in have) return have;
  const pointing = have.filter((x) => ["A", "AAAA", "CNAME"].includes(x.type));
  const same = pointing.find((x) => x.type === "CNAME" && x.content.toLowerCase() === target);
  const replaced: string[] = [];
  if (!same) {
    const keep = pointing.find((x) => x.type === "CNAME");
    for (const x of pointing) {
      if (x === keep) continue;
      const d = await call<unknown>(token, "DELETE", `/zones/${zoneId}/dns_records/${x.id}`);
      if (!d.ok) return { error: d.error };
      replaced.push(`${x.type} ${x.content}`);
    }
    const body = { type: "CNAME", name: host, content: target, proxied: false, ttl: 300, comment: "devit" };
    const w = keep ? await call<Rec>(token, "PUT", `/zones/${zoneId}/dns_records/${keep.id}`, body) : await call<Rec>(token, "POST", `/zones/${zoneId}/dns_records`, body);
    if (!w.ok) return { error: w.error };
    if (keep) replaced.push(`CNAME ${keep.content}`);
  }
  return { replaced };
}
