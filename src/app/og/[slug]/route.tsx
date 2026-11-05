import { ImageResponse } from "next/og";
import { findBySlug } from "@/lib/store";
import { isPrivateSite } from "@/lib/site-access";
import { CHAINS } from "@/lib/spec";
import { siteLogo } from "@/lib/seo";

// A published site's share image: its name, ticker, tagline and logo in its own colours.
export const dynamic = "force-dynamic";

async function dataUrl(src: string | null): Promise<string | null> {
  if (!src) return null;
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(4000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(png|jpeg|jpg|gif|webp)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 3_000_000 ? null : `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const hex = (c: string, fb: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : fb);

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await findBySlug(slug);
  const spec = p?.publishedSpec ?? p?.spec;
  if (!p || !spec || isPrivateSite(p)) return new Response("Not found", { status: 404 });
  const t = spec.theme;
  const bg = hex(t.bg, "#0b0b0f"), text = hex(t.text, "#ffffff"), muted = hex(t.muted, "#a1a1aa"), accent = hex(t.accent, "#C6F24E"), accentText = hex(t.accentText, "#000000");
  const logo = await dataUrl(siteLogo(spec));
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: bg, color: text, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {logo ? <img src={logo} width={128} height={128} style={{ borderRadius: 32, objectFit: "cover" }} alt="" /> : <div style={{ width: 128, height: 128, borderRadius: 32, background: accent, color: accentText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 800 }}>{spec.ticker.slice(0, 2)}</div>}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{spec.name.slice(0, 28)}</div>
            <div style={{ display: "flex", fontSize: 34, color: accent, marginTop: 10, fontWeight: 700 }}>${spec.ticker.slice(0, 14)}</div>
          </div>
        </div>
        <div style={{ fontSize: 40, lineHeight: 1.3, color: text, maxWidth: 1000 }}>{spec.tagline.slice(0, 140)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: muted }}>
          <div style={{ display: "flex", padding: "10px 18px", borderRadius: 14, background: accent, color: accentText, fontWeight: 700 }}>Buy ${spec.ticker.slice(0, 14)} on {CHAINS[spec.chain].name}</div>
          <div style={{ display: "flex" }}>Live price · chart · buy from any chain</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  img.headers.set("cache-control", "public, max-age=3600");
  return img;
}
