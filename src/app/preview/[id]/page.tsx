import { notFound } from "next/navigation";
import { getProject } from "@/lib/store";
import { siteCredit } from "@/lib/credit";
import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(id).catch(() => null);
  if (!p?.spec) notFound();
  return <PreviewClient initial={p.spec} walletconnect={p.integrations.walletconnectProjectId ?? null} credit={await siteCredit(p)} />;
}
