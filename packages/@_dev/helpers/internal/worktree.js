const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { run } = require("./process.js");

function sessionName(rootPath, suffix) {
  const str = String(rootPath)
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]/g, "-");
  return suffix ? `${str}-${suffix}` : str;
}

function getWorktreeRoot(cwd = process.cwd()) {
  let resolvedCwd;
  try {
    resolvedCwd = fs.realpathSync(cwd);
  } catch {
    resolvedCwd = path.resolve(cwd);
  }

  const gitRoot = run("git", ["-C", resolvedCwd, "rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  if (gitRoot.status === 0 && gitRoot.stdout) return fs.realpathSync(gitRoot.stdout);
  return resolvedCwd;
}

function parseGitWorktreePorcelain(text) {
  const lines = String(text || "").split(/\r?\n/);
  const entries = [];
  let current = null;

  const flush = () => {
    if (current && current.path) {
      entries.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const separator = line.indexOf(" ");
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1);

    if (key === "worktree") {
      flush();
      current = { path: value };
      continue;
    }

    if (!current) continue;
    if (key === "branch") current.branch = value;
    else if (key === "HEAD") current.head = value;
    else if (key === "detached") current.detached = true;
    else if (key === "locked") current.locked = value || true;
    else if (key === "prunable") current.prunable = value || true;
  }

  flush();
  return entries;
}

function listGitWorktrees(cwd = process.cwd()) {
  const root = getWorktreeRoot(cwd);
  const listed = run("git", ["-C", root, "worktree", "list", "--porcelain"], {
    allowFailure: true,
  });
  if (listed.status !== 0 || !listed.stdout) return [];
  return parseGitWorktreePorcelain(listed.stdout);
}

function normalizeBranchRef(branch) {
  const value = String(branch || "").trim();
  if (!value) return "";
  if (value.startsWith("refs/")) return value;
  return `refs/heads/${value}`;
}

function getWorktreeForBranch({ cwd = process.cwd(), branch = "main" } = {}) {
  const targetRef = normalizeBranchRef(branch);
  if (!targetRef) throw new Error("getWorktreeForBranch: branch is required");

  const worktrees = listGitWorktrees(cwd);
  const matched = worktrees.find((entry) => entry.branch === targetRef);
  if (!matched || !matched.path) return "";

  try {
    return fs.realpathSync(matched.path);
  } catch {
    return path.resolve(matched.path);
  }
}

function sanitizeToken(value, fallback = "default") {
  const token = String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || fallback;
}

function stableShortHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function getSessionAnchorDir({ cwd = process.cwd(), session, name = "resource" } = {}) {
  const root = getWorktreeRoot(cwd);
  const rootId = sanitizeToken(sessionName(root), "worktree");
  const sessionId = sanitizeToken(session || rootId, rootId);
  const resourceId = sanitizeToken(name, "resource");
  const anchorDir = path.join(os.tmpdir(), "dev-session-anchors", rootId, sessionId, resourceId);
  fs.mkdirSync(anchorDir, { recursive: true });
  return anchorDir;
}

function copyPathFromRootIfMissing({ relativePath, sourceRoot, targetRoot, logger } = {}) {
  if (!relativePath) throw new Error("copyPathFromRootIfMissing: relativePath is required");
  if (!sourceRoot) throw new Error("copyPathFromRootIfMissing: sourceRoot is required");
  if (!targetRoot) throw new Error("copyPathFromRootIfMissing: targetRoot is required");

  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);

  if (fs.existsSync(targetPath)) {
    return { status: "exists", sourcePath, targetPath, relativePath };
  }

  if (!fs.existsSync(sourcePath)) {
    if (typeof logger === "function") {
      logger(`Main repo path not found, skipping copy: ${sourcePath}`);
    }
    return { status: "missing_source", sourcePath, targetPath, relativePath };
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const sourceStats = fs.statSync(sourcePath);
  fs.cpSync(sourcePath, targetPath, { recursive: sourceStats.isDirectory() });

  if (typeof logger === "function") {
    logger(
      sourceStats.isDirectory()
        ? `Copied directory from main repo: ${sourcePath}`
        : `Copied file from main repo: ${sourcePath}`
    );
  }

  return {
    status: "copied",
    kind: sourceStats.isDirectory() ? "directory" : "file",
    sourcePath,
    targetPath,
    relativePath,
  };
}

function copyPathsFromRootIfMissing({ relativePaths, sourceRoot, targetRoot, logger } = {}) {
  if (!Array.isArray(relativePaths)) {
    throw new Error("copyPathsFromRootIfMissing: relativePaths must be an array");
  }
  return relativePaths.map((relativePath) =>
    copyPathFromRootIfMissing({ relativePath, sourceRoot, targetRoot, logger })
  );
}

function defaultLogger(message) {
  process.stdout.write(`${message}\n`);
}

function resolveLogger(logger) {
  return typeof logger === "function" ? logger : defaultLogger;
}

module.exports = {
  copyPathFromRootIfMissing,
  copyPathsFromRootIfMissing,
  defaultLogger,
  getSessionAnchorDir,
  getWorktreeForBranch,
  getWorktreeRoot,
  listGitWorktrees,
  resolveLogger,
  sanitizeToken,
  sessionName,
  stableShortHash,
};
