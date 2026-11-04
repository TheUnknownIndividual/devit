"use client";

import { Component, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, useCreateWallet, useLogin, useLogout, usePrivy, useWallets, type PrivyClientConfig, type User } from "@privy-io/react-auth";
import type { Chain } from "@/lib/spec";
import { EVM_CHAIN, type Eip1193 } from "./wallet";

// Privy, mounted on demand in its own React root inside the site: wallet.ts imports this file only when a visitor
// picks email/social sign-in or comes back signed in, so other sites never download the SDK. Privy's hooks are
// mirrored into `live` so the wallet core can drive login, logout and signing from outside React.

export type SolHooks = { wallets: Array<{ address: string }>; send: (tx: Uint8Array, address: string) => Promise<Uint8Array>; create: () => Promise<unknown> };
type Live = {
  ready: boolean; authenticated: boolean; modal: boolean; user: User | null; error: Error | null; loginError: string | null;
  login: () => void; logout: () => Promise<void>; createWallet: () => Promise<unknown>;
  evm: Array<{ address: string; getEthereumProvider: () => Promise<Eip1193> }>;
  sol: SolHooks | null;
};
export interface Bridge {
  connect(o: { silent?: boolean; onOpen?: () => void }): Promise<{ address: string; label: string; provider?: Eip1193 }>;
  logout(): Promise<void>;
  sendSolana(tx: Uint8Array): Promise<Uint8Array>;
  destroy(): void;
}

const OAUTH = /[?&]privy_oauth_/;
type Hex = `#${string}`;

/** A Privy error the visitor can't fix by trying again (bad App ID, domain not allowed): the bridge is thrown away. */
function fatal(e: unknown): Error {
  const m = (e as { message?: string }).message ?? String(e);
  const out = new Error(
    /app.?id/i.test(m) ? "Privy doesn't recognise this site's App ID."
      : /origin|domain/i.test(m) ? "This address isn't on the Privy app's allowed domains."
        : m || "Privy didn't load.",
  ) as Error & { fatal?: boolean };
  out.fatal = true;
  return out;
}

