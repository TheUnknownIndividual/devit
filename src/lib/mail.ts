// Mail through Resend when RESEND_API_KEY is set. null = not set up here (callers fall back: a log line, a link).
export async function sendMail(to: string, subject: string, text: string): Promise<boolean | null> {
  const api = process.env.RESEND_API_KEY?.trim();
  if (!api) return null;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${api}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "sitesmith <onboarding@resend.dev>", to: [to], subject, text }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return !!r?.ok;
}
