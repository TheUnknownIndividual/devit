import { NextResponse } from "next/server";
import { readTreasury, validAccount } from "@/lib/treasury";

// A project's on-chain treasury, read from public sources and cached 60s per account set (lib/treasury.ts).
export async function GET(req: Request) {
  const list = (new URL(req.url).searchParams.get("accounts") ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.length > 3 || !list.every(validAccount)) return NextResponse.json({ error: "1-3 NEAR accounts required" }, { status: 400 });
  return NextResponse.json(await readTreasury(list), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
