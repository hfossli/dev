const test = require("node:test");
const assert = require("node:assert/strict");

const { createTmuxController } = require("../packages/_dev/src/internal/runtime/tmux.js");

function createRunCommandStub() {
  const calls = [];

  function runCommand(cmd, args, options) {
    calls.push({ cmd, args, options });
    return {
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
    };
  }

  return {
    calls,
    runCommand,
  };
}

function createTmuxStateStub({ panes = [], windows = [] } = {}) {
  const calls = [];
  const state = {
    panes: panes.map((pane, index) => ({
      paneId: pane.paneId || `%${index}`,
      windowName: pane.windowName,
      appName: pane.appName || "",
      paneActive: pane.paneActive || false,
      paneTitle: pane.paneTitle || pane.windowName,
    })),
    windows: [...windows],
  };

  function updateWindowSet() {
    state.windows = [...new Set(state.panes.map((pane) => pane.windowName))];
  }

  function paneFromTarget(target) {
    if (!target) return null;
    if (target.startsWith("%")) {
      return state.panes.find((pane) => pane.paneId === target) || null;
    }
    const match = target.match(/^[^:]+:([^.:]+)(?:\.(\d+))?$/);
    if (!match) return null;
    const [, windowName, paneIndexText] = match;
    const paneIndex = Number.parseInt(paneIndexText || "0", 10);
    const panesInWindow = state.panes.filter((pane) => pane.windowName === windowName);
    return panesInWindow[paneIndex] || null;
  }

  function runCommand(cmd, args, options) {
    calls.push({ cmd, args, options });

    if (args[0] === "list-windows") {
      return {
        status: 0,
        stdout: state.windows.join("\n"),
        stderr: "",
        error: null,
      };
    }

    if (args[0] === "list-panes") {
      return {
        status: 0,
        stdout: state.panes
          .map(
            (pane, index) =>
              `${pane.paneId}\t${pane.windowName}\t@${pane.windowName}\t${index}\t${
                pane.paneActive ? "1" : "0"
              }\t${pane.appName}`
          )
          .join("\n"),
        stderr: "",
        error: null,
      };
    }

    if (args[0] === "set-option" && args[1] === "-pt" && args[3] === "@dev_app_name") {
      const pane = paneFromTarget(args[2]);
      if (pane) pane.appName = args[4];
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "select-pane" && args[1] === "-t" && args[3] === "-T") {
      const pane = paneFromTarget(args[2]);
      if (pane) pane.paneTitle = args[4];
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "rename-window") {
      const currentWindowName = String(args[2]).split(":")[1];
      const nextWindowName = args[3];
      for (const pane of state.panes) {
        if (pane.windowName === currentWindowName) {
          pane.windowName = nextWindowName;
        }
      }
      updateWindowSet();
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "join-pane") {
      const sourcePane = paneFromTarget(args[3]);
      const targetPane = paneFromTarget(args[5]);
      if (sourcePane && targetPane) {
        sourcePane.windowName = targetPane.windowName;
      }
      updateWindowSet();
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "kill-pane") {
      state.panes = state.panes.filter((pane) => pane.paneId !== args[2]);
      updateWindowSet();
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    return {
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
    };
  }

  return {
    calls,
    runCommand,
    state,
  };
}

test("newWindow keeps failed panes open for log inspection", () => {
  const stub = createRunCommandStub();
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.newWindow("dev-e2e-test", "api", "cd /tmp/project && pnpm api");

  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].cmd, "tmux");
  assert.deepEqual(stub.calls[0].args, [
    "new-window",
    "-d",
    "-t",
    "dev-e2e-test",
    "-n",
    "api",
    "cd /tmp/project && pnpm api",
    ";",
    "set-option",
    "-pt",
    "dev-e2e-test:api",
    "remain-on-exit",
    "failed",
  ]);
});

