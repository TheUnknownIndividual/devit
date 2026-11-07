// Where published sites live. With SITES_DOMAIN set (e.g. "devit.lol"), each site is served at
// <slug>.<SITES_DOMAIN>, either by the Cloudflare Worker in edge/ or by any wildcard host pointed at this app.
// Without it, sites stay at /s/<slug> on the builder's own origin.

export const RESERVED_SLUGS = new Set(["www", "api", "app", "admin", "build", "preview", "docs", "help", "mail", "edge", "static", "sites"]);

export function sitesDomain(): string | null {
  const d = process.env.SITES_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  return d && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/** Full URL when there's a sites domain, otherwise the path on this origin. */
export function siteUrl(slug: string): string {
  const d = sitesDomain();
  return d ? `https://${slug}.${d}` : `/s/${slug}`;
}

/** The slug a request is for, when its host is <slug>.<SITES_DOMAIN>. */
export function slugFromHost(host: string | null): string | null {
  const d = sitesDomain();
  if (!d || !host) return null;
  const h = host.toLowerCase().split(":")[0];
  if (!h.endsWith(`.${d}`)) return null;
  const sub = h.slice(0, -(d.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(sub) && !RESERVED_SLUGS.has(sub) ? sub : null;
}

// What a published page may call on its own host. Everything else (the builder, project APIs) stays off site hosts.
export const SITE_API = /^\/api\/(token|trades|quote|swap|balance|intents(\/status)?|relay(\/status)?|forms|rpc|assets|site-access)(\/|$)/;
