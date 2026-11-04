import { NextResponse } from "next/server";

const ONECLICK = process.env.ONECLICK_URL || "https://1click.chaindefuser.com";

// Where a buyer's deposit is: PENDING_DEPOSIT → PROCESSING → SUCCESS, or REFUNDED / FAILED.
export async function GET(req: Request) {
  const dep = new URL(req.url).searchParams.get("depositAddress") ?? "";
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(dep)) return NextResponse.json({ error: "depositAddress required" }, { status: 400 });
  const headers: Record<string, string> = {};
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  try {
    const r = await fetch(`${ONECLICK}/v0/status?depositAddress=${encodeURIComponent(dep)}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const j = (await r.json()) as { status?: string };
    const words: Record<string, string> = { PENDING_DEPOSIT: "waiting for your deposit", KNOWN_DEPOSIT_TX: "deposit seen", PROCESSING: "swapping", SUCCESS: "done, it's in your wallet", INCOMPLETE_DEPOSIT: "deposit was short", REFUNDED: "refunded", FAILED: "failed, refund on the way" };
    return NextResponse.json({ status: j.status ? words[j.status] ?? j.status.toLowerCase() : null });
  } catch {
    return NextResponse.json({ status: null });
  }
}
