const { createUsageError } = require("../config/normalize-config.js");
const { dieWithUsage } = require("./shared.js");

function handleStop(parsed, runtime) {
  const { apps, tmux, tmuxSession, usageText } = runtime;

  if (!parsed.app) {
    const error = new Error(usageText);
    error.exitCode = 2;
    error.onlyUsage = true;
    throw error;
  }

  tmux.ensureInstalled();

  if (parsed.app !== "all" && !Object.prototype.hasOwnProperty.call(apps, parsed.app)) {
    dieWithUsage(`Error: unknown app "${parsed.app}"`, usageText);
  }

  if (!tmux.sessionExists(tmuxSession)) {
    throw createUsageError(`Error: session "${tmuxSession}" does not exist.`);
  }

  if (parsed.app === "all") {
    tmux.killSession(tmuxSession);
    process.stdout.write(`Stopped session "${tmuxSession}".\n`);
    return;
  }

  if (!tmux.appExists(tmuxSession, parsed.app)) {
    throw createUsageError(`Error: app "${parsed.app}" does not exist in session "${tmuxSession}".`);
  }

  tmux.killApp(tmuxSession, parsed.app);
  process.stdout.write(`Stopped app "${parsed.app}" in session "${tmuxSession}".\n`);
}

module.exports = {
  handleStop,
};
