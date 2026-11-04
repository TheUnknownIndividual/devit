import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { completeMethod, peekChallenge, publicUser, putChallenge, sweepChallenges, takeChallenge } from "@/lib/accounts";
import { sha256 } from "@/lib/secrets";
import { overLimit } from "@/lib/net";
import { sendMail } from "@/lib/mail";

// Email one-time code: six digits, 10 minutes, five tries. Sent through Resend when RESEND_API_KEY is set; in dev
// without it the code goes to the server log instead.

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("start"), email: z.string().trim().toLowerCase().email().max(200) }),
  z.object({ step: z.literal("verify"), email: z.string().trim().toLowerCase().email().max(200), code: z.string().trim().regex(/^\d{6}$/) }),
]);

const key = (email: string) => `email-${sha256(email).slice(0, 40)}`;

async function send(email: string, code: string): Promise<boolean> {
  const sent = await sendMail(email, `${code} is your sitesmith code`, `Your sitesmith sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email.`);
  if (sent !== null) return sent;
  if (process.env.NODE_ENV === "production") return false;
  console.log(`[sitesmith] sign-in code for ${email}: ${code}`);
  return true;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const b = parsed.data;
  void sweepChallenges();

  if (b.step === "start") {
    const limited = overLimit(req, "email", 8);
    if (limited) return limited;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await putChallenge(key(b.email), { hash: sha256(`${b.email}:${code}`), tries: 0 }, 10 * 60_000);
    if (!(await send(b.email, code))) return NextResponse.json({ error: "Email sign-in isn't set up on this server yet. Use a passkey or a wallet." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  const limited = overLimit(req, "email-code", 40);
  if (limited) return limited;
  const c = await peekChallenge<{ hash: string; tries: number }>(key(b.email));
  if (!c) return NextResponse.json({ error: "That code expired. Send a new one." }, { status: 400 });
  if (c.hash !== sha256(`${b.email}:${b.code}`)) {
    if (c.tries >= 4) await takeChallenge(key(b.email));
    else await putChallenge(key(b.email), { ...c, tries: c.tries + 1 }, 10 * 60_000);
    return NextResponse.json({ error: c.tries >= 4 ? "Too many wrong codes. Send a new one." : "That code isn't right." }, { status: 400 });
  }
  await takeChallenge(key(b.email));
  const out = await completeMethod({ kind: "email", id: b.email, label: b.email, at: Date.now() });
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ user: publicUser(out.user), linked: out.linked });
}
