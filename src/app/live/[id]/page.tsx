import { notFound } from "next/navigation";
import { Site } from "@/blocks/Site";
import { getProject } from "@/lib/store";

// "Open live" from the builder: the real site with motion and live data, before it's published.
export const dynamic = "force-dynamic";

export default async function Live({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(id).catch(() => null);
  if (!p?.spec) notFound();
  return <Site spec={p.spec} mode="live" walletconnect={p.integrations.walletconnectProjectId ?? null} privy={p.integrations.privyAppId ?? null} />;
}
