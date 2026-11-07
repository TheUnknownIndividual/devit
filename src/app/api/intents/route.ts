import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAIN_IDS } from "@/lib/spec";
import { intentQuote, PAY_WITH, privateOn } from "@/lib/intents";

// Stand-in addresses for preview quotes, before the buyer has connected a wallet. Never used for a real deposit.
const DRY_ADDR: Record<string, string> = {
  sol: "So11111111111111111111111111111111111111112",
  eth: "0x1111111111111111111111111111111111111111",
  base: "0x1111111111111111111111111111111111111111",
  arb: "0x1111111111111111111111111111111111111111",
  hood: "0x1111111111111111111111111111111111111111",
  bsc: "0x1111111111111111111111111111111111111111",
  op: "0x1111111111111111111111111111111111111111",
  avax: "0x1111111111111111111111111111111111111111",
  pol: "0x1111111111111111111111111111111111111111",
  sui: "0x0000000000000000000000000000000000000000000000000000000000000002",
  aptos: "0x0000000000000000000000000000000000000000000000000000000000000001",
  doge: "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L",
  zec: "t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs",
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
  private: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ payWith: PAY_WITH, private: privateOn() });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;
  const dry = !b.recipient || !b.refundTo;
  const q = await intentQuote({
    pay: b.pay, amount: b.amount, chain: b.chain, token: b.token, dry, private: b.private,
    recipient: b.recipient || DRY_ADDR[CHAIN_KEY[b.chain]],
    refundTo: b.refundTo || DRY_ADDR[b.pay.split(":")[0]] || DRY_ADDR.eth,
  });
  return NextResponse.json(q, { status: "error" in q ? 502 : 200 });
}
