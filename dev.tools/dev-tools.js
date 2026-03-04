const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const DEFAULT_BASE_PORTS = Object.freeze({
  api: 8787,
  metro: 8989,
  web: 3000,
  admin: 5173,
});

function die(message, code = 1) {
  const text = String(message);
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
  process.exit(code);
}

function run(cmd, args = [], options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });

  const status = Number.isInteger(result.status) ? result.status : 1;
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";

  if (result.error && !options.allowFailure) {
    throw result.error;
  }

  if (status !== 0 && !options.allowFailure) {
    const detail = stderr || stdout || `exit code ${status}`;
    throw new Error(`${cmd} ${args.join(" ")} failed: ${detail}`);
  }

  return {
    status,
    stdout,
    stderr,
    error: result.error || null,
  };
}

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

function getPortBase(name, basePort) {
  if (Number.isInteger(basePort)) return basePort;
  const mappedBase = DEFAULT_BASE_PORTS[name];
  if (Number.isInteger(mappedBase)) return mappedBase;
  throw new Error(`leasePort: missing basePort for app "${name}"`);
}

function leasePort({ name, basePort, cwd = process.cwd(), session } = {}) {
  if (!name) throw new Error("leasePort: name is required");
  const root = getWorktreeRoot(cwd);
  const anchorDir = getSessionAnchorDir({ cwd: root, session, name: `port-${name}` });
  const portleasePath = path.join(root, "scripts", "portlease");
  const base = getPortBase(name, basePort);
  const out = run(portleasePath, [String(base), "--cwd", anchorDir]);
  const leasedPort = Number(out.stdout);
  if (!Number.isInteger(leasedPort)) {
    throw new Error(`leasePort: expected numeric port but got "${out.stdout}"`);
  }
  return String(leasedPort);
}

