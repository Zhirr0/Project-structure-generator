"use client";

import { useRef, useState, useTransition } from "react";

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
};

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

function buildTree(files: FileList, softExcludes: Set<string>): TreeNode {
  const root = makeNode("root", "", false);
  for (let i = 0; i < files.length; i++) {
    const f = files[i] as File & { webkitRelativePath: string };
    const parts = f.webkitRelativePath.split("/");
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
    for (let j = 1; j < parts.length; j++) {
      const seg = parts[j];
      const nodePath = parts.slice(1, j + 1).join("/");
      const isFile = j === parts.length - 1;
      if (!cur.children.has(seg))
        cur.children.set(seg, makeNode(seg, nodePath, isFile));
      cur = cur.children.get(seg)!;
    }
  }
  return root;
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

export default function TreeGenerator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);
  const [allDirs, setAllDirs] = useState<TreeNode[]>([]);
  const [projectName, setProjectName] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [softExcludes, setSoftExcludes] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const tree = rootNode ? generateTree(rootNode, collapsed) : "";
  const lineCount = tree ? tree.split("\n").length : 0;

  function processFiles(files: FileList, excl: Set<string>) {
    startTransition(() => {
      const first = files[0] as File & { webkitRelativePath: string };
      const name = first.webkitRelativePath.split("/")[0];
      const root = buildTree(files, excl);
      const dirs = collectDirs(root);
      setProjectName(name);
      setFileCount(files.length);
      setRootNode(root);
      setAllDirs(dirs);
      setCollapsed(new Set());
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) processFiles(e.target.files, softExcludes);
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
    if (inputRef.current) inputRef.current.value = "";
  }

  const dirsByDepth = allDirs.reduce<Map<number, TreeNode[]>>((acc, d) => {
    const depth = d.path.split("/").length;
    if (!acc.has(depth)) acc.set(depth, []);
    acc.get(depth)!.push(d);
    return acc;
  }, new Map());

  const depthLevels = Array.from(dirsByDepth.keys()).sort((a, b) => a - b);

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

      <div className="card">
        <div className="card-header">
          <span className="label">Folder</span>
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
          <div
            className={`drop-zone ${rootNode ? "drop-zone-filled" : ""}`}
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? (
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
                <span className="text-[22px] leading-none text-text-3">⌘</span>
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
