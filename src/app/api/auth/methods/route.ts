import { NextResponse } from "next/server";
import { googleOn } from "@/lib/google";

// Which sign-in methods this server can offer beyond passkeys and wallets (the dialog hides the rest).
export function GET() {
  const email = !!process.env.RESEND_API_KEY || process.env.NODE_ENV !== "production";
  return NextResponse.json({ google: googleOn(), email }, { headers: { "cache-control": "no-store" } });
}
