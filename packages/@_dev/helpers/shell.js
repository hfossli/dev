const { getWorktreeRoot } = require("./internal/worktree.js");
const {
  commandExists,
  ensureCommandInPath,
  firstCommandToken,
  run,
  shouldCheckTokenInPath,
} = require("./internal/process.js");

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

module.exports = {
  cmd,
  commandExists,
  ensureCommandInPath,
};
