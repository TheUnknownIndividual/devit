// What the chat does with a file before it leaves the browser. Pictures are shrunk to 1600 px on the long side and
// re-encoded as WebP until they fit 400 KB, which also drops anything riding along in the file (metadata, trailing
// bytes). A small GIF goes as it is so it keeps moving. Text files are read here and sent as plain text.

const LIMIT = 400 * 1024;
const GIF_LIMIT = 512 * 1024;
const MAX_SIDE = 1600;
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;

export interface Doc { name: string; text: string }

export async function prepareImage(f: File): Promise<{ blob: Blob; w: number; h: number } | { error: string }> {
  if (!IMAGE.test(f.type)) return { error: `${f.name}: only PNG, JPEG, WebP or GIF pictures.` };
  if (f.size > 25 * 1024 * 1024) return { error: `${f.name} is over 25 MB.` };
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(f); } catch { return { error: `${f.name} isn't a picture this browser can open.` }; }
  const { width, height } = bmp;
  if (f.type === "image/gif" && f.size <= GIF_LIMIT) { bmp.close(); return { blob: f, w: width, h: height }; }
  let scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  for (let tries = 0; tries < 6; tries++) {
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.86, 0.74, 0.6]) {
      const blob = await c.convertToBlob({ type: "image/webp", quality: q });
      if (blob.size <= LIMIT) { bmp.close(); return { blob, w, h }; }
    }
    scale *= 0.75;
  }
  bmp.close();
  return { error: `${f.name} wouldn't shrink under 400 KB.` };
}

export async function readDoc(f: File): Promise<Doc | { error: string }> {
  if (f.size > 64 * 1024) return { error: `${f.name} is over 64 KB; paste the part that matters.` };
  const text = (await f.text()).replace(/\u0000/g, "").slice(0, 6000);
  return { name: f.name.slice(0, 80), text };
}
