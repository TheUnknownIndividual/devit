// Slash commands in the builder's chat box: type "/" for ready-made requests (Lovable's skills, bolt's /commands).
// A command fills the box with its text to edit before sending; a "mode" command switches Edit / Plan / Ask instead.

export interface SlashCommand { cmd: string; label: string; text?: string; mode?: "edit" | "plan" | "ask" }

export const COMMANDS: SlashCommand[] = [
  { cmd: "plan", label: "Plan first: say what would change, then wait", mode: "plan" },
  { cmd: "ask", label: "Ask a question; nothing changes", mode: "ask" },
  { cmd: "hero", label: "Sharper hero", text: "Rewrite the hero: a shorter headline, one line on what the token is, and one clear button to buy. Keep the ticker visible." },
  { cmd: "howtobuy", label: "How to buy, step by step", text: "Add a How to buy section with 4 short steps for our chain: get a wallet, fund it, swap for the token, add it to the wallet." },
  { cmd: "tokenomics", label: "Tokenomics", text: "Add tokenomics: total supply, how it's split, any buy or sell tax, and whether liquidity is locked or burned. Use only numbers I give: " },
  { cmd: "roadmap", label: "Roadmap", text: "Add a roadmap in 4 phases (launch, listings, community, what's next). No dates and no promises we can't keep." },
  { cmd: "faq", label: "FAQ", text: "Add a FAQ with the questions buyers ask: what it is, which chain, the contract address, how to buy, taxes, and who's behind it." },
  { cmd: "fomo", label: "Live buys and top buyers", text: "Add live buy pop-ups and a top buyers leaderboard." },
  { cmd: "raid", label: "Raid kit for X", text: "Add a raid kit with 5 ready-made posts for X that people can copy, with our ticker and contract address." },
  { cmd: "milestones", label: "Market cap milestones", text: "Add market cap milestones with a progress bar to the next one." },
  { cmd: "pnl", label: "What-if PnL card", text: "Add a \"what if you'd bought\" card people can share on X." },
  { cmd: "socials", label: "Socials", text: "Add our socials to the top bar and footer: " },
  { cmd: "waitlist", label: "Waitlist form", text: "Add a waitlist form that asks for an email and an X handle." },
  { cmd: "shorter", label: "Shorter copy everywhere", text: "Make all the copy shorter and punchier. Cut anything that repeats. Keep every fact." },
  { cmd: "tone", label: "Change the voice", text: "Rewrite all the copy in this voice: " },
  { cmd: "translate", label: "Translate the site", text: "Translate every section of the site into: " },
  { cmd: "phone", label: "Better on phones", text: "Make it read better on phones: bigger buttons, shorter lines, the buy button easy to reach." },
];

/** The commands matching what's typed after "/", best first. */
export function matchCommands(typed: string): SlashCommand[] {
  const q = typed.toLowerCase();
  return COMMANDS.filter((c) => c.cmd.startsWith(q)).concat(COMMANDS.filter((c) => !c.cmd.startsWith(q) && (c.cmd.includes(q) || c.label.toLowerCase().includes(q)))).slice(0, 8);
}