test("newSession keeps failed panes open for log inspection", () => {
  const stub = createRunCommandStub();
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.newSession("dev-e2e-test", "api", "cd /tmp/project && pnpm api");

  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].cmd, "tmux");
  assert.deepEqual(stub.calls[0].args, [
    "new-session",
    "-d",
    "-s",
    "dev-e2e-test",
    "-n",
    "api",
    "cd /tmp/project && pnpm api",
    ";",
    "set-option",
    "-pt",
    "dev-e2e-test:api",
    "remain-on-exit",
    "failed",
  ]);
});

test("captureWindowLogs preserves ANSI escape sequences", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "api",
        appName: "api",
      },
    ],
    windows: ["api"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.captureWindowLogs("dev-e2e-test", "api", 120);

  const captureCall = stub.calls.find((call) => call.args[0] === "capture-pane");
  assert.equal(captureCall.cmd, "tmux");
  assert.deepEqual(captureCall.args, [
    "capture-pane",
    "-e",
    "-p",
    "-J",
    "-S",
    "-120",
    "-t",
    "%0",
  ]);
});

test("labelAppPane tags the pane with the app name", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "api",
      },
    ],
    windows: ["api"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.labelAppPane("dev-e2e-test", "api");

  assert.equal(stub.state.panes[0].appName, "api");
  assert.equal(stub.state.panes[0].paneTitle, "api");
});

test("openSplitAttachWindow converts app windows into a real interactive dashboard", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "api",
        appName: "api",
      },
      {
        paneId: "%1",
        windowName: "web",
        appName: "web",
      },
    ],
    windows: ["api", "web"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.openSplitAttachWindow({
    tmuxSession: "dev-e2e-test",
    appNames: ["api", "web"],
  });

  assert.deepEqual(stub.state.windows, ["split-attach"]);
  assert.deepEqual(
    stub.state.panes.map((pane) => ({ paneId: pane.paneId, windowName: pane.windowName, appName: pane.appName })),
    [
      { paneId: "%0", windowName: "split-attach", appName: "api" },
      { paneId: "%1", windowName: "split-attach", appName: "web" },
    ]
  );

  const renameWindowCall = stub.calls.find((call) => call.args[0] === "rename-window");
  const joinPaneCall = stub.calls.find((call) => call.args[0] === "join-pane");
  const selectWindowCall = stub.calls.find((call) => call.args[0] === "select-window");
  const selectPaneCall = stub.calls.find((call) => call.args[0] === "select-pane" && call.args.length === 3);
  const borderStatusCall = stub.calls.find(
    (call) => call.args[0] === "set-window-option" && call.args[3] === "pane-border-status"
  );

  assert.deepEqual(renameWindowCall.args, ["rename-window", "-t", "dev-e2e-test:api", "split-attach"]);
  assert.deepEqual(joinPaneCall.args, ["join-pane", "-d", "-s", "%1", "-t", "%0"]);
  assert.deepEqual(selectWindowCall.args, ["select-window", "-t", "dev-e2e-test:split-attach"]);
  assert.deepEqual(selectPaneCall.args, ["select-pane", "-t", "%0"]);
  assert.deepEqual(borderStatusCall.args, [
    "set-window-option",
    "-t",
    "dev-e2e-test:split-attach",
    "pane-border-status",
    "top",
  ]);
});

test("openSplitAttachWindow re-resolves unlabeled panes after renaming the base window", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "admin",
      },
      {
        paneId: "%1",
        windowName: "web",
      },
    ],
    windows: ["admin", "web"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.openSplitAttachWindow({
    tmuxSession: "dev-e2e-test",
    appNames: ["admin", "web", "mobile"],
  });

  const joinPaneCalls = stub.calls.filter((call) => call.args[0] === "join-pane");

  assert.equal(joinPaneCalls.length, 1);
  assert.deepEqual(joinPaneCalls[0].args, ["join-pane", "-d", "-s", "%1", "-t", "%0"]);
  assert.deepEqual(stub.state.windows, ["split-attach"]);
  assert.deepEqual(
    stub.state.panes.map((pane) => ({ paneId: pane.paneId, windowName: pane.windowName, appName: pane.appName })),
    [
      { paneId: "%0", windowName: "split-attach", appName: "admin" },
      { paneId: "%1", windowName: "split-attach", appName: "web" },
    ]
  );
});