function leaseSimulator({
  name = "simulator",
  cwd = process.cwd(),
  session,
  runtime,
  deviceType,
} = {}) {
  const root = getWorktreeRoot(cwd);
  const anchorDir = getSessionAnchorDir({ cwd: root, session, name: `sim-${name}` });
  const simLeasePath = path.join(root, "scripts", "ios-sim-lease");
  const namePrefix = `ai-pranks-${stableShortHash(`${root}\t${session || ""}\t${name}`)}`;
  const args = ["--cwd", anchorDir, "--owner-root", root, "--name-prefix", namePrefix];
  if (runtime) args.push("--runtime", runtime);
  if (deviceType) args.push("--device-type", deviceType);

  const out = run(simLeasePath, args);
  if (!out.stdout) throw new Error("leaseSimulator: ios-sim-lease returned an empty UDID");
  return out.stdout;
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

function isExecutableFile(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(commandName, env = process.env) {
  const name = String(commandName || "").trim();
  if (!name) return false;

  if (name.includes(path.sep) || (path.sep === "\\" && name.includes("/"))) {
    return isExecutableFile(name);
  }

  const pathValue = String(env.PATH || "");
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  if (directories.length === 0) return false;

  if (process.platform === "win32") {
    const pathExt = String(env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
      .split(";")
      .filter(Boolean)
      .map((value) => value.toLowerCase());

    for (const dir of directories) {
      const baseCandidate = path.join(dir, name);
      if (isExecutableFile(baseCandidate)) return true;
      for (const ext of pathExt) {
        if (isExecutableFile(`${baseCandidate}${ext}`)) return true;
      }
    }
    return false;
  }

  return directories.some((dir) => isExecutableFile(path.join(dir, name)));
}

function ensureCommandInPath(commandName, { hint } = {}) {
  if (commandExists(commandName)) return;
  let message = `${commandName} is required but was not found in PATH.`;
  if (hint) message += `\n${hint}`;
  throw new Error(message);
}

function installDependencies({
  cwd = process.cwd(),
  packageManager = "pnpm",
  installArgs = ["install"],
  ignoreScriptsArgs = ["--ignore-scripts"],
  runScriptsEnvVar = "DEV_SETUP_RUN_SCRIPTS",
  runScriptsEnableValue = "1",
  logger,
} = {}) {
  const normalizedInstallArgs =
    Array.isArray(installArgs) && installArgs.length > 0 ? installArgs : ["install"];
  const normalizedIgnoreScriptsArgs = Array.isArray(ignoreScriptsArgs) ? ignoreScriptsArgs : [];
  const shouldRunScripts =
    String(process.env[runScriptsEnvVar] || "") === String(runScriptsEnableValue);

  const args = [...normalizedInstallArgs];
  if (!shouldRunScripts && normalizedIgnoreScriptsArgs.length > 0) {
    args.push(...normalizedIgnoreScriptsArgs);
    if (typeof logger === "function") {
      logger(
        `Running ${packageManager} ${normalizedInstallArgs.join(" ")} with ${normalizedIgnoreScriptsArgs.join(" ")} (set ${runScriptsEnvVar}=${runScriptsEnableValue} to enable scripts).`
      );
    }
  }

  run(packageManager, args, { cwd, stdio: "inherit" });
  return { shouldRunScripts, args };
}

function configureGitHooksPath({ cwd = process.cwd(), hooksPath = ".githooks", logger } = {}) {
  const probe = run("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
    allowFailure: true,
  });
  if (probe.status !== 0) return false;

  run("git", ["-C", cwd, "config", "core.hooksPath", hooksPath]);
  if (typeof logger === "function") {
    logger(`Configured git hooks path to ${hooksPath}`);
  }
  return true;
}

function defaultLogger(message) {
  process.stdout.write(`${message}\n`);
}

function resolveLogger(logger) {
  return typeof logger === "function" ? logger : defaultLogger;
}

function copyFromMainWorktree(
  relativePaths,
  { cwd = process.cwd(), branch = "main", logger } = {}
) {
  if (!Array.isArray(relativePaths)) {
    throw new Error("copyFromMainWorktree: relativePaths must be an array");
  }

  const root = getWorktreeRoot(cwd);
  const mainWorktree = getWorktreeForBranch({ cwd: root, branch });
  const log = resolveLogger(logger);

  if (!mainWorktree) {
    log(`Main worktree on branch '${branch}' not found, skipping cache and env file copy.`);
    return [];
  }

  return copyPathsFromRootIfMissing({
    relativePaths,
    sourceRoot: mainWorktree,
    targetRoot: root,
    logger: log,
  });
}

function firstCommandToken(command) {
  const match = String(command || "")
    .trim()
    .match(/^([^\s]+)/);
  return match ? match[1] : "";
}

function shouldCheckTokenInPath(token) {
  if (!token) return false;
  if (token.includes("=")) return false;
  if (token.startsWith("$")) return false;
  if (token === "&&" || token === "||") return false;
  if (token === ";" || token === "|") return false;
  return true;
}

function cmd(
  command,
  { cwd = process.cwd(), commandName = "", missingCommandHint, shellPath = "" } = {}
) {
  const text = String(command || "").trim();
  if (!text) throw new Error("cmd: command is required");

  const resolvedCommand = String(commandName || firstCommandToken(text)).trim();
  if (shouldCheckTokenInPath(resolvedCommand)) {
    ensureCommandInPath(resolvedCommand, { hint: missingCommandHint });
  }

  const root = getWorktreeRoot(cwd);
  const shell = shellPath || process.env.SHELL || "/bin/zsh";
  return run(shell, ["-lc", text], { cwd: root, stdio: "inherit" });
}

function addGitHooks(hooksPath = ".githooks", { cwd = process.cwd(), logger } = {}) {
  const root = getWorktreeRoot(cwd);
  const pathValue = Array.isArray(hooksPath)
    ? hooksPath.find((value) => String(value || "").trim())
    : hooksPath;

  if (!pathValue) throw new Error("addGitHooks: hooksPath is required");

  return configureGitHooksPath({
    cwd: root,
    hooksPath: String(pathValue),
    logger: resolveLogger(logger),
  });
}

module.exports = {
  die,
  run,
  sessionName,
  getWorktreeRoot,
  listGitWorktrees,
  getWorktreeForBranch,
  leasePort,
  leaseSimulator,
  copyPathFromRootIfMissing,
  copyPathsFromRootIfMissing,
  commandExists,
  ensureCommandInPath,
  installDependencies,
  configureGitHooksPath,
  copyFromMainWorktree,
  cmd,
  addGitHooks,
};
