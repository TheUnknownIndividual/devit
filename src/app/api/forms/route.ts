import { NextResponse } from "next/server";
import { z } from "zod";
import { findBySlug } from "@/lib/store";
import { siteForHost } from "@/lib/host-site";
import { siteGate } from "@/lib/site-access";
import { overLimit } from "@/lib/net";
import { saveSignup } from "@/lib/database";
import type { Project } from "@/lib/spec";

// A published site's signup form posts here. The site comes from the host (a subdomain or custom domain), or from
// the slug on /s/<slug>. Only sites whose published page has a signup block take entries.

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
// NEAR accounts, 0x addresses, Solana base58: no spaces or markup.
const WALLET = /^[A-Za-z0-9._:-]{2,100}$/;

const Body = z.object({
  slug: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  wallet: z.string().max(120).optional(),
  name: z.string().max(80).optional(),
  message: z.string().max(1000).optional(),
  kind: z.string().max(30).optional(),
  // Honeypot: a hidden field people never fill.
  website: z.string().max(200).optional(),
});

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Check the form and try again.");
  const b = parsed.data;

  let p: Project | null = null;
  const h = await siteForHost(req);
  if (h.kind === "site") p = h.p;
  else if (h.kind === "builder" && b.slug && SLUG.test(b.slug)) {
    const q = await findBySlug(b.slug);
    if (q?.published && (await siteGate(q, b.slug)) === "open") p = q;
  } else if (h.kind === "private" && (await siteGate(h.p, h.slug)) === "open") p = h.p;
  if (!p) return fail("This form isn't taking entries.", 404);
  const spec = p.publishedSpec ?? p.spec;
  const block = spec?.blocks.find((x) => x.type === "signup");
  if (!block) return fail("This form isn't taking entries.", 404);

  const limited = overLimit(req, `form:${p.id}`, 6);
  if (limited) return fail("Too many tries. Try again in a bit.", 429);
  if (b.website) return NextResponse.json({ ok: true });

  const email = b.email?.trim().toLowerCase() || null;
  const wallet = b.wallet?.trim() || null;
  if (email && !EMAIL.test(email)) return fail("That email doesn't look right.");
  if (wallet && !WALLET.test(wallet)) return fail("That wallet address doesn't look right.");
  if (!email && !wallet) return fail("Add your email or wallet.");
  const clean = (v?: string) => v?.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || null;
  const kind = typeof block.props.kind === "string" && /^[a-z-]{2,20}$/.test(block.props.kind) ? block.props.kind : "signup";

  const r = await saveSignup(p, { site: p.published?.slug ?? p.slug, kind, email, wallet, name: clean(b.name), message: clean(b.message), data: {} });
  if (r === "full") return fail("The list is full for now. Try again later.", 503);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
