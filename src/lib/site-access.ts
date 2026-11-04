import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { viewer, type Viewer } from "./accounts";
import { accessTo, canEdit } from "./access";
import { sha256, token } from "./secrets";
import type { Project } from "./spec";

// Private sites (Pro). A private link carries ?k=<key> once; a password is typed once. Either way the visitor gets a
// per-site cookie whose value is derived from the current key or password hash, so rotating either signs everyone out.
// The owner, signed in on the builder, always gets through.

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };
export const ACCESS_DAYS = 30;

export const accessCookie = (slug: string) => `ss_s_${slug}`;
export const newAccessKey = () => token(18);
export const isPrivateSite = (p: Pick<Project, "access">) => !!p.access && p.access.mode !== "public";
export const visibility = (p: Pick<Project, "access">) => p.access?.mode ?? "public";

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `s1$${salt.toString("base64url")}$${(await scryptAsync(pw, salt, 32, SCRYPT)).toString("base64url")}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scryptAsync(pw, Buffer.from(salt, "base64url"), want.length, SCRYPT);
  return timingSafeEqual(got, want);
}

export const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
};

/** The cookie value that opens this site right now. */
export function accessProof(p: Pick<Project, "id" | "access">): string | null {
  const a = p.access;
  const secret = a?.mode === "link" ? a.key : a?.mode === "password" ? a.pass : null;
  return secret ? sha256(`${p.id}:${a!.mode}:${secret}`) : null;
}

/** "open", or what stands between this visitor and the site. */
export async function siteGate(p: Project, slug: string, v?: Viewer): Promise<"open" | "link" | "password"> {
  if (!isPrivateSite(p)) return "open";
  if (await canEdit(p, v ?? (await viewer()))) return "open";
  const proof = accessProof(p);
  const c = (await cookies()).get(accessCookie(slug))?.value;
  if (proof && c && sameSecret(c, proof)) return "open";
  return p.access!.mode as "link" | "password";
}

/** Builder pages (/build, /preview, /live, the project API) of a private project are for its owner and team only. */
export async function canRead(p: Project, v?: Viewer): Promise<boolean> {
  return !isPrivateSite(p) || !!(await accessTo(p, v ?? (await viewer())));
}
