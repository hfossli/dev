const { createUsageError } = require("../config/normalize-config.js");
const { resolveLineCount } = require("./shared.js");

function handleSplitAttach(parsed, runtime) {
  const { appNames, root, tmux, tmuxSession, usageText } = runtime;

  if (parsed.app) {
    const error = new Error("Error: split-attach does not take an app argument.");
    error.isUsageError = true;
    error.usageText = usageText;
    throw error;
  }

  tmux.ensureInstalled();

  if (!tmux.sessionExists(tmuxSession)) {
    throw createUsageError(`Error: session "${tmuxSession}" does not exist.`);
  }

  tmux.enableMouse(tmuxSession);
  tmux.openSplitAttachWindow({
    root,
    tmuxSession,
    appNames,
    lines: resolveLineCount(parsed.linesOverride),
  });
  tmux.attachSession(tmuxSession);
}

module.exports = {
  handleSplitAttach,
};
