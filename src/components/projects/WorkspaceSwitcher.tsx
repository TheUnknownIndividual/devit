"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus, User, Users } from "lucide-react";
import { Menu } from "@/components/ui/Menu";

/** Personal or one of your teams: which projects /projects lists. */
export function WorkspaceSwitcher({ current, teams }: { current: string | null; teams: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const name = teams.find((t) => t.id === current)?.name ?? "Personal";
  return (
    <Menu
      label="Workspace"
      align="right"
      width={240}
      value={current ?? "personal"}
      onPick={(v: string) => router.push(v === "new" ? "/settings#team" : v === "personal" ? "/projects" : `/projects?w=${encodeURIComponent(v)}`)}
      items={[
        { value: "personal", label: "Personal", icon: <User size={15} /> },
        ...teams.map((t) => ({ value: t.id, label: t.name, icon: <Users size={15} /> })),
        { value: "new", label: teams.length ? "Manage teams" : "Create a team", icon: <Plus size={15} /> },
      ]}
      trigger={(o) => (
        <button type="button" className="btn btn-outline max-w-[160px] sm:max-w-[220px]" aria-label={`Workspace: ${name}`}>
          {current ? <Users size={15} className="shrink-0" /> : <User size={15} className="shrink-0" />}<span className="truncate">{name}</span><ChevronDown size={14} className={`shrink-0 text-zinc-500 ${o ? "rotate-180" : ""}`} />
        </button>
      )}
    />
  );
}
