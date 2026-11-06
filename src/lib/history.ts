import type { Project, SiteSpec } from "./spec";

// Version history: every change saves the spec as it was just before, with what the change was. history[] keeps the
// specs (oldest first, at most KEEP); historyMeta[] runs alongside with when and why. Sites from before history had
// labels get "Earlier version" for their old entries.

const KEEP = 30;

export interface VersionMeta { at: number; label: string }

const short = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > 80 ? `${t.slice(0, 79)}…` : t; };

function aligned(q: Project): VersionMeta[] {
  const m = (q.historyMeta ?? []).slice(-q.history.length);
  while (m.length < q.history.length) m.unshift({ at: 0, label: "Earlier version" });
  return m;
}

/** Saves the current spec as a version before a change described by `label`. */
export function snapshot(q: Project, label: string): void {
  if (!q.spec) return;
  const m = aligned(q);
  q.history.push(structuredClone(q.spec));
  m.push({ at: Date.now(), label: short(label) || "A change" });
  while (q.history.length > KEEP) { q.history.shift(); m.shift(); }
  q.historyMeta = m;
}

/** Takes the newest saved version off (undo). */
export function popVersion(q: Project): SiteSpec | undefined {
  const m = aligned(q);
  const s = q.history.pop();
  m.pop();
  q.historyMeta = m;
  return s;
}

/** Puts version i back; the current spec is saved first so a restore can itself be undone. */
export function restoreVersion(q: Project, i: number): boolean {
  const spec = q.history[i];
  if (!spec || !q.spec) return false;
  const when = aligned(q)[i]?.at;
  snapshot(q, `Before restoring the version from ${when ? new Date(when).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "earlier"}`);
  q.spec = structuredClone(spec);
  q.version += 1;
  return true;
}

/** What the builder lists: newest first, without the specs. */
export const versionsView = (p: Project) => aligned(p).map((m, i) => ({ i, at: m.at, label: m.label })).reverse();
