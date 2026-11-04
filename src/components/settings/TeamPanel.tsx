"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy, Eye, Link2, Loader2, LogOut, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { Avatar } from "@/components/account/AccountMenu";
import { Dialog } from "@/components/ui/Dialog";
import { Menu } from "@/components/ui/Menu";
import type { TeamView } from "@/lib/team-view";

type Role = "editor" | "viewer";
const ROLES = [
  { value: "editor" as Role, label: "Editor", hint: "edits, publishes", icon: <Pencil size={14} /> },
  { value: "viewer" as Role, label: "Viewer", hint: "looks only", icon: <Eye size={14} /> },
];
const ROLE_NAME = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function send(method: string, path: string, body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
}

/** Settings → Team: your teams, their members and invites. Owners manage; members see who's in and can leave. */
export function TeamPanel({ initial, canCreate, me }: { initial: TeamView[]; canCreate: boolean; me: string }) {
  const router = useRouter();
  const [teams, setTeams] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id ?? null);
  const [creating, setCreating] = useState(!initial.length && canCreate);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(canCreate ? null : "Team workspaces are on the Team plan: five seats, shared projects, and owner, editor and viewer roles.");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [made, setMade] = useState<{ url: string; emailed: boolean | null; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | "delete" | "leave">(null);
  const t = teams.find((x) => x.id === sel) ?? null;
  const owner = t?.role === "owner";

  const put = (team: TeamView) => setTeams((all) => all.map((x) => (x.id === team.id ? team : x)));
  const drop = (id: string) => { const rest = teams.filter((x) => x.id !== id); setTeams(rest); setSel(rest[0]?.id ?? null); setMade(null); };

  async function act(key: string, method: string, path: string, body?: unknown) {
    setBusy(key); setError(null);
    const r = await send(method, path, body);
    setBusy(null);
    if (!r.ok) {
      if (r.status === 402) setUpgrade(r.j.error ?? "That's on the Team plan.");
      setError(r.j.error ?? "That didn't work. Try again.");
    }
    return r;
  }

  async function create() {
    const r = await act("create", "POST", "/api/teams", { name: newName });
    if (!r.ok) return;
    setTeams((all) => [...all, r.j.team]); setSel(r.j.team.id); setCreating(false); setNewName(""); router.refresh();
  }

  async function invite() {
    if (!t) return;
    const email = inviteEmail.trim();
    const r = await act("invite", "POST", `/api/teams/${t.id}/invites`, { role: inviteRole, email });
    if (!r.ok) return;
    put(r.j.team); setMade({ url: r.j.url, emailed: r.j.emailed, email }); setCopied(false); setInviteEmail("");
  }

  async function copy() {
    if (!made) return;
    await navigator.clipboard.writeText(made.url).catch(() => undefined);
    setCopied(true);
  }

  if (!teams.length && !creating) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-white/[0.08] bg-ink-850 p-4">
        <Users size={16} className="shrink-0 text-zinc-500" />
        <p className="min-w-0 flex-1 text-[13px] text-zinc-300">{upgrade ?? "No teams yet. Make one and invite up to four people."}</p>
        {upgrade ? <Link href="/pricing" className="btn btn-primary">Upgrade to Team <ArrowUpRight size={14} /></Link> : <button type="button" className="btn btn-outline" onClick={() => setCreating(true)}><Plus size={15} /> New team</button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {teams.length > 0 && (
          <Menu
            label="Team"
            value={sel ?? undefined}
            width={240}
            onPick={(id: string) => { setSel(id); setMade(null); setError(null); setCreating(false); }}
            items={teams.map((x) => ({ value: x.id, label: x.name, hint: ROLE_NAME[x.role], icon: <Users size={14} /> }))}
            trigger={(o) => <button type="button" className="btn btn-outline max-w-[240px]"><Users size={15} className="shrink-0" /><span className="truncate">{t?.name ?? "Pick a team"}</span><ChevronDown size={14} className={`shrink-0 text-zinc-500 ${o ? "rotate-180" : ""}`} /></button>}
          />
        )}
        {canCreate && !creating && <button type="button" className="btn btn-ghost" onClick={() => { setCreating(true); setError(null); }}><Plus size={15} /> New team</button>}
      </div>

      {creating && (
        <form className="flex max-w-[460px] gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <input className="field" autoFocus value={newName} maxLength={60} placeholder="Team name" aria-label="Team name" onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn btn-primary h-10" disabled={!newName.trim() || busy === "create"}>{busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create</button>
          {teams.length > 0 && <button type="button" className="btn btn-ghost btn-icon h-10 w-10" aria-label="Cancel" onClick={() => setCreating(false)}><X size={15} /></button>}
        </form>
      )}

      {upgrade && error && <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-amber-200">{error} <Link href="/pricing" className="inline-flex items-center gap-1 text-white underline">See plans <ArrowUpRight size={12} /></Link></p>}
      {!upgrade && error && <p role="alert" className="text-[12.5px] text-amber-200">{error}</p>}

      {t && !creating && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {renaming !== null ? (
              <form className="flex min-w-0 flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await act("rename", "PATCH", `/api/teams/${t.id}`, { name: renaming }); if (r.ok) { put(r.j.team); setRenaming(null); router.refresh(); } }}>
                <input className="field h-9 max-w-[320px]" autoFocus value={renaming} maxLength={60} aria-label="Team name" onChange={(e) => setRenaming(e.target.value)} />
                <button type="submit" className="btn btn-outline h-9" disabled={!renaming.trim() || busy === "rename"}><Check size={14} /> Save</button>
                <button type="button" className="btn btn-ghost h-9" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-[14px] font-medium text-white">{t.name}</span>
                {owner && <button type="button" className="btn btn-ghost btn-icon h-7 w-7" aria-label="Rename team" onClick={() => setRenaming(t.name)}><Pencil size={13} /></button>}
                <Link href={`/projects?w=${t.id}`} className="inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-white">Projects <ArrowUpRight size={12} /></Link>
              </div>
            )}
            <div className="w-full sm:w-auto">
              <div className="text-[12px] text-zinc-400">{t.seats.used} of {t.seats.limit} seats used</div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-white/[0.06] sm:w-[160px]"><div className="h-full bg-lime" style={{ width: `${Math.min(100, (t.seats.used / Math.max(1, t.seats.limit)) * 100)}%` }} /></div>
            </div>
          </div>

          {!t.active && (
            <p className="rounded-[10px] border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[12.5px] text-amber-200">
              {owner ? <>Your Team plan has run out. Members can still open the team&apos;s projects but not change them, and invites are paused. <Link href="/pricing" className="text-white underline">Renew</Link></> : "This team's plan has run out. You can still open its projects; changes are paused until the owner renews."}
            </p>
          )}

          <ul className="divide-y divide-white/[0.06] rounded-[12px] border border-white/[0.08]">
            {t.members.map((m) => (
              <li key={m.userId} className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Avatar initial={m.initial} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-white">{m.name}{m.userId === me && <span className="text-zinc-500"> (you)</span>}</div>
                  <div className="truncate text-[11.5px] text-zinc-500">{m.email && m.email !== m.name ? `${m.email} · ` : ""}joined {day(m.joinedAt)}</div>
                </div>
                {owner && m.role !== "owner" ? (
                  <>
                    <Menu
                      label={`Role for ${m.name}`}
                      align="right"
                      width={220}
                      value={m.role as Role}
                      onPick={async (role: Role) => { const r = await act(`role:${m.userId}`, "PATCH", `/api/teams/${t.id}/members`, { userId: m.userId, role }); if (r.ok) put(r.j.team); }}
                      items={ROLES}
                      trigger={(o) => <button type="button" className="btn btn-outline h-8 px-2.5 text-[12.5px]" disabled={busy === `role:${m.userId}`}>{ROLE_NAME[m.role]}<ChevronDown size={13} className={`text-zinc-500 ${o ? "rotate-180" : ""}`} /></button>}
                    />
                    <button type="button" className="btn btn-ghost btn-icon h-8 w-8" aria-label={`Remove ${m.name}`} title="Remove from team" disabled={busy === `rm:${m.userId}`} onClick={async () => { const r = await act(`rm:${m.userId}`, "DELETE", `/api/teams/${t.id}/members?userId=${encodeURIComponent(m.userId)}`); if (r.ok) put(r.j.team); }}>
                      {busy === `rm:${m.userId}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </>
                ) : (
                  <span className="text-[12px] text-zinc-400">{ROLE_NAME[m.role]}</span>
                )}
              </li>
            ))}
            {t.invites.map((i) => (
              <li key={i.id} className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-dashed border-white/15 text-zinc-500"><Link2 size={13} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-zinc-300">{i.email ?? "Invite link"}</div>
                  <div className="text-[11.5px] text-zinc-500">Pending · {ROLE_NAME[i.role]} · until {day(i.expiresAt)}</div>
                </div>
                <button type="button" className="btn btn-ghost h-8 px-2 text-[12px]" disabled={busy === `inv:${i.id}`} onClick={async () => { const r = await act(`inv:${i.id}`, "DELETE", `/api/teams/${t.id}/invites?id=${encodeURIComponent(i.id)}`); if (r.ok) put(r.j.team); }}>Revoke</button>
              </li>
            ))}
          </ul>

          {owner && (
            <div className="space-y-2">
              <h3 className="text-[12px] font-medium text-zinc-400">Invite someone</h3>
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void invite(); }}>
                <input className="field h-10 min-w-0 flex-1 basis-[220px]" type="email" inputMode="email" placeholder="Email (optional)" aria-label="Email to invite" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                <Menu
                  label="Invite role"
                  align="right"
                  width={220}
                  value={inviteRole}
                  onPick={(r: Role) => setInviteRole(r)}
                  items={ROLES}
                  trigger={(o) => <button type="button" className="btn btn-outline h-10">{ROLE_NAME[inviteRole]}<ChevronDown size={14} className={`text-zinc-500 ${o ? "rotate-180" : ""}`} /></button>}
                />
                <button type="submit" className="btn btn-primary h-10" disabled={busy === "invite" || !t.active || t.seats.used >= t.seats.limit}>
                  {busy === "invite" ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} {inviteEmail.trim() ? "Send invite" : "Create link"}
                </button>
              </form>
              {t.seats.used >= t.seats.limit && <p className="text-[12px] text-zinc-500">All seats are taken. Remove someone or revoke an invite to free one.</p>}
              {made && (
                <div className="rounded-[12px] border border-white/[0.08] bg-ink-850 p-3">
                  <p className="text-[12px] text-zinc-400">
                    {made.emailed ? `Sent to ${made.email}. You can also share this link:` : made.email && made.emailed === false ? `The email to ${made.email} didn't go out. Share this link instead:` : made.email ? "Email isn't set up on this server. Send them this link:" : "Share this link. It works once, for 7 days:"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input className="field h-9 min-w-0 flex-1 font-mono text-[12px]" readOnly value={made.url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn btn-outline h-9" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end border-t border-white/[0.06] pt-3">
            {owner
              ? <button type="button" className="btn btn-ghost h-8 px-2 text-[12.5px] text-red-300" onClick={() => setConfirm("delete")}><Trash2 size={14} /> Delete team</button>
              : <button type="button" className="btn btn-ghost h-8 px-2 text-[12.5px]" onClick={() => setConfirm("leave")}><LogOut size={14} /> Leave team</button>}
          </div>
        </>
      )}

      <Dialog
        open={!!confirm && !!t}
        onClose={() => setConfirm(null)}
        title={confirm === "delete" ? "Delete team" : "Leave team"}
        icon={confirm === "delete" ? <Trash2 size={15} /> : <LogOut size={15} />}
        width={420}
        footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button
            type="button"
            className="btn border border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25"
            disabled={busy === "confirm"}
            onClick={async () => {
              if (!t) return;
              const r = await act("confirm", "DELETE", confirm === "delete" ? `/api/teams/${t.id}` : `/api/teams/${t.id}/members?userId=${encodeURIComponent(me)}`);
              setConfirm(null);
              if (r.ok) { drop(t.id); router.refresh(); }
            }}
          >
            {busy === "confirm" ? <Loader2 size={15} className="animate-spin" /> : confirm === "delete" ? <Trash2 size={15} /> : <LogOut size={15} />} {confirm === "delete" ? "Delete" : "Leave"}
          </button>
        </>}
      >
        <p className="p-5 text-[13.5px] leading-relaxed text-zinc-300">
          {confirm === "delete"
            ? <>Delete <span className="font-medium text-white">{t?.name}</span>? Everyone loses access to its projects; each project goes back to the person who made it. Nothing is deleted but the team.</>
            : <>Leave <span className="font-medium text-white">{t?.name}</span>? You lose access to its projects, except ones you made yourself.</>}
        </p>
      </Dialog>
    </div>
  );
}
