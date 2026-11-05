import { NextResponse } from "next/server";
import { appleOn } from "@/lib/apple";
import { googleOn } from "@/lib/google";
import { githubOn } from "@/lib/github";

// Which sign-in methods this server can offer beyond passkeys and wallets (the dialog hides the rest).
export function GET() {
  const email = !!process.env.RESEND_API_KEY || process.env.NODE_ENV !== "production";
  return NextResponse.json({ google: googleOn(), apple: appleOn(), github: githubOn(), email }, { headers: { "cache-control": "no-store" } });
}
