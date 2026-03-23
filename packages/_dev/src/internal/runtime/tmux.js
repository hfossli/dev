const path = require("node:path");
const { run } = require("./process.js");
const { shellQuote } = require("./shell.js");

function createTmuxController({ cliScriptPath, runCommand = run } = {}) {
  function buildRemainOnExitArgs(target) {
    return [";", "set-option", "-pt", target, "remain-on-exit", "failed"];
  }

  function ensureInstalled() {
    const probe = runCommand("tmux", ["-V"], { allowFailure: true });
    if (probe.status !== 0) {
      const error = new Error("Error: tmux is required but was not found in PATH.");
      error.isUsageError = true;
      throw error;
    }
  }

  function sessionExists(tmuxSession) {
    return runCommand("tmux", ["has-session", "-t", tmuxSession], { allowFailure: true }).status === 0;
  }

  function listWindows(tmuxSession) {
    const listed = runCommand("tmux", ["list-windows", "-t", tmuxSession, "-F", "#{window_name}"], {
      allowFailure: true,
    });
    if (listed.status !== 0) return [];
    return listed.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function windowExists(tmuxSession, windowName) {
    return listWindows(tmuxSession).includes(windowName);
  }

  function captureWindowLogs(tmuxSession, appName, lines) {
    const captured = runCommand(
      "tmux",
      ["capture-pane", "-p", "-J", "-S", `-${lines}`, "-t", `${tmuxSession}:${appName}`],
      { allowFailure: true }
    );
    if (captured.status !== 0) {
      const detail = captured.stderr || captured.stdout || `exit code ${captured.status}`;
      throw new Error(`failed to capture logs for "${appName}" in "${tmuxSession}": ${detail}`);
    }
    return captured.stdout;
  }

  function newWindow(tmuxSession, windowName, command) {
    runCommand("tmux", [
      "new-window",
      "-d",
      "-t",
      tmuxSession,
      "-n",
      windowName,
      command,
      ...buildRemainOnExitArgs(`${tmuxSession}:${windowName}`),
    ]);
  }

  function newSession(tmuxSession, windowName, command) {
    runCommand("tmux", [
      "new-session",
      "-d",
      "-s",
      tmuxSession,
      "-n",
      windowName,
      command,
      ...buildRemainOnExitArgs(`${tmuxSession}:${windowName}`),
    ]);
  }

  function killWindow(tmuxSession, windowName) {
    runCommand("tmux", ["kill-window", "-t", `${tmuxSession}:${windowName}`], {
      allowFailure: true,
    });
  }

  function killSession(tmuxSession) {
    runCommand("tmux", ["kill-session", "-t", tmuxSession]);
  }

  function selectWindow(tmuxSession, windowName) {
    runCommand("tmux", ["select-window", "-t", `${tmuxSession}:${windowName}`], {
      allowFailure: true,
    });
  }

  function enableMouse(tmuxSession) {
    runCommand("tmux", ["set-option", "-t", tmuxSession, "mouse", "on"]);
  }

  function getAttachEnv() {
    const term = String(process.env.TERM || "").trim();
    if (!term || term === "dumb") {
      return { ...process.env, TERM: "xterm-256color" };
    }
    return process.env;
  }

  function attachSession(tmuxSession) {
    runCommand("tmux", ["attach-session", "-t", tmuxSession], {
      stdio: "inherit",
      env: getAttachEnv(),
    });
  }

  function buildTailPaneCommand({ root, appName, lines }) {
    const scriptPath = cliScriptPath || path.resolve(process.argv[1] || "");
    return (
      `cd ${shellQuote(root)} && ` +
      `node ${shellQuote(scriptPath)} tail ${shellQuote(appName)} --lines ${lines}`
    );
  }

  function openSplitAttachWindow({ root, tmuxSession, appNames, lines }) {
    const splitWindowName = "split-attach";
    const activeApps = appNames.filter((appName) => windowExists(tmuxSession, appName));
    if (activeApps.length === 0) {
      const error = new Error(`Error: no active app windows found in session "${tmuxSession}".`);
      error.isUsageError = true;
      throw error;
    }

    if (windowExists(tmuxSession, splitWindowName)) {
      killWindow(tmuxSession, splitWindowName);
    }

    const [firstApp, ...restApps] = activeApps;
    newWindow(tmuxSession, splitWindowName, buildTailPaneCommand({ root, appName: firstApp, lines }));

    for (const appName of restApps) {
      runCommand("tmux", [
        "split-window",
        "-d",
        "-t",
        `${tmuxSession}:${splitWindowName}`,
        "-v",
        buildTailPaneCommand({ root, appName, lines }),
      ]);
      runCommand("tmux", ["select-layout", "-t", `${tmuxSession}:${splitWindowName}`, "tiled"]);
    }

    selectWindow(tmuxSession, splitWindowName);
  }

  return {
    attachSession,
    captureWindowLogs,
    enableMouse,
    ensureInstalled,
    killSession,
    killWindow,
    listWindows,
    newSession,
    newWindow,
    openSplitAttachWindow,
    selectWindow,
    sessionExists,
    windowExists,
  };
}

module.exports = {
  createTmuxController,
};
