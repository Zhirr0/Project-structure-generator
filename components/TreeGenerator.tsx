"use client";

import { useRef, useState, useTransition } from "react";

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
};

type Mode = "file" | "github";

const ALWAYS_BLOCKED = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  ".turbo",
  ".vercel",
  "out",
  ".cache",
]);

const SOFT_OPTIONS = [
  { label: "coverage", value: "coverage" },
  { label: "tmp", value: "tmp" },
  { label: "logs", value: "logs" },
  { label: ".DS_Store", value: ".DS_Store" },
  { label: "*.log", value: ".log" },
];

function makeNode(name: string, path: string, isFile: boolean): TreeNode {
  return { name, path, children: new Map(), isFile };
}

function buildTreeFromPaths(
  paths: string[],
  softExcludes: Set<string>,
): TreeNode {
  const root = makeNode("root", "", false);
  for (const relativePath of paths) {
    const parts = relativePath.split("/");
    let skip = false;
    for (const seg of parts) {
      if (ALWAYS_BLOCKED.has(seg) || softExcludes.has(seg)) {
        skip = true;
        break;
      }
      if (softExcludes.has(".log") && seg.endsWith(".log")) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    let cur = root;
    for (let j = 0; j < parts.length; j++) {
      const seg = parts[j];
      const nodePath = parts.slice(0, j + 1).join("/");
      const isFile = j === parts.length - 1;
      if (!cur.children.has(seg))
        cur.children.set(seg, makeNode(seg, nodePath, isFile));
      cur = cur.children.get(seg)!;
    }
  }
  return root;
}

function buildTree(
  files: FileList,
  softExcludes: Set<string>,
): { root: TreeNode; paths: string[] } {
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i] as File & { webkitRelativePath: string };
    // Strip the root folder name (first segment)
    const parts = f.webkitRelativePath.split("/");
    const relativePath = parts.slice(1).join("/");
    if (relativePath) paths.push(relativePath);
  }
  const root = buildTreeFromPaths(paths, softExcludes);
  return { root, paths };
}

function collectDirs(node: TreeNode, result: TreeNode[] = []): TreeNode[] {
  for (const child of node.children.values()) {
    if (!child.isFile) {
      result.push(child);
      collectDirs(child, result);
    }
  }
  return result;
}

function sorted(node: TreeNode): TreeNode[] {
  const dirs: TreeNode[] = [],
    files: TreeNode[] = [];
  for (const c of node.children.values()) (c.isFile ? files : dirs).push(c);
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function renderNode(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  collapsed: Set<string>,
): string {
  const conn = isLast ? "└── " : "├── ";
  const childPfx = prefix + (isLast ? "    " : "│   ");
  let out = prefix + conn + node.name + (node.isFile ? "" : "/") + "\n";
  if (!node.isFile && !collapsed.has(node.path)) {
    const kids = sorted(node);
    kids.forEach((k, i) => {
      out += renderNode(k, childPfx, i === kids.length - 1, collapsed);
    });
  }
  return out;
}

function generateTree(root: TreeNode, collapsed: Set<string>): string {
  const kids = sorted(root);
  let out = ".\n";
  kids.forEach((k, i) => {
    out += renderNode(k, "", i === kids.length - 1, collapsed);
  });
  return out.trim();
}

function parseGithubUrl(
  url: string,
): { owner: string; repo: string; branch?: string } | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo, , branch] = parts;
    return { owner, repo: repo.replace(/\.git$/, ""), branch };
  } catch {
    return null;
  }
}

async function fetchGithubTree(
  owner: string,
  repo: string,
  branch: string,
): Promise<{ paths: string[]; truncated: boolean }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  );
  if (res.status === 404)
    throw new Error(
      "Repo not found. It may be private or the branch doesn't exist.",
    );
  if (res.status === 403)
    throw new Error(
      "GitHub API rate limit exceeded. Try again in a few minutes.",
    );
  if (!res.ok)
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const paths: string[] = (data.tree as { path: string; type: string }[])
    .filter((item) => item.type === "blob")
    .map((item) => item.path);
  return { paths, truncated: !!data.truncated };
}

async function resolveDefaultBranch(
  owner: string,
  repo: string,
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!res.ok) throw new Error("Could not resolve default branch.");
  const data = await res.json();
  return data.default_branch ?? "main";
}

