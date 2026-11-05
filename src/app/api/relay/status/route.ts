import { NextResponse } from "next/server";
import { relayStatus } from "@/lib/relay";

const WORDS: Record<string, string> = {
  waiting: "waiting for your transaction", pending: "on its way", submitted: "on its way", success: "done, it's in your wallet",
  delayed: "taking longer than usual", refund: "refunded", refunded: "refunded", failure: "failed, refund on the way",
};

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^0x[0-9a-f]{64}$/i.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const s = await relayStatus(id);
  return NextResponse.json({ status: s ? WORDS[s] ?? s : null, done: s === "success", failed: s === "failure" || s === "refund" || s === "refunded" });
}
