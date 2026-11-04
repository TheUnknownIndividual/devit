"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, Loader2, Lock, Server, ShieldCheck } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ChainIcon } from "@/components/brand";
import { CHAINS, type Chain } from "@/lib/spec";
import type { PublicProject } from "@/lib/public";

const PROBE: Record<Chain, string> = { near: "status", solana: "getHealth", ethereum: "eth_chainId", base: "eth_chainId", bsc: "eth_chainId", robinhood: "eth_chainId" };
const DEFAULTS: Record<Chain, string> = { near: "FastNEAR public RPC", solana: "Solana public RPC (Helius when the server has a key)", ethereum: "PublicNode", base: "PublicNode", bsc: "PublicNode", robinhood: "Robinhood Chain public RPC" };
const PROVIDERS: Record<Chain, Array<{ name: string; url: string }>> = {
  near: [{ name: "FastNEAR", url: "https://fastnear.com" }, { name: "dRPC", url: "https://drpc.org" }],
  solana: [{ name: "Helius", url: "https://dashboard.helius.dev" }, { name: "dRPC", url: "https://drpc.org" }],
  ethereum: [{ name: "dRPC", url: "https://drpc.org" }, { name: "Alchemy", url: "https://dashboard.alchemy.com" }],
  base: [{ name: "dRPC", url: "https://drpc.org" }, { name: "Alchemy", url: "https://dashboard.alchemy.com" }],
  bsc: [{ name: "dRPC", url: "https://drpc.org" }, { name: "NodeReal", url: "https://nodereal.io" }],
  robinhood: [{ name: "dRPC", url: "https://drpc.org" }, { name: "Alchemy", url: "https://dashboard.alchemy.com" }],
};

export function RpcDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project: PublicProject; onSaved: (p: PublicProject) => void }) {
  const chain = project.network.chain;
  const [own, setOwn] = useState(project.network.rpcUrlSet);
  const [url, setUrl] = useState("");
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "bad"; reason?: string }>({ state: "idle" });
  const [saving, setSaving] = useState(false);

  async function test() {
    setCheck({ state: "checking" });
    const r = await fetch(`/api/verify?kind=rpc&method=${PROBE[chain]}&id=${encodeURIComponent(url.trim())}`).then((x) => x.json()).catch(() => ({ ok: false, reason: "Couldn't reach the check." }));
    setCheck(r.ok ? { state: "ok" } : { state: "bad", reason: r.reason });
  }

  async function save() {
    setSaving(true);
    const r = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rpcUrl: own ? url.trim() : "" }) });
    setSaving(false);
    if (r.ok) { onSaved((await r.json()) as PublicProject); onClose(); }
  }

  const canSave = own ? check.state === "ok" : project.network.rpcUrlSet;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="RPC endpoint"
      icon={<Server size={15} />}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!canSave || saving} onClick={() => void save()}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save</button>
      </>}
    >
      <div className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-[13px] text-zinc-400"><ChainIcon chain={chain} size={14} /> Reads for {CHAINS[chain].name}</div>
        {[false, true].map((mine) => (
          <button key={String(mine)} type="button" onClick={() => setOwn(mine)} className={`flex w-full items-start gap-3 rounded-[12px] border p-3.5 text-left ${own === mine ? "border-sel/60 bg-sel/[0.06]" : "border-white/[0.08] bg-ink-850 hover:border-white/15"}`}>
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${own === mine ? "border-sel bg-sel" : "border-white/25"}`}>{own === mine && <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />}</span>
            <span>
              <span className="block text-[13.5px] font-medium text-white">{mine ? "My own RPC" : "Default"}{!mine && <span className="ml-2 text-[12px] font-normal text-zinc-500">free</span>}</span>
              <span className="mt-0.5 block text-[12.5px] text-zinc-400">{mine ? (project.network.rpcUrlSet ? "A private URL is saved. Paste a new one to replace it." : "Paste a paid endpoint for higher limits.") : DEFAULTS[chain]}</span>
            </span>
          </button>
        ))}
        {own && (
          <div className="animate-rise rounded-[12px] border border-white/[0.08] bg-ink-850 p-3.5">
            <div className="flex gap-2">
              <input className="field font-mono text-[12.5px]" placeholder="https://…" value={url} spellCheck={false} onChange={(e) => { setUrl(e.target.value); setCheck({ state: "idle" }); }} onKeyDown={(e) => { if (e.key === "Enter") void test(); }} aria-label="RPC URL" />
              <button type="button" className="btn btn-outline h-10" disabled={!url.trim() || check.state === "checking"} onClick={() => void test()}>
                {check.state === "checking" ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Test
              </button>
            </div>
            {check.state === "ok" && <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-lime"><CheckCircle2 size={15} /> It answered a {PROBE[chain]} call.</div>}
            {check.state === "bad" && <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} /> {check.reason}</div>}
            <div className="mt-3 flex items-start gap-2 text-[12px] text-zinc-500"><Lock size={13} className="mt-0.5 shrink-0" /> Kept on the server. Published pages read through our proxy, so the URL and its key never reach a visitor.</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
              Get one from
              {PROVIDERS[chain].map((p) => <a key={p.name} className="chip h-7 text-[12px]" href={p.url} target="_blank" rel="noreferrer">{p.name} <ArrowUpRight size={12} /></a>)}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
