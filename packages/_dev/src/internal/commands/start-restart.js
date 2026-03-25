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

  if (parsed.app === "all") {
    if (appNames.length === 0) {
      throw createUsageError("Error: no apps are configured in the active dev config.");
    }

    if (!isRestart && sessionExists) {
      const existingApps = appNames.filter((name) => tmux.appExists(tmuxSession, name));
      if (existingApps.length > 0) {
        throw createUsageError(
          `Error: cannot start all because these apps already exist in session "${tmuxSession}": ${existingApps.join(", ")}.`
        );
      }
    }

    if (isRestart && sessionExists) {
      for (const name of appNames) {
        if (tmux.appExists(tmuxSession, name)) {
          tmux.killApp(tmuxSession, name);
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
        tmux.labelAppPane(tmuxSession, entry.name);
      }
    } else {
      const [firstEntry, ...restEntries] = startEntries;
      tmux.newSession(tmuxSession, firstEntry.name, firstEntry.wrappedCommand);
      tmux.labelAppPane(tmuxSession, firstEntry.name);
      for (const entry of restEntries) {
        tmux.newWindow(tmuxSession, entry.name, entry.wrappedCommand);
        tmux.labelAppPane(tmuxSession, entry.name);
      }
    }

    process.stdout.write(
      `${isRestart ? "Restarted" : "Started"} apps ${appNames.join(", ")} in session "${tmuxSession}".\n`
    );
    for (const entry of startEntries) {
      process.stdout.write(`- ${entry.name}: ${entry.wrappedCommand}\n`);
    }
  } else {
    if (!Object.prototype.hasOwnProperty.call(apps, parsed.app)) {
      dieWithUsage(`Error: unknown app "${parsed.app}"`, usageText);
    }

    const wrappedCommand = buildWrappedCommand(root, resolveStartCommand(parsed.app, apps[parsed.app]));

    if (!isRestart && sessionExists && tmux.appExists(tmuxSession, parsed.app)) {
      throw createUsageError(`Error: app "${parsed.app}" already exists in session "${tmuxSession}".`);
    }

    if (isRestart && sessionExists && tmux.appExists(tmuxSession, parsed.app)) {
      tmux.killApp(tmuxSession, parsed.app);
      sessionExists = tmux.sessionExists(tmuxSession);
    }

    if (sessionExists) {
      tmux.newWindow(tmuxSession, parsed.app, wrappedCommand);
    } else {
      tmux.newSession(tmuxSession, parsed.app, wrappedCommand);
    }
    tmux.labelAppPane(tmuxSession, parsed.app);

    process.stdout.write(
      `${isRestart ? "Restarted" : "Started"} app "${parsed.app}" in session "${tmuxSession}" (window "${parsed.app}").\n`
    );
    process.stdout.write(`Command: ${wrappedCommand}\n`);
  }

  tmux.enableMouse(tmuxSession);

  if (parsed.attachRequested) {
    if (parsed.app === "all") {
      const lines = resolveLineCount(parsed.linesOverride);
      tmux.openSplitAttachWindow({
        tmuxSession,
        appNames,
        lines,
        root,
      });
    } else {
      tmux.selectApp(tmuxSession, parsed.app);
    }
    tmux.attachSession(tmuxSession);
    return;
  }
}

module.exports = {
  handleStartOrRestart,
};
