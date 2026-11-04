"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PublicUser } from "@/lib/accounts";

// Who's signed in, shared by every account control on the page. Fetched once; refresh() after sign-in or out.

type State = { user: PublicUser | null; loaded: boolean };
let state: State = { user: null, loaded: false };
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const set = (s: State) => { state = s; subs.forEach((f) => f()); };

export function refreshSession(): Promise<void> {
  inflight = fetch("/api/auth/session", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { user: PublicUser | null }) => set({ user: j.user, loaded: true }))
    .catch(() => set({ user: null, loaded: true }))
    .finally(() => { inflight = null; });
  return inflight;
}

export function setSessionUser(user: PublicUser | null) { set({ user, loaded: true }); }

const SERVER: State = { user: null, loaded: false };

export function useSession(): State {
  useEffect(() => { if (!state.loaded && !inflight) void refreshSession(); }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => SERVER);
}

/** Opens the sign-in dialog from anywhere (the build limit message, the pricing page). */
export const openSignIn = () => window.dispatchEvent(new CustomEvent("sitesmith:signin"));
