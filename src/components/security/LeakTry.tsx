"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";

// Made-up values in the shapes the firewall knows. None of them is a real key.
const EXAMPLE = [
  "Make the hero say WAGMI and use my helius RPC https://mainnet.helius-rpc.com/?api-key=3f8e1c2a-0000-4b5d-9e7f-a1b2c3d4e5f6",
  "my private key: 0x1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd",
  "and post updates with bot 7123456789:AAHfakefakefakefakefakefakefake1234",
  "here's the openai key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd",
].join("\n");

export function LeakTry() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; removed: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function scan(t = text) {
    if (!t.trim()) return;
    setBusy(true); setErr(null);
    const r = await fetch("/api/security/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok && j) setOut(j); else setErr(j?.error ?? "Couldn't run the check. Try again.");
  }

  return (
    <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
      <div className="min-w-0 rounded-[14px] border border-white/[0.08] bg-ink-900 p-3">
        <label htmlFor="leak-in" className="text-[12px] font-medium text-zinc-300">What you paste</label>
        <textarea
          id="leak-in"
          className="field mt-2 block h-44 w-full resize-y font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere]"
          placeholder="Paste a message with a key in it…"
          spellCheck={false}
          value={text}
          onChange={(e) => { setText(e.target.value); setOut(null); }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void scan()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Check it</button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setText(EXAMPLE); void scan(EXAMPLE); }}><Sparkles size={14} /> Use a made-up example</button>
        </div>
        {err && <p className="mt-2 text-[12px] text-amber-300">{err}</p>}
      </div>
      <div className="min-w-0 rounded-[14px] border border-white/[0.08] bg-ink-900 p-3">
        <div className="text-[12px] font-medium text-zinc-300">What the model gets</div>
        <pre className="mt-2 h-44 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-white/[0.06] bg-ink-950 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-200 [overflow-wrap:anywhere]">
          {out ? out.text.split(/(\[removed: [^\]]+\])/g).map((part, i) => (part.startsWith("[removed:") ? <span key={i} className="rounded bg-lime/15 text-lime">{part}</span> : part)) : <span className="text-zinc-600">The checked text shows here.</span>}
        </pre>
        {out && <p className="mt-2 text-[12.5px] text-zinc-400">{out.removed.length ? <>Took out {out.removed.join(", ")}. In the builder this message would be saved without them and nothing would run.</> : "Nothing secret in it: this would go through as typed."}</p>}
      </div>
    </div>
  );
}
