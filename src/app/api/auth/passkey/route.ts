import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { completeMethod, publicUser, putChallenge, siteOrigin, sweepChallenges, takeChallenge, updateUser, userByMethod, viewer } from "@/lib/accounts";
import { token } from "@/lib/secrets";
import { overLimit } from "@/lib/net";

// Passkeys (WebAuthn). Discoverable credentials, so signing in needs no username: the browser offers this device's
// passkeys, synced ones (iCloud Keychain, Google Password Manager, 1Password…) and "use a phone" by QR code.

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("options"), mode: z.enum(["register", "login"]) }),
  z.object({ step: z.literal("verify"), mode: z.enum(["register", "login"]), id: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/), response: z.record(z.string(), z.unknown()) }),
]);

export async function POST(req: Request) {
  const limited = overLimit(req, "passkey", 60);
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const site = siteOrigin(req);
  if (!site) return NextResponse.json({ error: "Passkeys need the page's own origin." }, { status: 400 });
  const b = parsed.data;
  void sweepChallenges();

  if (b.step === "options") {
    const id = token(16);
    if (b.mode === "register") {
      const { user } = await viewer();
      const options = await generateRegistrationOptions({
        rpName: "devit",
        rpID: site.rpID,
        userName: user?.email || user?.name || `devit-${id.slice(0, 5).toLowerCase()}`,
        userDisplayName: user?.name || user?.email || "devit",
        attestationType: "none",
        excludeCredentials: (user?.methods ?? []).filter((m) => m.kind === "passkey").map((m) => ({ id: m.id, transports: m.passkey?.transports })),
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      });
      await putChallenge(`pk-${id}`, { challenge: options.challenge, mode: "register" }, 5 * 60_000);
      return NextResponse.json({ id, options });
    }
    const options = await generateAuthenticationOptions({ rpID: site.rpID, userVerification: "preferred" });
    await putChallenge(`pk-${id}`, { challenge: options.challenge, mode: "login" }, 5 * 60_000);
    return NextResponse.json({ id, options });
  }

  const ch = await takeChallenge<{ challenge: string; mode: string }>(`pk-${b.id}`);
  if (!ch || ch.mode !== b.mode) return NextResponse.json({ error: "That took too long. Try again." }, { status: 400 });

  if (b.mode === "register") {
    const v = await verifyRegistrationResponse({
      response: b.response as unknown as RegistrationResponseJSON, expectedChallenge: ch.challenge, expectedOrigin: site.origin, expectedRPID: site.rpID,
    }).catch(() => null);
    if (!v?.verified) return NextResponse.json({ error: "The passkey didn't check out. Try again." }, { status: 400 });
    const c = v.registrationInfo.credential;
    const out = await completeMethod({
      kind: "passkey", id: c.id, at: Date.now(),
      label: v.registrationInfo.credentialDeviceType === "multiDevice" ? "Synced passkey" : "Device passkey",
      passkey: { publicKey: Buffer.from(c.publicKey).toString("base64url"), counter: c.counter, transports: c.transports },
    });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });
    return NextResponse.json({ user: publicUser(out.user), linked: out.linked });
  }

  const resp = b.response as unknown as AuthenticationResponseJSON;
  const owner = typeof resp.id === "string" ? await userByMethod("passkey", resp.id) : null;
  const m = owner?.methods.find((x) => x.kind === "passkey" && x.id === resp.id);
  if (!owner || !m?.passkey) return NextResponse.json({ error: "That passkey isn't linked to an account here. Create one first." }, { status: 404 });
  const v = await verifyAuthenticationResponse({
    response: resp, expectedChallenge: ch.challenge, expectedOrigin: site.origin, expectedRPID: site.rpID,
    credential: { id: m.id, publicKey: new Uint8Array(Buffer.from(m.passkey.publicKey, "base64url")), counter: m.passkey.counter, transports: m.passkey.transports },
  }).catch(() => null);
  if (!v?.verified) return NextResponse.json({ error: "The passkey didn't check out. Try again." }, { status: 400 });
  await updateUser(owner.id, (u) => { const x = u.methods.find((y) => y.kind === "passkey" && y.id === m.id); if (x?.passkey) x.passkey.counter = v.authenticationInfo.newCounter; });
  const out = await completeMethod(m);
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ user: publicUser(out.user), linked: out.linked });
}
