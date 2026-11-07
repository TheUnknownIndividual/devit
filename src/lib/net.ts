/** Only public https endpoints: user-supplied URLs are fetched by our server, so never let them reach internal addresses. */
export function isPublicHttps(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return false;
  return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(url.hostname);
}

const hits = new Map<string, number[]>();

/** The visitor's address as Cloudflare saw it (the tunnel sets cf-connecting-ip). */
export const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

/** Per-visitor hourly cap for routes that spend AI credits. Returns a 429 response once the cap is hit, else null. */
export function overLimit(req: Request, bucket: string, perHour: number): Response | null {
  const ip = clientIp(req);
  const key = `${bucket}:${ip}`, now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= perHour) {
    const wait = Math.ceil((recent[0] + 3_600_000 - now) / 60_000);
    return Response.json({ error: `You've hit the hourly limit. Try again in ${wait} min.` }, { status: 429 });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20_000) for (const [k, v] of hits) if (now - v[v.length - 1] > 3_600_000) hits.delete(k);
  return null;
}
