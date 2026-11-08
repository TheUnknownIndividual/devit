import { NextResponse } from "next/server";
import { clientIp } from "@/lib/net";
import { ownerKeysFor, viewer } from "@/lib/accounts";
import { balance, payerFor } from "@/lib/credits";
import { hasOwnLlm } from "@/lib/keyscope";
import { START_CREDITS } from "@/lib/plans";

/** What the build button needs to know before it is pressed: can this visitor start a build right now? */
export async function GET(req: Request) {
  const { user } = await viewer();
  const b = await balance(await payerFor(user, clientIp(req)));
  const ownKey = hasOwnLlm(await ownerKeysFor(user?.id));
  return NextResponse.json(
    { ...b, signedIn: !!user, ownKey, canBuild: ownKey || b.total >= START_CREDITS.build },
    { headers: { "cache-control": "no-store" } },
  );
}
