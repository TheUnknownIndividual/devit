import type { NextRequest } from "next/server";
import { publicOrigin } from "./google";
import type { ExportFile } from "./export";

// GitHub: sign in with it, and connect it to push a site's code to a repo (bolt.new's flow). One OAuth app
// (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET), callback /api/auth/github/callback. Sign-in asks only for the profile and
// email; "Connect GitHub" asks for `repo` too, so the token can create the repo and commit. Tokens are sealed on disk.

export const githubOn = () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
export const GH_STATE_COOKIE = "ss_github";
export const githubCallback = (req: NextRequest) => `${publicOrigin(req)}/api/auth/github/callback`;
export type GithubIntent = "signin" | "connect";
export const scopeFor = (intent: GithubIntent) => (intent === "connect" ? "repo read:user user:email" : "read:user user:email");

const API = "https://api.github.com";
const UA = "devit";

export interface GithubUser { id: number; login: string; name: string | null; avatar: string | null; email: string | null }

export async function exchangeCode(code: string, redirectUri: string): Promise<{ token: string; scopes: string[] }> {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string };
  if (!j.access_token) throw new Error(j.error === "redirect_uri_mismatch" ? "This address isn't the GitHub app's callback URL." : "GitHub didn't confirm the sign-in.");
  return { token: j.access_token, scopes: (j.scope ?? "").split(/[,\s]+/).filter(Boolean) };
}

async function gh<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": UA, ...(init?.body ? { "content-type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { message?: string; errors?: Array<{ message?: string }> };
  if (!r.ok) {
    const e = new Error(r.status === 401 ? "GitHub no longer accepts this connection. Connect GitHub again." : j.errors?.[0]?.message || j.message || `GitHub said ${r.status}`) as Error & { status: number };
    e.status = r.status;
    throw e;
  }
  return j;
}

export async function githubUser(token: string): Promise<GithubUser> {
  const u = await gh<{ id: number; login: string; name: string | null; avatar_url?: string; email: string | null }>(token, "/user");
  let email = u.email;
  if (!email) {
    const list = await gh<Array<{ email: string; primary: boolean; verified: boolean }>>(token, "/user/emails").catch(() => []);
    email = list.find((e) => e.primary && e.verified)?.email ?? null;
  }
  const avatar = u.avatar_url && /^https:\/\/avatars\.githubusercontent\.com\//.test(u.avatar_url) ? u.avatar_url.slice(0, 500) : null;
  return { id: u.id, login: u.login, name: u.name?.slice(0, 80) ?? null, avatar, email: email?.toLowerCase() ?? null };
}

export interface RepoItem { full: string; private: boolean; description: string | null; pushedAt: number }

/** Repos the token can see (own, collaborator, org member), newest push first; up to 200. */
export async function githubRepos(token: string): Promise<RepoItem[]> {
  const out: RepoItem[] = [];
  for (let page = 1; page <= 2; page++) {
    const list = await gh<Array<{ full_name: string; private: boolean; description: string | null; pushed_at: string | null; archived?: boolean }>>(token, `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`);
    for (const r of list) out.push({ full: r.full_name, private: r.private, description: r.description?.slice(0, 160) ?? null, pushedAt: Date.parse(r.pushed_at ?? "") || 0 });
    if (list.length < 100) break;
  }
  return out;
}

/** GET with a token, for reading a repo the person can see (private ones too, with the repo scope). */
export const ghRead = <T>(token: string, path: string) => gh<T>(token, path);

const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
export const validRepoName = (s: string) => REPO_RE.test(s) && !/^\.+$/.test(s);

/**
 * Pushes the files as one commit. `repo` is "owner/name" for a later push to the repo made before; without it a new repo
 * is made under the signed-in GitHub user. Returns where it went and the commit.
 */
export async function pushFiles(token: string, files: ExportFile[], opts: { repo?: string; name: string; private: boolean; description: string; message: string }): Promise<{ repo: string; url: string; sha: string; branch: string }> {
  let full = opts.repo;
  let branch = "main";
  if (full) {
    const r = await gh<{ full_name: string; default_branch: string }>(token, `/repos/${full}`);
    full = r.full_name;
    branch = r.default_branch;
  } else {
    // auto_init makes the first commit, so the Git Data API has a branch to build on (an empty repo has none).
    const r = await gh<{ full_name: string; default_branch: string }>(token, "/user/repos", { method: "POST", body: { name: opts.name, private: opts.private, description: opts.description.slice(0, 300), auto_init: true } });
    full = r.full_name;
    branch = r.default_branch || "main";
  }
  const ref = await retry(() => gh<{ object: { sha: string } }>(token, `/repos/${full}/git/ref/heads/${branch}`));
  const parent = await gh<{ tree: { sha: string } }>(token, `/repos/${full}/git/commits/${ref.object.sha}`);
  const tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const f of files) {
    const b = await gh<{ sha: string }>(token, `/repos/${full}/git/blobs`, { method: "POST", body: { content: f.data.toString("base64"), encoding: "base64" } });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha });
  }
  const t = await gh<{ sha: string }>(token, `/repos/${full}/git/trees`, { method: "POST", body: { base_tree: parent.tree.sha, tree } });
  const c = await gh<{ sha: string }>(token, `/repos/${full}/git/commits`, { method: "POST", body: { message: opts.message, tree: t.sha, parents: [ref.object.sha] } });
  await gh(token, `/repos/${full}/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: c.sha } });
  return { repo: full, url: `https://github.com/${full}`, sha: c.sha, branch };
}

// A just-made repo's branch can take a moment to show up.
async function retry<T>(fn: () => Promise<T>, n = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= n || (e as { status?: number }).status !== 404 && (e as { status?: number }).status !== 409) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
}
