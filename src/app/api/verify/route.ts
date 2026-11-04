import { NextResponse } from "next/server";
import { isPublicHttps } from "@/lib/net";

// Checks an ID the user pasted during a guided setup, so they get a green tick before they leave the dialog.

export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind");
  const id = (u.searchParams.get("id") ?? "").trim();
  try {
    if (kind === "privy") {
      if (!/^[a-z0-9]{20,32}$/i.test(id)) return NextResponse.json({ ok: false, reason: "Privy App IDs are 20–32 letters and numbers." });
      const r = await fetch(`https://auth.privy.io/api/v1/apps/${id}`, { headers: { "privy-app-id": id }, signal: AbortSignal.timeout(6000), cache: "no-store" });
      if (!r.ok) return NextResponse.json({ ok: false, reason: "Privy doesn't recognise that App ID." });
      const j = (await r.json().catch(() => ({}))) as { name?: string; allowed_domains?: string[] };
      return NextResponse.json({ ok: true, name: j.name ?? null, allowedDomains: j.allowed_domains ?? null });
    }
    if (kind === "walletconnect") {
      if (!/^[0-9a-f]{32}$/i.test(id)) return NextResponse.json({ ok: false, reason: "Project IDs are 32 characters, 0–9 and a–f." });
      const r = await fetch(`https://explorer-api.walletconnect.com/v3/wallets?projectId=${id}&entries=1&page=1`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      return NextResponse.json(r.ok ? { ok: true } : { ok: false, reason: "WalletConnect doesn't recognise that Project ID." });
    }
    if (kind === "rpc") {
      if (!isPublicHttps(id)) return NextResponse.json({ ok: false, reason: "Use a public https RPC URL." });
      const url = new URL(id);
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: u.searchParams.get("method") || "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(6000),
      });
      const j = (await r.json().catch(() => null)) as { result?: unknown; error?: unknown } | null;
      return NextResponse.json(j && "result" in j ? { ok: true } : { ok: false, reason: "That RPC didn't answer a basic call." });
    }
  } catch {
    return NextResponse.json({ ok: false, reason: "Couldn't reach the service. Try again in a moment." });
  }
  return NextResponse.json({ ok: false, reason: "unknown check" }, { status: 400 });
}
