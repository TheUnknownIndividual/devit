import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAIN_IDS } from "@/lib/spec";
import { intentQuote, PAY_WITH } from "@/lib/intents";

// Stand-in addresses for preview quotes, before the buyer has connected a wallet. Never used for a real deposit.
const DRY_ADDR: Record<string, string> = {
  sol: "So11111111111111111111111111111111111111112",
  eth: "0x1111111111111111111111111111111111111111",
  base: "0x1111111111111111111111111111111111111111",
  arb: "0x1111111111111111111111111111111111111111",
  hood: "0x1111111111111111111111111111111111111111",
  bsc: "0x1111111111111111111111111111111111111111",
  btc: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
  near: "intents.near",
};
const CHAIN_KEY = { near: "near", solana: "sol", ethereum: "eth", base: "base", bsc: "bsc", robinhood: "hood" } as const;

const Body = z.object({
  pay: z.enum(PAY_WITH.map((p) => p.key) as [string, ...string[]]),
  amount: z.number().positive().max(1e7),
  chain: z.enum(CHAIN_IDS),
  token: z.string().max(120).nullable(),
  recipient: z.string().max(120).optional(),
  refundTo: z.string().max(120).optional(),
});

export async function GET() {
  return NextResponse.json({ payWith: PAY_WITH });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;
  const dry = !b.recipient || !b.refundTo;
  const q = await intentQuote({
    pay: b.pay, amount: b.amount, chain: b.chain, token: b.token, dry,
    recipient: b.recipient || DRY_ADDR[CHAIN_KEY[b.chain]],
    refundTo: b.refundTo || DRY_ADDR[b.pay.split(":")[0]] || DRY_ADDR.eth,
  });
  return NextResponse.json(q, { status: "error" in q ? 502 : 200 });
}
