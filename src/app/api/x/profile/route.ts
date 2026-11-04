import { NextResponse } from "next/server";
import { readX, xHandle } from "@/lib/research";

/** Check a typed X handle: name, picture, followers and how many recent posts we can read. Cached on disk. */
export async function GET(req: Request) {
  const h = xHandle(new URL(req.url).searchParams.get("handle"));
  if (!h) return NextResponse.json({ error: "That doesn't look like an X handle." }, { status: 400 });
  const x = await readX(h).catch(() => null);
  if (!x) return NextResponse.json({ error: `Couldn't read @${h} on X right now. We'll try again when we build.`, handle: h }, { status: 404 });
  return NextResponse.json({ handle: x.profile.handle, name: x.profile.name, avatar: x.profile.avatar, followers: x.profile.followers, posts: x.posts.length });
}
