const { createUsageError } = require("../config/normalize-config.js");
const { ensureAppDefined } = require("./shared.js");

function handleAttach(parsed, runtime) {
  const { appNames, apps, tmux, tmuxSession, usageText } = runtime;

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
    if (!tmux.appExists(tmuxSession, parsed.app)) {
      throw createUsageError(`Error: app "${parsed.app}" does not exist in session "${tmuxSession}".`);
    }
    tmux.selectApp(tmuxSession, parsed.app);
    tmux.attachSession(tmuxSession);
    return;
  }

  tmux.openSplitAttachWindow({
    tmuxSession,
    appNames,
  });
  tmux.attachSession(tmuxSession);
}

module.exports = {
  handleAttach,
};
