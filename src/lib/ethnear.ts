import { keccak_256 } from "@noble/hashes/sha3.js";
import type { NearTx } from "./swap";

// NEAR actions signed by an Ethereum wallet (NEP-518). Every 0x address is also a NEAR account whose wallet contract
// runs Ethereum transactions sent on chain 397 through NEAR's public relayer. One NEAR action = one Ethereum
// transaction; the contract reads the action from calldata encoded with the ABI below. Mirrors near/wallet-selector's
// ethereum-wallets module, without viem.

export const NEAR_EVM = {
  chainId: "0x18d", // 397, NEAR mainnet's Ethereum-compatible chain id
  chainName: "NEAR Protocol",
  rpcUrls: ["https://eth-rpc.mainnet.near.org"],
  nativeCurrency: { name: "NEAR", symbol: "NEAR", decimals: 18 },
  blockExplorerUrls: ["https://nearblocks.io"],
};
export const RELAYER_RPC = NEAR_EVM.rpcUrls[0];
/** The wallet contract needs headroom on top of the call itself to check the Ethereum transaction. */
const MAX_GAS = 270_000_000_000_000n;

export interface EthTx { to: string; data: string; value: string; gasPrice?: string; label: string }

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from((h.replace(/^0x/, "").match(/../g) ?? []).map((x) => parseInt(x, 16)));
const word = (n: bigint) => n.toString(16).padStart(64, "0");
const selector = (sig: string) => hex(keccak_256(enc.encode(sig))).slice(0, 8);

type Arg = { t: "uint"; v: bigint } | { t: "bool"; v: boolean } | { t: "bytes"; v: Uint8Array } | { t: "string"; v: string } | { t: "string[]"; v: string[] };

function dyn(b: Uint8Array): string {
  const h = hex(b);
  return word(BigInt(b.length)) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
}

/** Standard ABI encoding for the few types the wallet contract takes. */
export function abiEncode(args: Arg[]): string {
  const head: string[] = [];
  let tail = "";
  const size = 32 * args.length;
  for (const a of args) {
    if (a.t === "uint") head.push(word(a.v));
    else if (a.t === "bool") head.push(word(a.v ? 1n : 0n));
    else {
      head.push(word(BigInt(size + tail.length / 2)));
      tail += a.t === "string[]" ? word(BigInt(a.v.length)) + abiEncode(a.v.map((s) => ({ t: "string", v: s }))) : dyn(a.t === "bytes" ? a.v : enc.encode(a.v));
    }
  }
  return head.join("") + tail;
}

const SIG = {
  functionCall: selector("functionCall(string,string,bytes,uint64,uint32)"),
  transfer: selector("transfer(string,uint32)"),
  addKey: selector("addKey(uint8,bytes,uint64,bool,bool,uint128,string,string[])"),
};

/** The `to` the wallet contract expects: a 0x receiver as is, any other NEAR account as the tail of its keccak hash. */
export function ethTo(receiverId: string): string {
  return /^0x[0-9a-f]{40}$/.test(receiverId) ? receiverId : "0x" + hex(keccak_256(enc.encode(receiverId))).slice(24);
}

/** Free onboarding: lets NEAR's relayer submit this account's Ethereum transactions (a key limited to rlp_execute). */
export function onboardTx(account: string, relayerKeyHex: string): EthTx {
  const data = "0x" + SIG.addKey + abiEncode([
    { t: "uint", v: 0n }, { t: "bytes", v: fromHex(relayerKeyHex) }, { t: "uint", v: 0n }, { t: "bool", v: false }, { t: "bool", v: false },
    { t: "uint", v: 0n }, { t: "string", v: account }, { t: "string[]", v: ["rlp_execute"] },
  ]);
  // 1 wei gas price: the relayer pays for onboarding, and some wallets refuse a zero price.
  // AddKey always goes to the hash of the account (MetaMask blocks calldata sent to the user's own address).
  return { to: "0x" + hex(keccak_256(enc.encode(account))).slice(24), data, value: "0x0", gasPrice: "0x1", label: "Let NEAR's relayer carry your transactions (free, once)" };
}

/** Splits NEAR transactions into one Ethereum transaction per action. */
export function toEthTxs(txs: NearTx[], label: (receiverId: string, method: string | null) => string): EthTx[] {
  const out: EthTx[] = [];
  for (const tx of txs) {
    for (const a of tx.actions) {
      const p = a.params;
      const deposit = BigInt(String(p.deposit ?? "0"));
      const value = "0x" + (deposit / 1_000_000n).toString(16);
      const yocto = deposit % 1_000_000n;
      if (a.type === "FunctionCall") {
        const args = p.args;
        const bytes = args instanceof Uint8Array ? args : typeof args === "string" ? enc.encode(args) : enc.encode(JSON.stringify(args ?? {}));
        const gas = BigInt(String(p.gas ?? "30000000000000"));
        out.push({
          to: ethTo(tx.receiverId),
          value,
          data: "0x" + SIG.functionCall + abiEncode([{ t: "string", v: tx.receiverId }, { t: "string", v: String(p.methodName) }, { t: "bytes", v: bytes }, { t: "uint", v: gas < MAX_GAS ? gas : MAX_GAS }, { t: "uint", v: yocto }]),
          label: label(tx.receiverId, String(p.methodName)),
        });
      } else if (a.type === "Transfer") {
        out.push({ to: ethTo(tx.receiverId), value, data: "0x" + SIG.transfer + abiEncode([{ t: "string", v: tx.receiverId }, { t: "uint", v: yocto }]), label: label(tx.receiverId, null) });
      } else {
        throw new Error(`A ${a.type} action can't be signed from an Ethereum wallet here.`);
      }
    }
  }
  return out;
}
