const { getWorktreeForBranch, getWorktreeRoot, resolveLogger } = require("./internal/worktree.js");
const { run } = require("./internal/process.js");

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
  const log = resolveLogger(logger);

  const args = [...normalizedInstallArgs];
  if (!shouldRunScripts && normalizedIgnoreScriptsArgs.length > 0) {
    args.push(...normalizedIgnoreScriptsArgs);
    log(
      `Running ${packageManager} ${normalizedInstallArgs.join(" ")} with ${normalizedIgnoreScriptsArgs.join(" ")} (set ${runScriptsEnvVar}=${runScriptsEnableValue} to enable scripts).`
    );
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
  const log = resolveLogger(logger);
  log(`Configured git hooks path to ${hooksPath}`);
  return true;
}

function copyFromMainWorktree(relativePaths, { cwd = process.cwd(), branch = "main", logger } = {}) {
  if (!Array.isArray(relativePaths)) {
    throw new Error("copyFromMainWorktree: relativePaths must be an array");
  }

  const { copyPathsFromRootIfMissing } = require("./internal/worktree.js");
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

function addGitHooks(hooksPath = ".githooks", { cwd = process.cwd(), logger } = {}) {
  const root = getWorktreeRoot(cwd);
  const pathValue = Array.isArray(hooksPath)
    ? hooksPath.find((value) => String(value || "").trim())
    : hooksPath;

  if (!pathValue) throw new Error("addGitHooks: hooksPath is required");

  return configureGitHooksPath({
    cwd: root,
    hooksPath: String(pathValue),
    logger,
  });
}

module.exports = {
  addGitHooks,
  configureGitHooksPath,
  copyFromMainWorktree,
  installDependencies,
};
