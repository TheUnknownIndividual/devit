import { siteForHost } from "@/lib/host-site";
import { appOrigin } from "@/lib/seo";
import { sitesDomain } from "@/lib/sites";

// robots.txt for every host we answer: the builder (devit.lol) and each published site. Search engines and AI
// assistants are welcome everywhere public; private sites and the builder's own app pages are off limits.
export const dynamic = "force-dynamic";

// Named so each one reads an explicit welcome (a crawler obeys only the most specific group that names it).
const AI_AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "GoogleOther", "Applebot", "Applebot-Extended", "Bingbot",
  "DuckAssistBot", "Amazonbot", "meta-externalagent", "CCBot", "cohere-ai", "MistralAI-User", "YouBot", "Bytespider",
];

// /s/<slug> is a duplicate of <slug>.<SITES_DOMAIN> once sites have their own hosts.
const builderOff = () => ["/api/", "/build/", "/preview/", "/live/", "/settings", "/projects", "/invite/", ...(sitesDomain() ? ["/s/"] : [])];

function txt(body: string) {
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function groups(disallow: string[], sitemap: string) {
  const rules = ["Allow: /", ...disallow.map((d) => `Disallow: ${d}`)].join("\n");
  const signal = "Content-Signal: search=yes, ai-input=yes, ai-train=yes";
  return [
    `User-agent: *\n${signal}\n${rules}`,
    ...AI_AGENTS.map((a) => `User-agent: ${a}\n${rules}`),
    `Sitemap: ${sitemap}`,
  ].join("\n\n") + "\n";
}

export async function GET(req: Request) {
  const s = await siteForHost(req);
  if (s.kind === "builder") return txt(groups(builderOff(), `${appOrigin()}/sitemap.xml`));
  if (s.kind === "site") return txt(groups(["/api/"], `${s.url}/sitemap.xml`));
  return txt("User-agent: *\nDisallow: /\n");
}
