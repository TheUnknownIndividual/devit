import { notFound } from "next/navigation";
import { getProject } from "@/lib/store";
import { canRead } from "@/lib/access";
import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(id).catch(() => null);
  if (!p?.spec || !(await canRead(p))) notFound();
  return <PreviewClient initial={p.spec} walletconnect={p.integrations.walletconnectProjectId ?? null} />;
}
