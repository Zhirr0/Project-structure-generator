"use client";

import { useRef, useState } from "react";

type TreeNode = {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
};

const HARD_EXCLUDES = new Set(["node_modules", ".next", ".git", ".turbo", ".vercel"]);

const SOFT_EXCLUDE_OPTIONS = [
  { label: "dist", value: "dist" },
  { label: "build", value: "build" },
  { label: ".cache", value: ".cache" },
  { label: "coverage", value: "coverage" },
  { label: "out", value: "out" },
  { label: ".DS_Store", value: ".DS_Store" },
];

function createNode(name: string, isFile: boolean): TreeNode {
  return { name, children: new Map(), isFile };
}

function buildTree(files: FileList, excludes: Set<string>): TreeNode {
  const root = createNode("root", false);

  for (let i = 0; i < files.length; i++) {
    const file = files[i] as File & { webkitRelativePath: string };
    const parts = file.webkitRelativePath.split("/");

    let skip = false;
    for (const part of parts) {
      if (excludes.has(part)) { skip = true; break; }
    }
    if (skip) continue;

    let current = root;
    for (let j = 1; j < parts.length; j++) {
      const part = parts[j];
      const isLast = j === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(part, createNode(part, isLast));
      }
      current = current.children.get(part)!;
    }
  }

  return root;
}

function getTopLevelDirs(root: TreeNode): string[] {
  const dirs: string[] = [];
  for (const [name, node] of root.children) {
    if (!node.isFile) dirs.push(name);
  }
  return dirs.sort((a, b) => a.localeCompare(b));
}

function sortedEntries(node: TreeNode): TreeNode[] {
  const dirs: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const child of node.children.values()) {
    (child.isFile ? files : dirs).push(child);
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function renderNode(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  collapsedDirs: Set<string>,
  isTopLevel: boolean
): string {
  const connector = isLast ? "└── " : "├── ";
  const childPrefix = prefix + (isLast ? "    " : "│   ");
  const trailingSlash = !node.isFile ? "/" : "";
  let out = prefix + connector + node.name + trailingSlash + "\n";

  if (!node.isFile) {
    const shouldCollapse = isTopLevel && collapsedDirs.has(node.name);
    if (!shouldCollapse) {
      const children = sortedEntries(node);
      children.forEach((child, idx) => {
        out += renderNode(child, childPrefix, idx === children.length - 1, collapsedDirs, false);
      });
    }
  }

  return out;
}

function generateTree(root: TreeNode, collapsedDirs: Set<string>): string {
  const children = sortedEntries(root);
  let out = ".\n";
  children.forEach((child, idx) => {
    out += renderNode(child, "", idx === children.length - 1, collapsedDirs, !child.isFile);
  });
  return out.trim();
}

export default function TreeGenerator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);
  const [projectName, setProjectName] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [topLevelDirs, setTopLevelDirs] = useState<string[]>([]);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [softExcludes, setSoftExcludes] = useState<Set<string>>(new Set(["dist", "build", "out"]));
  const [copied, setCopied] = useState(false);

  const allExcludes = new Set([...HARD_EXCLUDES, ...softExcludes]);

  const tree = rootNode ? generateTree(rootNode, collapsedDirs) : "";

  function handleFiles(files: FileList) {
    const first = files[0] as File & { webkitRelativePath: string };
    const name = first.webkitRelativePath.split("/")[0];
    setProjectName(name);
    setFileCount(files.length);
    setCollapsedDirs(new Set());

    const root = buildTree(files, allExcludes);
    setRootNode(root);
    setTopLevelDirs(getTopLevelDirs(root));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  }

  function toggleCollapse(dir: string) {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }

  function toggleSoftExclude(val: string) {
    setSoftExcludes((prev) => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(tree);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setRootNode(null);
    setProjectName("");
    setFileCount(0);
    setTopLevelDirs([]);
    setCollapsedDirs(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-10">
        <div className="flex items-baseline gap-3 mb-2">
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: "var(--color-text)", letterSpacing: "-0.02em" }}
          >
            struct
          </h1>
          <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
            project structure generator
          </span>
        </div>
        <div
          className="h-px w-full mt-4"
          style={{ background: "var(--color-border)" }}
        />
      </div>

      <div className="panel p-5 mb-4">
        <span className="section-label">Folder</span>

        <div
          className="drop-zone p-10 mb-5"
          style={{
            borderColor: rootNode ? "var(--color-border)" : "var(--color-border)",
            cursor: "pointer",
          }}
          onClick={() => inputRef.current?.click()}
        >
          <div
            className="text-xs text-center"
            style={{ color: rootNode ? "var(--color-accent)" : "var(--color-text-muted)" }}
          >
            {rootNode ? (
              <>
                <span style={{ color: "var(--color-text)" }}>{projectName}</span>
                <span style={{ color: "var(--color-text-muted)" }}> — {fileCount} files</span>
                <span
                  className="block mt-1"
                  style={{ fontSize: "10px", color: "var(--color-text-muted)" }}
                >
                  click to rescan
                </span>
              </>
            ) : (
              <>
                <span style={{ color: "var(--color-text-dim)" }}>click to open folder</span>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            {...({ webkitdirectory: "true", directory: "true" } as React.InputHTMLAttributes<HTMLInputElement>)}
            multiple
          />
        </div>

        <span className="section-label">Exclude</span>
        <div className="flex flex-wrap gap-2">
          {[...HARD_EXCLUDES].sort().map((val) => (
            <span
              key={val}
              className="pill-active"
              style={{
                opacity: 0.5,
                cursor: "default",
              }}
              title="Always excluded"
            >
              {val}
            </span>
          ))}
          {SOFT_EXCLUDE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleSoftExclude(opt.value)}
              className={softExcludes.has(opt.value) ? "pill-active" : "pill-inactive"}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {topLevelDirs.length > 0 && (
        <div className="panel p-5 mb-4">
          <span className="section-label">Collapse directories</span>
          <div className="flex flex-wrap gap-2">
            {topLevelDirs.map((dir) => (
              <button
                key={dir}
                onClick={() => toggleCollapse(dir)}
                className={collapsedDirs.has(dir) ? "pill-active" : "pill-inactive"}
              >
                {collapsedDirs.has(dir) ? "↗ " : ""}{dir}/
              </button>
            ))}
          </div>
          {collapsedDirs.size > 0 && (
            <button
              onClick={() => setCollapsedDirs(new Set())}
              className="mt-3"
              style={{ color: "var(--color-text-muted)", fontSize: "11px", background: "none", border: "none", cursor: "pointer" }}
            >
              expand all
            </button>
          )}
        </div>
      )}

      {tree && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="section-label" style={{ marginBottom: 0 }}>Output</span>
            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="icon-btn-ghost">
                reset
              </button>
              <button onClick={handleCopy} className="icon-btn-primary">
                {copied ? "✓ copied" : "copy"}
              </button>
            </div>
          </div>
          <pre className="tree-output">{tree}</pre>
        </div>
      )}
    </div>
  );
}
