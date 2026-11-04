import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/store";
import { publicProject } from "@/lib/public";
import { Workspace } from "@/components/build/Workspace";
import { canEdit, viewer } from "@/lib/accounts";
import { canRead } from "@/lib/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Builder · sitesmith" };

export default async function Build({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProject(id).catch(() => null);
  const v = await viewer();
  if (!p || !(await canRead(p, v))) notFound();
  return <Workspace initial={publicProject(p)} heliusOnServer={!!process.env.HELIUS_API_KEY} canEdit={canEdit(p, v)} />;
}
