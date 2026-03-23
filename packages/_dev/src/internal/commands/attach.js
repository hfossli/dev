const { createUsageError } = require("../config/normalize-config.js");
const { ensureAppDefined, resolveLineCount } = require("./shared.js");

function handleAttach(parsed, runtime) {
  const { appNames, apps, root, tmux, tmuxSession, usageText } = runtime;

  tmux.ensureInstalled();

  if (!tmux.sessionExists(tmuxSession)) {
    throw createUsageError(`Error: session "${tmuxSession}" does not exist.`);
  }

  tmux.enableMouse(tmuxSession);

  if (parsed.app) {
    if (parsed.linesOverride !== null) {
      const error = new Error("Error: attach <app> does not support --lines.");
      error.isUsageError = true;
      error.usageText = usageText;
      throw error;
    }

    ensureAppDefined({ appName: parsed.app, apps, usageText });
    if (!tmux.windowExists(tmuxSession, parsed.app)) {
      throw createUsageError(`Error: window "${parsed.app}" does not exist in session "${tmuxSession}".`);
    }
    tmux.selectWindow(tmuxSession, parsed.app);
    tmux.attachSession(tmuxSession);
    return;
  }

  tmux.openSplitAttachWindow({
    root,
    tmuxSession,
    appNames,
    lines: resolveLineCount(parsed.linesOverride),
  });
  tmux.attachSession(tmuxSession);
}

module.exports = {
  handleAttach,
};
