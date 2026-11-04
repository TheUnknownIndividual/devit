import { inflateSync } from "node:zlib";
import { isPublicHttps } from "./net";

// The brand colour of a token, read from its logo, so the site's accent matches what holders already know.
// No image library: PNG is decoded fully, baseline JPEG only down to each 8x8 block's average colour,
// which is all a dominant colour needs. DexScreener's CDN serves any logo at 64 px on request.

const MAX_BYTES = 2_000_000;

function pngUrl(logo: string): string {
  if (/^https:\/\/cdn\.dexscreener\.com\/cms\/images\//.test(logo)) {
    const u = new URL(logo);
    u.search = "?width=64&height=64&quality=90&format=png";
    return u.toString();
  }
  if (/^https:\/\/dd\.dexscreener\.com\//.test(logo)) {
    const u = new URL(logo);
    u.searchParams.set("size", "sm");
    return u.toString();
  }
  return logo;
}

/** RGBA pixels of a non-interlaced 8-bit PNG, or null for anything else. */
export function decodePng(buf: Buffer): { w: number; h: number; px: Uint8Array } | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let o = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let plte: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString("ascii", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "PLTE") plte = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    o += 12 + len;
  }
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!ch || depth !== 8 || interlace || !w || !h || w * h > 4_000_000) return null;
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * ch;
  if (raw.length < h * (stride + 1)) return null;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4, s = x * ch;
      if (type === 6) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = cur[s + 3]; }
      else if (type === 2) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = 255; }
      else if (type === 0) { out[d] = out[d + 1] = out[d + 2] = cur[s]; out[d + 3] = 255; }
      else if (type === 4) { out[d] = out[d + 1] = out[d + 2] = cur[s]; out[d + 3] = cur[s + 1]; }
      else if (plte) { const k = cur[s]; out[d] = plte[k * 3]; out[d + 1] = plte[k * 3 + 1]; out[d + 2] = plte[k * 3 + 2]; out[d + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    prev.set(cur);
  }
  return { w, h, px: out };
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d) hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/** The most present vivid colour: hue buckets weighted by saturation, ignoring transparent, grey, near-black and near-white pixels. */
export function dominantColor(px: Uint8Array): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let vivid = 0, total = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    total++;
    const [h, s, v] = hsv(px[i], px[i + 1], px[i + 2]);
    if (s < 0.35 || v < 0.3) continue;
    vivid++;
    const k = Math.round(h / 15) % 24;
    const w = s * v;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n += w; e.r += px[i] * w; e.g += px[i + 1] * w; e.b += px[i + 2] * w;
    buckets.set(k, e);
  }
  if (!total || vivid / total < 0.06) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  return best ? hex(best.r / best.n, best.g / best.n, best.b / best.n) : null;
}

/**
 * Baseline JPEG, decoded only to the DC (average) term of every 8x8 block: one RGBA "pixel" per luma block.
 * Progressive and arithmetic-coded files return null.
 */
export function decodeJpegBlocks(buf: Buffer): { w: number; h: number; px: Uint8Array } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const q: number[][] = [];
  const huff: Record<string, Map<number, number>> = {}; // key "c<class>t<id>" → (len<<16|code) → symbol
  let comps: Array<{ id: number; h: number; v: number; tq: number }> = [];
  let w = 0, h = 0, restart = 0, o = 2;
  while (o + 4 <= buf.length) {
    if (buf[o] !== 0xff) return null;
    const m = buf[o + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
    const len = buf.readUInt16BE(o + 2), seg = buf.subarray(o + 4, o + 2 + len);
    if (m === 0xdb) {
      for (let i = 0; i < seg.length;) { const pq = seg[i] >> 4, tq = seg[i] & 15; q[tq] = [pq ? seg.readUInt16BE(i + 1) : seg[i + 1]]; i += 1 + (pq ? 128 : 64); }
    } else if (m === 0xc0 || m === 0xc1) {
      h = seg.readUInt16BE(1); w = seg.readUInt16BE(3);
      comps = Array.from({ length: seg[5] }, (_, i) => ({ id: seg[6 + i * 3], h: seg[7 + i * 3] >> 4, v: seg[7 + i * 3] & 15, tq: seg[8 + i * 3] }));
    } else if (m === 0xc2 || m === 0xc3 || (m >= 0xc5 && m <= 0xcf && m !== 0xc8 && m !== 0xcc)) {
      return null;
    } else if (m === 0xc4) {
      for (let i = 0; i < seg.length;) {
        const tc = seg[i] >> 4, th = seg[i] & 15, counts = seg.subarray(i + 1, i + 17);
        const map = new Map<number, number>();
        let code = 0, k = i + 17;
        for (let l = 1; l <= 16; l++) { for (let n = 0; n < counts[l - 1]; n++) map.set((l << 16) | code++, seg[k++]); code <<= 1; }
        huff[`c${tc}t${th}`] = map;
        i = k;
      }
    } else if (m === 0xdd) {
      restart = seg.readUInt16BE(0);
    } else if (m === 0xda) {
      if (!w || !h || !comps.length || comps.length > 3) return null;
      const ns = seg[0];
      if (ns !== comps.length) return null; // non-interleaved scans: not worth it for a logo
      const tables = Array.from({ length: ns }, (_, i) => ({ dc: huff[`c0t${seg[2 + i * 2] >> 4}`], ac: huff[`c1t${seg[2 + i * 2] & 15}`] }));
      if (tables.some((t) => !t.dc || !t.ac)) return null;
      return dcScan(buf, o + 2 + len, comps, tables, q, w, h, restart);
    }
    o += 2 + len;
  }
  return null;
}

