const path = require("node:path");
const { run } = require("./process.js");
const { shellQuote, withInheritedPath } = require("./shell.js");

const APP_OPTION = "@dev_app_name";
const SPLIT_ATTACH_WINDOW = "split-attach";
const SPLIT_ATTACH_ENV = "_DEV_SPLIT_ATTACH";
const DEFAULT_SPLIT_ATTACH_LINES = 120;

function createTmuxController({
  runCommand = run,
  cliScriptPath = path.resolve(__dirname, "../../bin/_dev.js"),
} = {}) {
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
        `#{pane_id}\t#{window_name}\t#{window_id}\t#{pane_index}\t#{pane_active}\t#{${APP_OPTION}}\t#{pane_title}`,
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
        const [paneId, windowName, windowId, paneIndex, paneActive, appName, paneTitle] = line.split("\t");
        return {
          paneId,
          windowName,
          windowId,
          paneIndex: Number.parseInt(paneIndex, 10) || 0,
          paneActive: paneActive === "1",
          appName: appName || "",
          paneTitle: paneTitle || "",
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
    const taggedPanes = listPanes(tmuxSession).filter((entry) => entry.appName === appName);
    const standalonePane = taggedPanes.find((entry) => entry.windowName !== SPLIT_ATTACH_WINDOW);
    if (standalonePane) return standalonePane;

    if (windowExists(tmuxSession, appName)) {
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

    return taggedPanes[0] || null;
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

  function sendKeysToApp(tmuxSession, appName, keys, options = {}) {
    const pane = findAppPane(tmuxSession, appName);
    if (!pane) return;
    const args = ["send-keys"];
    if (options.literal) {
      args.push("-l");
    }
    args.push("-t", pane.paneId, ...keys);
    runCommand("tmux", args, {
      allowFailure: true,
    });
  }

  function killPane(target) {
    runCommand("tmux", ["kill-pane", "-t", target], {
      allowFailure: true,
    });
  }

  function findSplitAttachMirrorPanes(tmuxSession, appName) {
    return listPanes(tmuxSession).filter(
      (pane) =>
        pane.windowName === SPLIT_ATTACH_WINDOW && pane.appName === "" && pane.paneTitle === appName
    );
  }

  function killApp(tmuxSession, appName) {
    const pane = findAppPane(tmuxSession, appName);
    const mirrorPanes = findSplitAttachMirrorPanes(tmuxSession, appName);
    let killed = false;

    if (pane) {
      if (pane.windowName === appName) {
        killWindow(tmuxSession, appName);
      } else {
        killPane(pane.paneId);
      }
      killed = true;
    }

    for (const mirrorPane of mirrorPanes) {
      killPane(mirrorPane.paneId);
      killed = true;
    }

    return killed;
  }

  function selectLayout(target, layout) {
    runCommand("tmux", ["select-layout", "-t", target, layout], {
      allowFailure: true,
    });
  }

  function breakPaneToWindow(sourcePaneId, windowName) {
    runCommand("tmux", ["break-pane", "-d", "-s", sourcePaneId, "-n", windowName]);
  }

  function configureSplitAttachWindow(tmuxSession) {
    const target = `${tmuxSession}:${SPLIT_ATTACH_WINDOW}`;
    runCommand("tmux", ["set-window-option", "-t", target, "pane-border-status", "top"], {
      allowFailure: true,
    });
    runCommand("tmux", ["set-window-option", "-t", target, "pane-border-format", "#{pane_title}"], {
      allowFailure: true,
    });
  }

  function ensureStandaloneAppPane(tmuxSession, appName) {
    const pane = findAppPane(tmuxSession, appName);
    if (!pane) return null;
    if (pane.windowName !== SPLIT_ATTACH_WINDOW) return pane;
    if (windowExists(tmuxSession, appName)) {
      return findAppPane(tmuxSession, appName);
    }

    breakPaneToWindow(pane.paneId, appName);
    labelAppPane(tmuxSession, appName, `${tmuxSession}:${appName}.0`);
    return findAppPane(tmuxSession, appName);
  }

  function buildSplitAttachMirrorCommand(appName, lines) {
    const lineCount =
      Number.isInteger(lines) && lines > 0 ? lines : DEFAULT_SPLIT_ATTACH_LINES;
    return withInheritedPath(
      `env ${SPLIT_ATTACH_ENV}=1 ${shellQuote(process.execPath)} ${shellQuote(
        cliScriptPath
      )} tail ${shellQuote(appName)} --lines ${lineCount}`
    );
  }

  function createCommandWindow({ tmuxSession, windowName, command, cwd }) {
    const args = ["new-window", "-d", "-P", "-F", "#{pane_id}", "-t", tmuxSession, "-n", windowName];
    if (cwd) {
      args.push("-c", cwd);
    }
    args.push(command);
    return runCommand("tmux", args).stdout;
  }

  function splitCommandPane({ target, command, cwd }) {
    const args = ["split-window", "-d", "-P", "-F", "#{pane_id}", "-t", target];
    if (cwd) {
      args.push("-c", cwd);
    }
    args.push(command);
    return runCommand("tmux", args).stdout;
  }

  function createSplitAttachPane({ tmuxSession, appName, lines, root, target }) {
    const command = buildSplitAttachMirrorCommand(appName, lines);
    const paneTarget = target
      ? splitCommandPane({ target, command, cwd: root })
      : createCommandWindow({
          tmuxSession,
          windowName: SPLIT_ATTACH_WINDOW,
          command,
          cwd: root,
        });

    const normalizedTarget = String(paneTarget || "").trim() || target || `${tmuxSession}:${SPLIT_ATTACH_WINDOW}.0`;
    setPaneTitle(normalizedTarget, appName);
    setPaneOption(normalizedTarget, "remain-on-exit", "failed");
    return normalizedTarget;
  }

  function selectApp(tmuxSession, appName) {
    const pane = ensureStandaloneAppPane(tmuxSession, appName);
    if (!pane) return false;
    selectWindow(tmuxSession, pane.windowName);
    selectPane(pane.paneId);
    return true;
  }

  function openSplitAttachWindow({ tmuxSession, appNames, lines, root }) {
    const activeAppNames = appNames.filter((appName) => ensureStandaloneAppPane(tmuxSession, appName));
    if (activeAppNames.length === 0) {
      const error = new Error(`Error: no active app windows found in session "${tmuxSession}".`);
      error.isUsageError = true;
      throw error;
    }

    killWindow(tmuxSession, SPLIT_ATTACH_WINDOW);

    const [firstAppName, ...restAppNames] = activeAppNames;
    const basePaneTarget = createSplitAttachPane({
      tmuxSession,
      appName: firstAppName,
      lines,
      root,
      target: "",
    });

    for (const appName of restAppNames) {
      createSplitAttachPane({
        tmuxSession,
        appName,
        lines,
        root,
        target: `${tmuxSession}:${SPLIT_ATTACH_WINDOW}`,
      });
    }

    if (restAppNames.length > 0) {
      selectLayout(`${tmuxSession}:${SPLIT_ATTACH_WINDOW}`, "tiled");
    }
    configureSplitAttachWindow(tmuxSession);
    selectWindow(tmuxSession, SPLIT_ATTACH_WINDOW);
    selectPane(basePaneTarget);
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
