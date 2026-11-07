import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/store";
import { publicProject } from "@/lib/public";
import { Workspace } from "@/components/build/Workspace";
import { viewer } from "@/lib/accounts";
import { accessTo } from "@/lib/access";
import { canRead, sharedWith } from "@/lib/site-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Builder · devit" };

export default async function Build({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ share?: string }> }) {
  const { id } = await params;
  const { share } = await searchParams;
  const p = await getProject(id).catch(() => null);
  const v = await viewer();
  if (!p || !(await canRead(p, v, share))) notFound();
  const a = await accessTo(p, v);
  return <Workspace initial={publicProject(p)} heliusOnServer={!!process.env.HELIUS_API_KEY} alchemyOnServer={!!process.env.ALCHEMY_API_KEY} canEdit={a === "owner" || a === "editor"} viewNote={a === "viewer" ? "View only: you're a viewer on this project's team." : !a && sharedWith(p, share) ? "View only: someone shared this project with you. Nothing you do here changes it." : undefined} share={!a && sharedWith(p, share) ? share : undefined} />;
}
