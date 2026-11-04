import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { completeMethod, publicUser, putChallenge, siteOrigin, sweepChallenges, takeChallenge } from "@/lib/accounts";
import { token } from "@/lib/secrets";
import { overLimit } from "@/lib/net";
import { DEFAULT_RPC } from "@/lib/chain";
import { signInMessage, validAddress, verifyEvm, verifyNear, verifySolana } from "@/lib/walletauth";

// Wallet sign-in in two steps: ask for the text to sign (bound to this address, a fresh nonce and 10 minutes),
// then send back the signature. The server only trusts the text it stored, never one the browser sends.

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("challenge"), kind: z.enum(["solana", "evm", "near"]), address: z.string().trim().max(80) }),
  z.object({ step: z.literal("verify"), id: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/), signature: z.string().max(400), publicKey: z.string().max(120).optional() }),
]);

interface Pending { kind: "solana" | "evm" | "near"; address: string; message: string; nonce: string; recipient: string }

const short = (a: string) => (a.length > 18 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const NAMES = { solana: "Solana", evm: "Ethereum", near: "NEAR" } as const;

export async function POST(req: Request) {
  const limited = overLimit(req, "wallet", 60);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;
  void sweepChallenges();

  if (b.step === "challenge") {
    const site = siteOrigin(req);
    if (!site) return NextResponse.json({ error: "Sign in from the site itself." }, { status: 400 });
    if (!validAddress(b.kind, b.address)) return NextResponse.json({ error: "That address doesn't look right." }, { status: 400 });
    const address = b.kind === "evm" ? b.address.toLowerCase() : b.address;
    const id = token(16);
    const now = new Date();
    // NEP-413 wants 32 random bytes; SIWE/SIWS want an alphanumeric nonce of 8+.
    const nonce = b.kind === "near" ? randomBytes(32).toString("base64") : token(12).replace(/[^A-Za-z0-9]/g, "a");
    const message = signInMessage(b.kind, { domain: site.host, uri: site.origin, address, nonce, issuedAt: now.toISOString(), expiresAt: new Date(+now + 10 * 60_000).toISOString() });
    const pending: Pending = { kind: b.kind, address, message, nonce, recipient: site.host };
    await putChallenge(`w-${id}`, pending, 10 * 60_000);
    return NextResponse.json({ id, message, nonce, recipient: site.host });
  }

  const c = await takeChallenge<Pending>(`w-${b.id}`);
  if (!c) return NextResponse.json({ error: "That took too long. Try again." }, { status: 400 });
  const ok = c.kind === "evm" ? verifyEvm(c.message, c.address, b.signature)
    : c.kind === "solana" ? verifySolana(c.message, c.address, b.signature)
    : !!b.publicKey && (await verifyNear({ message: c.message, nonce: Buffer.from(c.nonce, "base64"), recipient: c.recipient, accountId: c.address, publicKey: b.publicKey, signature: b.signature }, DEFAULT_RPC.near));
  if (!ok) return NextResponse.json({ error: "The signature didn't match that wallet." }, { status: 401 });
  const out = await completeMethod({ kind: c.kind, id: c.address, label: `${NAMES[c.kind]} ${short(c.address)}`, at: Date.now() });
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ user: publicUser(out.user), linked: out.linked });
}
