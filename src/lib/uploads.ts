import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Pictures a team adds in the chat (a logo, a hero image). Only raster images are taken, told apart by their first
// bytes rather than by the name or type the browser claims; SVG is refused because it can carry script. The browser
// shrinks and re-encodes before sending, so the cap is small. Files sit next to the projects, never in a database.

const DIR = path.join(process.cwd(), "data", "uploads");
export const MAX_BYTES = 512 * 1024;
export const MAX_PER_PROJECT = 24;

export const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;
export type Ext = keyof typeof TYPES;

/** The image kind from its first bytes, or null when it isn't one of the four. */
export function sniff(b: Uint8Array): Ext | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  return null;
}

export const FILE_RE = /^[a-z0-9]{8,24}\.(png|jpg|webp|gif)$/;
const PROJECT_RE = /^[a-z0-9]{6,24}$/;

function where(project: string, file: string): string {
  if (!PROJECT_RE.test(project) || !FILE_RE.test(file)) throw new Error("bad upload path");
  return path.join(DIR, project, file);
}

export async function saveUpload(project: string, file: string, bytes: Uint8Array): Promise<void> {
  const p = where(project, file);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, bytes);
}

export async function readUpload(project: string, file: string): Promise<Buffer | null> {
  try { return await readFile(where(project, file)); } catch { return null; }
}
