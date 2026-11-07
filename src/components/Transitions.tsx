"use client";

import type { ReactNode } from "react";
import { GlimmProvider } from "glimm/next";

// glimm's WebGL sweep for the one navigation that deserves it: the first prompt on the landing page opening its build.
// The provider sits at the root so the band survives the route change; no other link is intercepted.
export function Transitions({ children }: { children: ReactNode }) {
  return (
    <GlimmProvider palette="lagoon" brightness={0.8} sweepMs={1000}>
      {children}
    </GlimmProvider>
  );
}
