const { resolveStartCommand } = require("../config/normalize-config.js");
const { shellQuote } = require("../runtime/shell.js");
const { createUsageError } = require("../config/normalize-config.js");
const { dieWithUsage, resolveLineCount } = require("./shared.js");

function buildWrappedCommand(root, command) {
  return `cd ${shellQuote(root)} && ${command}`;
}

function handleStartOrRestart(parsed, runtime) {
  const { apps, appNames, root, tmux, tmuxSession, usageText } = runtime;
    const isRestart = parsed.command === "restart";

  if (!parsed.app) {
    const error = new Error(usageText);
    error.exitCode = 2;
    error.onlyUsage = true;
    throw error;
  }

  tmux.ensureInstalled();
  let sessionExists = tmux.sessionExists(tmuxSession);
  let defaultAttachWindow = "";

  if (parsed.app === "all") {
    if (appNames.length === 0) {
      throw createUsageError("Error: no apps are configured in the active _dev config.");
    }

    if (!isRestart && sessionExists) {
      const existingWindows = appNames.filter((name) => tmux.windowExists(tmuxSession, name));
      if (existingWindows.length > 0) {
        throw createUsageError(
          `Error: cannot start all because these windows already exist in session "${tmuxSession}": ${existingWindows.join(", ")}.`
        );
      }
    }

    if (isRestart && sessionExists) {
      for (const name of appNames) {
        if (tmux.windowExists(tmuxSession, name)) {
          tmux.killWindow(tmuxSession, name);
        }
      }
      sessionExists = tmux.sessionExists(tmuxSession);
    }

    const startEntries = appNames.map((name) => ({
      name,
      wrappedCommand: buildWrappedCommand(root, resolveStartCommand(name, apps[name])),
    }));

    if (sessionExists) {
      for (const entry of startEntries) {
        tmux.newWindow(tmuxSession, entry.name, entry.wrappedCommand);
      }
    } else {
      const [firstEntry, ...restEntries] = startEntries;
      tmux.newSession(tmuxSession, firstEntry.name, firstEntry.wrappedCommand);
      for (const entry of restEntries) {
        tmux.newWindow(tmuxSession, entry.name, entry.wrappedCommand);
      }
    }

    process.stdout.write(
      `${isRestart ? "Restarted" : "Started"} apps ${appNames.join(", ")} in session "${tmuxSession}".\n`
    );
    for (const entry of startEntries) {
      process.stdout.write(`- ${entry.name}: ${entry.wrappedCommand}\n`);
    }
    defaultAttachWindow = appNames[0];
  } else {
    if (!Object.prototype.hasOwnProperty.call(apps, parsed.app)) {
      dieWithUsage(`Error: unknown app "${parsed.app}"`, usageText);
    }

    const wrappedCommand = buildWrappedCommand(root, resolveStartCommand(parsed.app, apps[parsed.app]));

    if (!isRestart && sessionExists && tmux.windowExists(tmuxSession, parsed.app)) {
      throw createUsageError(`Error: window "${parsed.app}" already exists in session "${tmuxSession}".`);
    }

    if (isRestart && sessionExists && tmux.windowExists(tmuxSession, parsed.app)) {
      tmux.killWindow(tmuxSession, parsed.app);
      sessionExists = tmux.sessionExists(tmuxSession);
    }

    if (sessionExists) {
      tmux.newWindow(tmuxSession, parsed.app, wrappedCommand);
    } else {
      tmux.newSession(tmuxSession, parsed.app, wrappedCommand);
    }

    process.stdout.write(
      `${isRestart ? "Restarted" : "Started"} app "${parsed.app}" in session "${tmuxSession}" (window "${parsed.app}").\n`
    );
    process.stdout.write(`Command: ${wrappedCommand}\n`);
    defaultAttachWindow = parsed.app;
  }

  tmux.enableMouse(tmuxSession);

  if (parsed.splitAttachRequested) {
    const lines = resolveLineCount(parsed.linesOverride);
    tmux.openSplitAttachWindow({
      root,
      tmuxSession,
      appNames,
      lines,
    });
    tmux.attachSession(tmuxSession);
    return;
  }

  if (parsed.attachRequested) {
    if (defaultAttachWindow) {
      tmux.selectWindow(tmuxSession, defaultAttachWindow);
    }
    tmux.attachSession(tmuxSession);
  }
}

module.exports = {
  handleStartOrRestart,
};
