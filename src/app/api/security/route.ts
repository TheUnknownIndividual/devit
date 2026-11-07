import { NextResponse } from "next/server";
import { posture } from "@/lib/env-guard";

// The server's security posture as pass/fail checks, read live. Never a value: only whether each guarantee holds.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(posture(), { headers: { "cache-control": "no-store" } });
}
