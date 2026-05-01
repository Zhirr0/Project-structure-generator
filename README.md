# project struct

A fast, client-side ASCII project structure generator. Scan any local folder or public GitHub repo and get a clean, copyable directory tree with collapsible directories, configurable excludes, and zero server uploads.

## Features

- **File Upload mode** — select any local project folder; the tree is built entirely in the browser, nothing is sent anywhere
- **GitHub Repo URL mode** — paste any public GitHub repo URL and fetch its full recursive file tree via the GitHub REST API in a single request
- **Always-excluded dirs** — `node_modules`, `.next`, `dist`, `build`, `.git`, `.turbo`, `.vercel`, `out`, `.cache` are stripped automatically
- **Soft excludes** — optionally toggle `coverage`, `tmp`, `logs`, `.DS_Store`, `*.log`
- **Collapse / expand directories** — click individual dirs or use expand all / collapse all, grouped by depth level
- **Copy to clipboard** — one click to copy the full ASCII tree output

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [React](https://react.dev/) with `useTransition` for non-blocking tree builds
- [TailwindCSS v4](https://tailwindcss.com/)
- GitHub REST API (`/git/trees?recursive=1`), no auth required for public repos

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Install

```bash
pnpm install
```

### Run dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production

```bash
pnpm build
pnpm start
```

## Usage

### File Upload

1. Click the **File Upload** tab
2. Click the drop zone and select a project folder
3. Use the **Additional Excludes** toggles to filter out noise
4. Click directories in the **Collapse Directories** panel to fold them in the output
5. Hit **copy** to grab the ASCII tree

### GitHub Repo URL

1. Click the **GitHub Repo URL** tab
2. Paste a public GitHub repo URL — any of these formats work:
   ```
   https://github.com/owner/repo
   https://github.com/owner/repo/tree/main
   https://github.com/owner/repo/tree/my-branch
   ```
3. Click **Scan Repo**
4. Collapse, filter, and copy as normal

> **Note:** The GitHub REST API allows 60 unauthenticated requests per hour per IP. Repos with 100k+ files may be truncated by GitHub's API — a warning will appear if this happens. Private repos are not supported.

## Project Structure

```
.
├── app/
│   ├── globals.css        # TailwindCSS v4 theme + component styles
│   ├── layout.tsx         # Root layout, fonts
│   └── page.tsx           # Entry page
└── components/
    └── TreeGenerator.tsx  # Main component — all logic lives here
```

## How It Works

Both modes share a single `buildTreeFromPaths(paths: string[], softExcludes)` function that takes a flat array of file path strings and assembles the nested tree structure.

- **File Upload** — converts the browser `FileList` (via `webkitRelativePath`) into path strings, then calls `buildTreeFromPaths`
- **GitHub mode** — calls `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`, extracts the `path` field from each blob entry, then calls `buildTreeFromPaths` with the same result

Tree rendering, collapse state, excludes, and copy all operate identically regardless of source.

## License

MIT