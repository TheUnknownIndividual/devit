import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { TYPES, type Ext } from "./uploads";

// Uploaded account pictures: data/accounts/avatars/<userId>.<ext>, one per account.

const DIR = path.join(process.cwd(), "data", "accounts", "avatars");
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export async function dropAvatar(id: string): Promise<void> {
  if (!ID_RE.test(id)) return;
  const files = await readdir(DIR).catch(() => [] as string[]);
  await Promise.all(files.filter((f) => f.startsWith(`${id}.`)).map((f) => rm(path.join(DIR, f), { force: true })));
}

export async function saveAvatar(id: string, ext: Ext, bytes: Uint8Array): Promise<void> {
  if (!ID_RE.test(id)) throw new Error("bad id");
  await mkdir(DIR, { recursive: true });
  await dropAvatar(id);
  await writeFile(path.join(DIR, `${id}.${ext}`), bytes, { mode: 0o600 });
}

export async function readAvatar(id: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!ID_RE.test(id)) return null;
  for (const ext of Object.keys(TYPES) as Ext[]) {
    const b = await readFile(path.join(DIR, `${id}.${ext}`)).catch(() => null);
    if (b) return { bytes: b, type: TYPES[ext] };
  }
  return null;
}
