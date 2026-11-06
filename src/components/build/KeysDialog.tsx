"use client";

import { KeyRound, LogIn } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { openSignIn, setSessionUser, useSession } from "@/components/account/session";
import { KeyRow } from "@/components/settings/KeyRow";
import type { KeyId } from "@/lib/keyscope";

// Your API keys without leaving the builder: each row links to the page where that key is made ("Get one"),
// checks it before saving, and the next message uses it. Same keys as Settings → API keys.

const MODEL_KEYS: KeyId[] = ["nearai", "anthropic", "openai", "openrouter"];
const CHAIN_KEYS: KeyId[] = ["helius", "rpc:near", "rpc:solana", "rpc:ethereum", "rpc:robinhood"];

export function KeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  return (
    <Dialog open={open} onClose={onClose} title="Your API keys" icon={<KeyRound size={16} />} width={600}>
      {!user ? (
        <div className="space-y-3 p-5">
          <p className="text-[13px] text-zinc-400">Sign in to add your own keys. They're encrypted on our server, tied to your account, and used for your builds before ours.</p>
          <button type="button" className="btn btn-primary" onClick={() => { onClose(); openSignIn(); }}><LogIn size={15} /> Sign in</button>
        </div>
      ) : (
        <div className="min-w-0 space-y-5 p-5">
          <p className="text-[12.5px] text-zinc-500">Your keys run first, then ours if they fail. Builds on your own model key don't count toward your plan. Keys are encrypted at rest and never shown again.</p>
          <section>
            <h3 className="mb-2 text-[12px] font-medium text-zinc-400">Models</h3>
            <div className="space-y-2">{MODEL_KEYS.map((id) => <KeyRow key={id} id={id} saved={user.keys[id]} onUser={(u) => u && setSessionUser(u)} />)}</div>
          </section>
          <section>
            <h3 className="mb-2 text-[12px] font-medium text-zinc-400">Chain data</h3>
            <div className="space-y-2">{CHAIN_KEYS.map((id) => <KeyRow key={id} id={id} saved={user.keys[id]} onUser={(u) => u && setSessionUser(u)} />)}</div>
          </section>
        </div>
      )}
    </Dialog>
  );
}
