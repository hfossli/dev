const { withInheritedPath } = require("../runtime/shell.js");
const { resolveToolCommand } = require("../config/normalize-config.js");
const { run } = require("../runtime/process.js");

function handleTool(parsed, runtime) {
  const { usageText, root, tools } = runtime;
  const toolName = parsed.app;
  if (!toolName) {
    const error = new Error(usageText);
    error.exitCode = 2;
    error.onlyUsage = true;
    throw error;
  }

  if (!Object.prototype.hasOwnProperty.call(tools, toolName)) {
    const error = new Error(`Error: unknown tool "${toolName}"`);
    error.isUsageError = true;
    error.usageText = usageText;
    throw error;
  }

  const toolCommand = resolveToolCommand(toolName, tools[toolName], parsed.commandArgs);
  if (toolCommand == null) {
    return;
  }
  const toolCommandWithPath = withInheritedPath(toolCommand);

  process.stdout.write(`Running tool "${toolName}": ${toolCommand}\n`);
  const shellPath = process.env.SHELL || "/bin/zsh";
  run(shellPath, ["-lc", toolCommandWithPath], { cwd: root, stdio: "inherit" });
}

module.exports = {
  handleTool,
};
