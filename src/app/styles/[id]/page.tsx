import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Site } from "@/blocks/Site";
import { SHOWCASE } from "@/lib/showcase";
import { THEME_LABELS } from "@/lib/themes";
import type { ThemeId } from "@/lib/spec";

// A finished sample site per style, for the landing's "Start from a style" frame and for opening full size.
// The token is made up (demo): the price drifts and trades roll in without any request leaving the page.

export function generateStaticParams() {
  return Object.keys(SHOWCASE).map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const spec = SHOWCASE[id as ThemeId];
  return spec ? { title: `${spec.name} · ${THEME_LABELS[id as ThemeId]} sample · sitesmith`, robots: { index: false } } : {};
}

export default async function StyleSample({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spec = SHOWCASE[id as ThemeId];
  if (!spec) notFound();
  return <Site spec={spec} mode="live" credit={null} />;
}
