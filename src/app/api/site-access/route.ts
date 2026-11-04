import { NextResponse } from "next/server";
import { findBySlug } from "@/lib/store";
import { ACCESS_DAYS, accessCookie, accessProof, checkPassword, sameSecret } from "@/lib/access";
import { overLimit } from "@/lib/net";

// Opens a private site for this browser. GET: the proxy sends ?k=<key> links here. POST: the password form.
// Both answer with a redirect back to the page, minus the secret, and the site's access cookie.

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const back = (to: string | null, slug: string) => (to && /^\/(?!\/)[^\s\\]*$/.test(to) ? to : `/s/${slug}`);
const go = (to: string, extra = "") => new NextResponse(null, { status: 303, headers: { location: extra ? `${to}${to.includes("?") ? "&" : "?"}${extra}` : to, "cache-control": "no-store" } });

function open(to: string, slug: string, proof: string) {
  const res = go(to);
  res.cookies.set(accessCookie(slug), proof, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: ACCESS_DAYS * 86_400 });
  return res;
}

export async function GET(req: Request) {
  const fwd = req.headers.get("x-sitesmith-access");
  const q = fwd ? new URLSearchParams(fwd) : new URL(req.url).searchParams;
  const slug = q.get("slug") ?? "";
  const k = q.get("k") ?? "";
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex", "cache-control": "no-store" } });
  if (!SLUG.test(slug) || !k || k.length > 100) return notFound();
  const limited = overLimit(req, `site-link:${slug}`, 60);
  if (limited) return notFound();
  const p = await findBySlug(slug);
  const to = back(q.get("to"), slug);
  if (!p) return notFound();
  if (p.access?.mode !== "link") return go(to);
  if (!p.access.key || !sameSecret(k, p.access.key)) return notFound();
  return open(to, slug, accessProof(p)!);
}

export async function POST(req: Request) {
  const f = await req.formData().catch(() => null);
  const slug = String(f?.get("slug") ?? "");
  const pw = String(f?.get("password") ?? "");
  if (!SLUG.test(slug)) return new NextResponse("Not found", { status: 404 });
  const to = back(String(f?.get("to") ?? ""), slug);
  if (overLimit(req, `site-pass:${slug}`, 20)) return go(to, "e=wait");
  const p = await findBySlug(slug);
  if (!p || p.access?.mode !== "password" || !p.access.pass) return go(to);
  if (!pw || pw.length > 200 || !(await checkPassword(pw, p.access.pass))) return go(to, "e=wrong");
  return open(to, slug, accessProof(p)!);
}
