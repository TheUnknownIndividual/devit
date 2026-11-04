import { siBitcoin, siCloudflare, siCoinbase, siDiscord, siEthereum, siFigma, siGithub, siNear, siRobinhood, siSolana, siTelegram, siWalletconnect, siX } from "simple-icons";
import type { Chain } from "@/lib/spec";

// Brand marks from simple-icons (CC0). Wallets that simple-icons doesn't carry (MetaMask, Phantom) show the
// icon the wallet itself announces at runtime (EIP-6963), so visitors see the logo they already know.

type Si = { path: string; hex: string; title: string };

export function BrandIcon({ icon, size = 16, color, className }: { icon: Si; size?: number; color?: string; className?: string }) {
  return (
    <svg role="img" aria-label={icon.title} width={size} height={size} viewBox="0 0 24 24" className={className} fill={color ?? `#${icon.hex}`}>
      <path d={icon.path} />
    </svg>
  );
}

export const BRANDS = {
  github: siGithub, figma: siFigma, walletconnect: siWalletconnect, solana: siSolana, ethereum: siEthereum, near: siNear,
  robinhood: siRobinhood, x: siX, telegram: siTelegram, discord: siDiscord, coinbase: siCoinbase, bitcoin: siBitcoin, cloudflare: siCloudflare,
};

export const CHAIN_BRAND: Record<Chain, { icon: Si; tint: string }> = {
  near: { icon: siNear, tint: "#FFFFFF" },
  solana: { icon: siSolana, tint: "#14F195" },
  ethereum: { icon: siEthereum, tint: "#B4C1FF" },
  robinhood: { icon: siRobinhood, tint: "#CCFF00" },
};

export function ChainIcon({ chain, size = 16, mono }: { chain: Chain; size?: number; mono?: string }) {
  const b = CHAIN_BRAND[chain];
  return <BrandIcon icon={b.icon} size={size} color={mono ?? b.tint} />;
}

/** Brand tiles for services simple-icons doesn't ship: a solid tile in the brand colour with its initial. */
export function LetterMark({ letter, bg, fg = "#fff", size = 20 }: { letter: string; bg: string; fg?: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.55 }} className="inline-grid shrink-0 place-items-center rounded-md font-bold leading-none">
      {letter}
    </span>
  );
}
