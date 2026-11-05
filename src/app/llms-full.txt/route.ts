import { siteForHost } from "@/lib/host-site";
import { builderLlmsTxt, siteLlmsTxt } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await siteForHost(req);
  const body = s.kind === "builder" ? builderLlmsTxt(true) : s.kind === "site" ? siteLlmsTxt(s.spec, s.url) : null;
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=900" } });
}