function dcScan(buf: Buffer, start: number, comps: Array<{ h: number; v: number; tq: number }>, tables: Array<{ dc: Map<number, number>; ac: Map<number, number> }>, q: number[][], w: number, h: number, restart: number) {
  let pos = start, bits = 0, nbits = 0, ended = false;
  const byte = () => {
    if (pos >= buf.length) { ended = true; return 0; }
    const b = buf[pos++];
    if (b === 0xff) {
      const n = buf[pos];
      if (n === 0) pos++;
      else { pos--; ended = true; return 0; } // a marker: stop feeding real bits
    }
    return b;
  };
  const bit = () => { if (!nbits) { bits = byte(); nbits = 8; } nbits--; return (bits >> nbits) & 1; };
  const take = (n: number) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
  const decode = (t: Map<number, number>) => { let code = 0; for (let l = 1; l <= 16; l++) { code = (code << 1) | bit(); const s = t.get((l << 16) | code); if (s !== undefined) return s; } return -1; };
  const extend = (v: number, n: number) => (n && v < 1 << (n - 1) ? v - (1 << n) + 1 : v);

  const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
  const mcus = Math.ceil(w / (8 * hmax)) * Math.ceil(h / (8 * vmax));
  if (mcus > 100_000) return null;
  const pred = comps.map(() => 0);
  const px: number[] = [];
  for (let n = 0; n < mcus; n++) {
    if (restart && n && n % restart === 0) {
      nbits = 0;
      while (pos + 1 < buf.length && !(buf[pos] === 0xff && buf[pos + 1] >= 0xd0 && buf[pos + 1] <= 0xd7)) pos++;
      pos += 2;
      ended = false;
      pred.fill(0);
    }
    const avg: number[][] = [];
    for (let c = 0; c < comps.length; c++) {
      const vals: number[] = [];
      for (let b = 0; b < comps[c].h * comps[c].v; b++) {
        const s = decode(tables[c].dc);
        if (s < 0 || ended) return px.length ? finish(px) : null;
        pred[c] += extend(take(s), s);
        for (let k = 1; k < 64;) {
          const rs = decode(tables[c].ac);
          if (rs < 0) return px.length ? finish(px) : null;
          const r = rs >> 4, sz = rs & 15;
          if (!sz) { if (r === 15) { k += 16; continue; } break; }
          k += r;
          take(sz);
          k++;
        }
        vals.push(pred[c] * (q[comps[c].tq]?.[0] ?? 1) / 8 + 128);
      }
      avg.push(vals);
    }
    const cb = comps.length === 3 ? avg[1].reduce((a, b) => a + b, 0) / avg[1].length - 128 : 0;
    const cr = comps.length === 3 ? avg[2].reduce((a, b) => a + b, 0) / avg[2].length - 128 : 0;
    for (const y of avg[0]) {
      const cl = (v: number) => Math.max(0, Math.min(255, v));
      px.push(cl(y + 1.402 * cr), cl(y - 0.344136 * cb - 0.714136 * cr), cl(y + 1.772 * cb), 255);
    }
  }
  return finish(px);
}

function finish(px: number[]) {
  return { w: px.length / 4, h: 1, px: Uint8Array.from(px) };
}

/** The logo's brand colour, or null when it can't be read. Never throws. */
export async function logoAccent(logo: string | null | undefined): Promise<string | null> {
  if (!logo || !isPublicHttps(logo)) return null;
  try {
    // Redirects are followed by hand so each hop gets the same public-host check.
    let url = pngUrl(logo), r: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      if (!isPublicHttps(url)) return null;
      r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "manual", headers: { accept: "image/png,image/*;q=0.8" } });
      const next = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!next) break;
      url = new URL(next, url).toString();
      r = null;
    }
    if (!r?.ok) return null;
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    const img = decodePng(buf) ?? decodeJpegBlocks(buf);
    return img ? dominantColor(img.px) : null;
  } catch {
    return null;
  }
}

/** A page's own <meta name="theme-color">, when it's a real colour and not white/black. */
export function themeColorOf(html: string): string | null {
  const m = html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i)?.[0];
  const c = m?.match(/content=["']\s*(#[0-9a-fA-F]{6})\s*["']/)?.[1];
  if (!c) return null;
  const n = parseInt(c.slice(1), 16);
  const [, s, v] = hsv((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return s >= 0.35 && v >= 0.3 ? c.toUpperCase() : null;
}