export default function TreeGenerator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("file");
  const [githubUrl, setGithubUrl] = useState("");
  const [githubError, setGithubError] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [truncatedWarning, setTruncatedWarning] = useState(false);
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);
  const [allDirs, setAllDirs] = useState<TreeNode[]>([]);
  const [projectName, setProjectName] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [softExcludes, setSoftExcludes] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const tree = rootNode ? generateTree(rootNode, collapsed) : "";
  const lineCount = tree ? tree.split("\n").length : 0;

  function applyTree(root: TreeNode, name: string, count: number) {
    const dirs = collectDirs(root);
    setProjectName(name);
    setFileCount(count);
    setRootNode(root);
    setAllDirs(dirs);
    setCollapsed(new Set());
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const files = e.target.files;
    startTransition(() => {
      const first = files[0] as File & { webkitRelativePath: string };
      const name = first.webkitRelativePath.split("/")[0];
      const { root } = buildTree(files, softExcludes);
      applyTree(root, name, files.length);
    });
  }

  async function handleGithubFetch() {
    setGithubError("");
    setTruncatedWarning(false);
    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      setGithubError("Invalid GitHub URL. Use: https://github.com/owner/repo");
      return;
    }
    setIsFetching(true);
    try {
      const { owner, repo } = parsed;
      let branch = parsed.branch;
      if (!branch) {
        branch = await resolveDefaultBranch(owner, repo);
      }
      const { paths, truncated } = await fetchGithubTree(owner, repo, branch);
      if (truncated) setTruncatedWarning(true);
      const root = buildTreeFromPaths(paths, softExcludes);
      applyTree(root, repo, paths.length);
    } catch (err: unknown) {
      setGithubError(
        err instanceof Error ? err.message : "Failed to fetch repo.",
      );
    } finally {
      setIsFetching(false);
    }
  }

  function toggleSoft(val: string) {
    setSoftExcludes((prev) => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  }

  function toggleCollapse(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(tree);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleReset() {
    setRootNode(null);
    setAllDirs([]);
    setProjectName("");
    setFileCount(0);
    setCollapsed(new Set());
    setGithubError("");
    setTruncatedWarning(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function switchMode(m: Mode) {
    setMode(m);
    handleReset();
    setGithubUrl("");
  }

  const dirsByDepth = allDirs.reduce<Map<number, TreeNode[]>>((acc, d) => {
    const depth = d.path.split("/").length;
    if (!acc.has(depth)) acc.set(depth, []);
    acc.get(depth)!.push(d);
    return acc;
  }, new Map());

  const depthLevels = Array.from(dirsByDepth.keys()).sort((a, b) => a - b);
  const isLoading = isPending || isFetching;

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="label">Dev Tool</span>
          <span className="w-px h-[10px] bg-border-hi" />
          <span className="text-[10px] text-text-4">
            runs locally, nothing uploaded
          </span>
        </div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.04em] text-text leading-[1.1] mb-2">
          project <span className="text-accent">struct</span>
        </h1>
        <p className="text-[12px] text-text-3">
          Scan any folder → get a clean ASCII tree. Pick which dirs to collapse.
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
          <span className="text-[10px] text-text-4 mr-1">always excluded:</span>
          {[...ALWAYS_BLOCKED].sort().map((b) => (
            <span key={b} className="tag-locked">
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1.5 p-1 bg-surface border border-border rounded-card w-fit">
        <button
          onClick={() => switchMode("file")}
          className={mode === "file" ? "mode-tab-active" : "mode-tab"}
        >
          <span className="text-[11px]">⌘</span>
          File Upload
        </button>
        <button
          onClick={() => switchMode("github")}
          className={mode === "github" ? "mode-tab-active" : "mode-tab"}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub Repo URL
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="label">
            {mode === "file" ? "Folder" : "Repository"}
          </span>
          {rootNode && (
            <div className="flex items-center gap-2">
              <span className="stat-pill">
                <strong>{fileCount.toLocaleString()}</strong> files
              </span>
              <span className="stat-pill">
                <strong>{allDirs.length}</strong> dirs
              </span>
            </div>
          )}
        </div>
        <div className="card-body flex flex-col gap-[18px]">
          {mode === "file" ? (
            <div
              className={`drop-zone ${rootNode ? "drop-zone-filled" : ""}`}
              onClick={() => inputRef.current?.click()}
            >
              {isLoading ? (
                <div className="flex items-center gap-2.5">
                  <span className="scanning-dot" />
                  <span className="text-[12px] text-text-2">scanning…</span>
                </div>
              ) : rootNode ? (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <span className="text-accent text-[11px]">✦</span>
                    <span className="text-text font-bold text-[13px]">
                      /{projectName}
                    </span>
                  </div>
                  <span className="text-text-3 text-[11px]">
                    click to choose a different folder
                  </span>
                </div>
              ) : (
                <>
                  <span className="text-[22px] leading-none text-text-3">
                    ⌘
                  </span>
                  <span className="text-text-3 text-[12px]">
                    click to select project folder
                  </span>
                  <span className="text-text-4 text-[11px]">
                    node_modules, .next, dist, build automatically skipped
                  </span>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                {...({
                  webkitdirectory: "true",
                  directory: "true",
                } as React.InputHTMLAttributes<HTMLInputElement>)}
                multiple
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => {
                    setGithubUrl(e.target.value);
                    setGithubError("");
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !isLoading && handleGithubFetch()
                  }
                  placeholder="https://github.com/owner/repo"
                  className="github-input"
                  disabled={isLoading}
                />
                <button
                  onClick={handleGithubFetch}
                  disabled={isLoading || !githubUrl.trim()}
                  className="btn-accent shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="scanning-dot" />
                      <span>scanning…</span>
                    </span>
                  ) : (
                    "Scan Repo"
                  )}
                </button>
              </div>

              {githubError && (
                <div className="github-error">
                  <span className="text-[11px]">⚠</span>
                  {githubError}
                </div>
              )}

              {truncatedWarning && (
                <div className="github-warning">
                  <span className="text-[11px]">⚠</span>
                  This repo exceeds GitHub&apos;s tree limit (100k+ files).
                  Output may be incomplete.
                </div>
              )}

              {rootNode && !isLoading && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-accent/7 border border-accent/20 rounded-zone">
                  <span className="text-accent text-[11px]">✦</span>
                  <span className="text-text font-bold text-[12px]">
                    {projectName}
                  </span>
                  <span className="text-text-3 text-[11px] ml-auto">
                    click &apos;Scan Repo&apos; to refresh
                  </span>
                </div>
              )}

              <p className="text-[10px] text-text-4">
                Public repos only · uses GitHub REST API · 60 requests/hr
                unauthenticated
              </p>
            </div>
          )}

          <div>
            <span className="label block mb-2.5">Additional Excludes</span>
            <div className="flex flex-wrap gap-1.5">
              {SOFT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleSoft(opt.value)}
                  className={
                    softExcludes.has(opt.value) ? "tag tag-on" : "tag tag-off"
                  }
                >
                  {softExcludes.has(opt.value) && (
                    <span className="text-[10px]">✕</span>
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {allDirs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="label">Collapse Directories</span>
            <div className="flex gap-1.5">
              <button
                className="btn-ghost"
                onClick={() => setCollapsed(new Set())}
              >
                expand all
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  setCollapsed(new Set(allDirs.map((d) => d.path)))
                }
              >
                collapse all
              </button>
            </div>
          </div>
          <div className="card-body flex flex-col gap-4">
            {depthLevels.map((depth) => {
              const dirs = dirsByDepth
                .get(depth)!
                .slice()
                .sort((a, b) => a.path.localeCompare(b.path));
              return (
                <div key={depth}>
                  <span className="depth-label">
                    {depth === 1 ? "root level" : `depth ${depth}`}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {dirs.map((dir) => {
                      const isCollapsed = collapsed.has(dir.path);
                      const parentPath = dir.path
                        .split("/")
                        .slice(0, -1)
                        .join("/");
                      return (
                        <button
                          key={dir.path}
                          onClick={() => toggleCollapse(dir.path)}
                          className={
                            isCollapsed
                              ? "dir-tag-collapsed"
                              : "dir-tag-expanded"
                          }
                          title={dir.path}
                        >
                          {depth > 1 && parentPath && (
                            <span className="text-text-3 font-normal">
                              {parentPath}/
                            </span>
                          )}
                          <span className="font-semibold">{dir.name}/</span>
                          {isCollapsed && (
                            <span className="text-[10px] opacity-90">↗</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tree && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="label">Output</span>
              <span className="stat-pill">
                <strong>{lineCount}</strong> lines
              </span>
              {collapsed.size > 0 && (
                <span className="stat-pill">
                  <strong>{collapsed.size}</strong> collapsed
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button className="btn-ghost" onClick={handleReset}>
                reset
              </button>
              <button className="btn-accent" onClick={handleCopy}>
                {copied ? "✓ copied" : "copy"}
              </button>
            </div>
          </div>
          <div className="card-body">
            <pre className="tree-pre">{tree}</pre>
            <p className="text-[10px] text-text-4 mt-2.5">
              node_modules · .next · dist · build · .git · .turbo · .vercel
              stripped from output
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
