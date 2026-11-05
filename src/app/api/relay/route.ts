import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CHAIN_IDS } from "@/lib/spec";
import { overLimit } from "@/lib/net";
import { RELAY_DEST, RELAY_PAY, relayQuote } from "@/lib/relay";

// Relay quotes for generated sites' "Any chain" buy: without `user` a preview of what arrives; with `user` and
// `recipient` the wallet transactions to sign. The buyer's wallet sends them; this server never holds funds.

const Body = z.object({
  pay: z.enum(RELAY_PAY.map((p) => p.key) as [string, ...string[]]),
  amount: z.number().positive().max(1e7),
  chain: z.enum(CHAIN_IDS),
  token: z.string().min(1).max(120),
  user: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  recipient: z.string().max(120).optional(),
});

export function GET() {
  return NextResponse.json({ payWith: RELAY_PAY.map(({ key, label, chain }) => ({ key, label, chain })), chains: Object.keys(RELAY_DEST) });
}

export async function POST(req: NextRequest) {
  const limited = overLimit(req, "relay", 240);
  if (limited) return limited;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const q = await relayQuote(b.data as Parameters<typeof relayQuote>[0]);
  return NextResponse.json(q, { status: "error" in q ? 502 : 200 });
}
