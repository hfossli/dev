const { run } = require("./process.js");

const APP_OPTION = "@dev_app_name";
const SPLIT_ATTACH_WINDOW = "split-attach";

function createTmuxController({ runCommand = run } = {}) {
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

  function listPanes(tmuxSession) {
    const listed = runCommand(
      "tmux",
      [
        "list-panes",
        "-a",
        "-t",
        tmuxSession,
        "-F",
        `#{pane_id}\t#{window_name}\t#{window_id}\t#{pane_index}\t#{pane_active}\t#{${APP_OPTION}}`,
      ],
      {
        allowFailure: true,
      }
    );
    if (listed.status !== 0) return [];
    return listed.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [paneId, windowName, windowId, paneIndex, paneActive, appName] = line.split("\t");
        return {
          paneId,
          windowName,
          windowId,
          paneIndex: Number.parseInt(paneIndex, 10) || 0,
          paneActive: paneActive === "1",
          appName: appName || "",
        };
      });
  }

  function windowExists(tmuxSession, windowName) {
    return listWindows(tmuxSession).includes(windowName);
  }

  function setPaneOption(target, name, value) {
    runCommand("tmux", ["set-option", "-pt", target, name, value]);
  }

  function setPaneTitle(target, title) {
    runCommand("tmux", ["select-pane", "-t", target, "-T", title], {
      allowFailure: true,
    });
  }

  function labelAppPane(tmuxSession, appName, target = `${tmuxSession}:${appName}.0`) {
    setPaneOption(target, APP_OPTION, appName);
    setPaneTitle(target, appName);
  }

  function findAppPane(tmuxSession, appName) {
    const pane = listPanes(tmuxSession).find((entry) => entry.appName === appName);
    if (pane) return pane;

    if (!windowExists(tmuxSession, appName)) {
      return null;
    }

    const target = `${tmuxSession}:${appName}.0`;
    labelAppPane(tmuxSession, appName, target);
    return {
      paneId: target,
      windowName: appName,
      windowId: "",
      paneIndex: 0,
      paneActive: false,
      appName,
    };
  }

  function appExists(tmuxSession, appName) {
    return findAppPane(tmuxSession, appName) !== null;
  }

  function captureWindowLogs(tmuxSession, appName, lines) {
    const pane = findAppPane(tmuxSession, appName);
    const target = pane ? pane.paneId : `${tmuxSession}:${appName}`;
    const captured = runCommand(
      "tmux",
      ["capture-pane", "-e", "-p", "-J", "-S", `-${lines}`, "-t", target],
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

  function selectPane(target) {
    runCommand("tmux", ["select-pane", "-t", target], {
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

  function sendKeysToWindow(tmuxSession, windowName, keys) {
    runCommand("tmux", ["send-keys", "-t", `${tmuxSession}:${windowName}`, ...keys], {
      allowFailure: true,
    });
  }

  function sendKeysToApp(tmuxSession, appName, keys) {
    const pane = findAppPane(tmuxSession, appName);
    if (!pane) return;
    runCommand("tmux", ["send-keys", "-t", pane.paneId, ...keys], {
      allowFailure: true,
    });
  }

  function killPane(target) {
    runCommand("tmux", ["kill-pane", "-t", target], {
      allowFailure: true,
    });
  }

  function killApp(tmuxSession, appName) {
    const pane = findAppPane(tmuxSession, appName);
    if (!pane) return false;
    killPane(pane.paneId);
    return true;
  }

  function renameWindow(tmuxSession, currentWindowName, nextWindowName) {
    runCommand("tmux", ["rename-window", "-t", `${tmuxSession}:${currentWindowName}`, nextWindowName], {
      allowFailure: true,
    });
  }

  function joinPane(sourcePaneId, targetPaneId) {
    runCommand("tmux", ["join-pane", "-d", "-s", sourcePaneId, "-t", targetPaneId]);
  }

  function selectLayout(target, layout) {
    runCommand("tmux", ["select-layout", "-t", target, layout], {
      allowFailure: true,
    });
  }

  function configureSplitAttachWindow(tmuxSession) {
    const target = `${tmuxSession}:${SPLIT_ATTACH_WINDOW}`;
    runCommand("tmux", ["set-window-option", "-t", target, "pane-border-status", "top"], {
      allowFailure: true,
    });
    runCommand("tmux", ["set-window-option", "-t", target, "pane-border-format", "#{@dev_app_name}"], {
      allowFailure: true,
    });
  }

  function selectApp(tmuxSession, appName) {
    const pane = findAppPane(tmuxSession, appName);
    if (!pane) return false;
    selectWindow(tmuxSession, pane.windowName);
    selectPane(pane.paneId);
    return true;
  }

  function openSplitAttachWindow({ tmuxSession, appNames }) {
    const activeAppNames = appNames.filter((appName) => findAppPane(tmuxSession, appName));
    if (activeAppNames.length === 0) {
      const error = new Error(`Error: no active app windows found in session "${tmuxSession}".`);
      error.isUsageError = true;
      throw error;
    }

    const panes = listPanes(tmuxSession);
    const dashboardPanes = panes.filter((pane) => pane.windowName === SPLIT_ATTACH_WINDOW);
    const dashboardAppPanes = dashboardPanes.filter((pane) => pane.appName);

    if (dashboardPanes.length > 0 && dashboardAppPanes.length === 0) {
      killWindow(tmuxSession, SPLIT_ATTACH_WINDOW);
    }

    let basePane = listPanes(tmuxSession).find(
      (pane) => pane.windowName === SPLIT_ATTACH_WINDOW && pane.appName
    );

    if (!basePane) {
      const [firstAppName] = activeAppNames;
      const firstPane = findAppPane(tmuxSession, firstAppName);
      if (firstPane && firstPane.windowName !== SPLIT_ATTACH_WINDOW) {
        renameWindow(tmuxSession, firstPane.windowName, SPLIT_ATTACH_WINDOW);
      }
      basePane = findAppPane(tmuxSession, firstAppName);
    }

    if (!basePane) {
      const error = new Error(`Error: failed to prepare split attach window for session "${tmuxSession}".`);
      error.isUsageError = true;
      throw error;
    }

    for (const pane of listPanes(tmuxSession)) {
      if (pane.windowName === SPLIT_ATTACH_WINDOW && !pane.appName) {
        killPane(pane.paneId);
      }
    }

    for (const appName of activeAppNames) {
      const pane = findAppPane(tmuxSession, appName);
      if (!pane) continue;
      if (pane.paneId === basePane.paneId || pane.windowName === SPLIT_ATTACH_WINDOW) continue;
      joinPane(pane.paneId, basePane.paneId);
      selectLayout(`${tmuxSession}:${SPLIT_ATTACH_WINDOW}`, "tiled");
    }

    configureSplitAttachWindow(tmuxSession);
    selectWindow(tmuxSession, SPLIT_ATTACH_WINDOW);
    selectPane(basePane.paneId);
  }

  return {
    appExists,
    attachSession,
    captureWindowLogs,
    enableMouse,
    ensureInstalled,
    findAppPane,
    killSession,
    killApp,
    killPane,
    killWindow,
    labelAppPane,
    listWindows,
    newSession,
    newWindow,
    openSplitAttachWindow,
    selectApp,
    selectPane,
    sendKeysToWindow,
    sendKeysToApp,
    selectWindow,
    sessionExists,
    windowExists,
  };
}

module.exports = {
  createTmuxController,
};