class Catch extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { this.props.onError(e); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Mirror({ live, emit }: { live: Live; emit: () => void }) {
  const p = usePrivy();
  const { login } = useLogin({ onError: (code) => { live.loginError = String(code); emit(); } });
  const { logout } = useLogout();
  const { createWallet } = useCreateWallet();
  const { wallets } = useWallets();
  useEffect(() => {
    Object.assign(live, { ready: p.ready, authenticated: p.authenticated, modal: p.isModalOpen, user: p.user, error: p.error ?? live.error, login, logout, createWallet, evm: wallets });
    emit();
  });
  return null;
}

/** The site's look, read off its root: Privy's modal gets the same accent, light/dark and logo. */
function appearance(root: Element): NonNullable<PrivyClientConfig["appearance"]> {
  const cs = getComputedStyle(root);
  const hex = (v: string): Hex | undefined => (/^#[0-9a-f]{6}$/i.test(v.trim()) ? (v.trim() as Hex) : undefined);
  const bg = hex(cs.getPropertyValue("--bg"));
  const lum = bg ? [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0) : 0.5;
  const dark = root.hasAttribute("data-dark");
  const logo = root.querySelector<HTMLImageElement>(".ss-brand img")?.src;
  // Privy builds its palette from a background colour only when it's clearly dark or light.
  return { theme: bg && (dark ? lum < 0.2 : lum > 0.8) ? bg : dark ? "dark" : "light", accentColor: hex(cs.getPropertyValue("--accent")), ...(logo ? { logo } : {}), showWalletLoginFirst: false };
}

const viemChain = (c: NonNullable<(typeof EVM_CHAIN)[Chain]>) => ({
  id: parseInt(c.id, 16), name: c.name,
  nativeCurrency: { name: c.native ?? "Ether", symbol: c.native ?? "ETH", decimals: 18 },
  rpcUrls: { default: { http: c.rpc } }, blockExplorers: { default: { name: c.name, url: c.explorer } },
});

const embedded = (u: User | null, type: "ethereum" | "solana") =>
  (u?.linkedAccounts.find((a) => a.type === "wallet" && a.chainType === type && /^privy/.test(a.walletClientType ?? "")) as { address?: string } | undefined)?.address ?? null;

function labelOf(u: User | null): string {
  return u?.email?.address ?? u?.google?.email ?? (u?.twitter?.username ? `@${u.twitter.username}` : null) ?? u?.phone?.number ?? "Privy wallet";
}

export async function mount(o: { appId: string; chain: Chain; methods: string[] | null; onChange: (s: { address: string | null }) => void }): Promise<Bridge> {
  const solMod = o.chain === "solana" ? await import("./privy-sol") : null;
  const live: Live = { ready: false, authenticated: false, modal: false, user: null, error: null, loginError: null, login: () => undefined, logout: async () => undefined, createWallet: async () => undefined, evm: [], sol: null };
  const subs = new Set<() => void>();
  const type = o.chain === "solana" ? "solana" : "ethereum";
  let reported: string | null | undefined;
  let linked = false;
  const emit = () => {
    subs.forEach((f) => f());
    const a = live.authenticated ? embedded(live.user, type) : null;
    if (linked && a !== reported) { reported = a; o.onChange({ address: a }); }
  };

  /** Resolves with pick()'s first truthy value; pick may throw to stop waiting. */
  const until = <T,>(pick: () => T | null | undefined | false, ms: number, why: string) => new Promise<T>((res, rej) => {
    const stop = () => { subs.delete(check); clearTimeout(t); };
    const check = () => {
      try {
        if (live.error) throw fatal(live.error);
        const v = pick();
        if (v) { stop(); res(v); }
      } catch (e) { stop(); rej(e); }
    };
    const t = setTimeout(() => { stop(); rej(new Error(why)); }, ms);
    subs.add(check);
    check();
  });

  const root = document.querySelector(".ss") ?? document.body;
  const el = document.createElement("div");
  el.dataset.el = "privy";
  root.appendChild(el);
  const r = createRoot(el, { onCaughtError: (e) => console.warn("[privy]", e) });
  const evmChains = Object.values(EVM_CHAIN).map((c) => viemChain(c!));
  const own = EVM_CHAIN[o.chain];
  const config: PrivyClientConfig = {
    appearance: appearance(root),
    ...(o.methods?.length ? { loginMethods: o.methods as NonNullable<PrivyClientConfig["loginMethods"]> } : {}),
    embeddedWallets: type === "solana" ? { solana: { createOnLogin: "users-without-wallets" }, ethereum: { createOnLogin: "off" } } : { ethereum: { createOnLogin: "users-without-wallets" } },
    ...(own ? { defaultChain: viemChain(own), supportedChains: evmChains } : {}),
    ...(solMod ? { solana: solMod.config() } : {}),
  };
  r.render(
    <Catch onError={(e) => { live.error = e; emit(); }}>
      <PrivyProvider appId={o.appId} config={config}>
        <Mirror live={live} emit={emit} />
        {solMod && <solMod.Hooks set={(s) => { live.sol = s; emit(); }} />}
      </PrivyProvider>
    </Catch>,
  );

  return {
    async connect({ silent, onOpen }) {
      await until(() => live.ready, 20_000, "Privy didn't load. Check the App ID and the allowed domains in the Privy dashboard.");
      if (!live.authenticated) {
        if (silent && !OAUTH.test(location.search)) throw new Error("Not signed in.");
        if (silent) await until(() => live.authenticated, 20_000, "Sign-in didn't finish.");
        else {
          let opened = false;
          live.loginError = null;
          live.login();
          await until(() => {
            if (live.modal && !opened) { opened = true; onOpen?.(); }
            if (live.loginError) throw Object.assign(new Error(live.loginError === "exited_auth_flow" ? "Cancelled" : `Privy: ${live.loginError}`), { code: live.loginError === "exited_auth_flow" ? 4001 : undefined });
            if (opened && !live.modal && !live.authenticated) throw Object.assign(new Error("Cancelled"), { code: 4001 });
            return live.authenticated;
          }, 30 * 60_000, "Sign-in timed out.");
        }
      }
      // createOnLogin makes the wallet right after sign-in; a user who already had another wallet type gets one here.
      let address = await until(() => embedded(live.user, type), 6_000, "").catch(() => null);
      if (!address) {
        await (type === "solana" ? live.sol?.create() : live.createWallet())?.catch(() => undefined);
        address = await until(() => embedded(live.user, type), 20_000, "Privy didn't create a wallet. Try again.");
      }
      const a = address;
      let provider: Eip1193 | undefined;
      if (type === "ethereum") {
        const w = await until(() => live.evm.find((x) => x.address.toLowerCase() === a.toLowerCase()), 15_000, "Privy's wallet didn't start. Try again.");
        provider = await w.getEthereumProvider();
      } else await until(() => live.sol?.wallets.some((x) => x.address === a), 15_000, "Privy's wallet didn't start. Try again.");
      linked = true;
      reported = a;
      return { address: a, label: labelOf(live.user), provider };
    },
    async logout() { linked = false; if (live.authenticated) await live.logout(); },
    async sendSolana(tx) {
      const a = embedded(live.user, "solana");
      if (!live.sol || !a) throw new Error("Sign in again to send.");
      return live.sol.send(tx, a);
    },
    destroy() { subs.clear(); r.unmount(); el.remove(); },
  };
}
