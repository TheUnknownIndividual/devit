import { notFound } from "next/navigation";
import { getProject } from "@/lib/store";
import { siteCredit } from "@/lib/credit";
import { canRead } from "@/lib/site-access";
import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";

export default async function Preview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ share?: string }> }) {
  const { id } = await params;
  const { share } = await searchParams;
  const p = await getProject(id).catch(() => null);
  if (!p?.spec || !(await canRead(p, undefined, share))) notFound();
  return <PreviewClient initial={p.spec} walletconnect={p.integrations.walletconnectProjectId ?? null} credit={await siteCredit(p)} />;
}
