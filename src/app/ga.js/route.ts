import { siteForHost } from "@/lib/host-site";

// Google Analytics for the builder only (published sites belong to their teams). Served as a script so the
// measurement id is read at run time, not baked in at build time.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = (process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID || "").trim();
  const ok = /^G-[A-Z0-9]{4,16}$/.test(id) && (await siteForHost(req)).kind === "builder";
  const js = ok
    ? `(function(){if(location.pathname.indexOf("/s/")===0)return;var id=${JSON.stringify(id)};var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+id;document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());gtag("config",id,{anonymize_ip:true});})();\n`
    : "/* analytics off */\n";
  return new Response(js, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=600" } });
}
