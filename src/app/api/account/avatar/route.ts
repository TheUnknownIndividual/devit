import { NextResponse } from "next/server";
import { publicUser, updateUser, viewer } from "@/lib/accounts";
import { dropAvatar, saveAvatar } from "@/lib/avatars";
import { sniff } from "@/lib/uploads";

// Your own account picture: the browser crops and re-encodes it to 256px first; we only take a real image, 256 KB at most.
export async function POST(req: Request) {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > 256 * 1024) return NextResponse.json({ error: "That picture is too big. Pick a smaller one." }, { status: 413 });
  const ext = sniff(bytes);
  if (!ext) return NextResponse.json({ error: "That isn't a PNG, JPEG, WebP or GIF." }, { status: 400 });
  await saveAvatar(user.id, ext, bytes);
  const u = await updateUser(user.id, (u) => { u.avatar = `/api/avatar/${u.id}?v=${Date.now().toString(36)}`; });
  return NextResponse.json({ user: u ? publicUser(u) : null });
}

/** Back to the Google picture or the generated one. */
export async function DELETE() {
  const { user } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await dropAvatar(user.id);
  const u = await updateUser(user.id, (u) => { u.avatar = null; });
  return NextResponse.json({ user: u ? publicUser(u) : null });
}
