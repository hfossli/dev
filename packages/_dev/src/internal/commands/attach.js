const { createUsageError } = require("../config/normalize-config.js");

function handleAttach(parsed, runtime) {
  const { tmux, tmuxSession, usageText } = runtime;

  if (parsed.app) {
    const error = new Error("Error: attach does not take an app argument.");
    error.isUsageError = true;
    error.usageText = usageText;
    throw error;
  }

  tmux.ensureInstalled();

  if (!tmux.sessionExists(tmuxSession)) {
    throw createUsageError(`Error: session "${tmuxSession}" does not exist.`);
  }

  tmux.enableMouse(tmuxSession);
  tmux.attachSession(tmuxSession);
}

module.exports = {
  handleAttach,
};
