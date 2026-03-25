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
      command: pane.command || "",
    })),
    windows: [...windows],
  };

  function updateWindowSet() {
    state.windows = [...new Set(state.panes.map((pane) => pane.windowName))];
  }

  function nextPaneId() {
    const maxId = state.panes.reduce((max, pane) => {
      const numericId = Number.parseInt(String(pane.paneId).replace(/^%/, ""), 10);
      return Number.isInteger(numericId) ? Math.max(max, numericId) : max;
    }, -1);
    return `%${maxId + 1}`;
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
              }\t${pane.appName}\t${pane.paneTitle}`
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

    if (args[0] === "set-option" && args[1] === "-pt") {
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "select-pane" && args[1] === "-t" && args[3] === "-T") {
      const pane = paneFromTarget(args[2]);
      if (pane) pane.paneTitle = args[4];
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "new-window") {
      const windowName = args[args.indexOf("-n") + 1];
      const paneId = nextPaneId();
      state.panes.push({
        paneId,
        windowName,
        appName: "",
        paneActive: false,
        paneTitle: windowName,
        command: args[args.length - 1],
      });
      updateWindowSet();
      return { status: 0, stdout: paneId, stderr: "", error: null };
    }

    if (args[0] === "split-window") {
      const targetPane = paneFromTarget(args[args.indexOf("-t") + 1]);
      const paneId = nextPaneId();
      if (targetPane) {
        state.panes.push({
          paneId,
          windowName: targetPane.windowName,
          appName: "",
          paneActive: false,
          paneTitle: targetPane.windowName,
          command: args[args.length - 1],
        });
      }
      updateWindowSet();
      return { status: 0, stdout: paneId, stderr: "", error: null };
    }

    if (args[0] === "break-pane") {
      const sourcePane = paneFromTarget(args[3]);
      const nextWindowName = args[5];
      if (sourcePane) {
        sourcePane.windowName = nextWindowName;
      }
      updateWindowSet();
      return { status: 0, stdout: "", stderr: "", error: null };
    }

    if (args[0] === "kill-window") {
      const windowName = String(args[2]).split(":")[1];
      state.panes = state.panes.filter((pane) => pane.windowName !== windowName);
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

test("sendKeysToApp forwards named keys to the tagged app pane", () => {
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

  tmux.sendKeysToApp("dev-e2e-test", "api", ["Enter"]);

  const sendKeysCall = stub.calls.find((call) => call.args[0] === "send-keys");
  assert.deepEqual(sendKeysCall.args, ["send-keys", "-t", "%0", "Enter"]);
});

test("sendKeysToApp can send literal text to the tagged app pane", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "web",
        appName: "web",
      },
    ],
    windows: ["web"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  tmux.sendKeysToApp("dev-e2e-test", "web", ["cr"], { literal: true });

  const sendKeysCall = stub.calls.find((call) => call.args[0] === "send-keys");
  assert.deepEqual(sendKeysCall.args, ["send-keys", "-l", "-t", "%0", "cr"]);
});

test("killApp removes the named app window and its matching split-attach mirror pane", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "api",
        appName: "api",
        paneTitle: "api",
      },
      {
        paneId: "%1",
        windowName: "web",
        appName: "web",
        paneTitle: "web",
      },
      {
        paneId: "%2",
        windowName: "split-attach",
        paneTitle: "api",
      },
      {
        paneId: "%3",
        windowName: "split-attach",
        paneTitle: "web",
      },
    ],
    windows: ["api", "web", "split-attach"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  assert.equal(tmux.killApp("dev-e2e-test", "api"), true);
  assert.equal(tmux.appExists("dev-e2e-test", "api"), false);

  assert.deepEqual(stub.state.windows, ["web", "split-attach"]);
  assert.deepEqual(
    stub.state.panes.map((pane) => ({
      paneId: pane.paneId,
      windowName: pane.windowName,
      appName: pane.appName,
      paneTitle: pane.paneTitle,
    })),
    [
      { paneId: "%1", windowName: "web", appName: "web", paneTitle: "web" },
      { paneId: "%3", windowName: "split-attach", appName: "", paneTitle: "web" },
    ]
  );

  const killWindowCall = stub.calls.find((call) => call.args[0] === "kill-window");
  const killPaneCall = stub.calls.find((call) => call.args[0] === "kill-pane");

  assert.deepEqual(killWindowCall.args, ["kill-window", "-t", "dev-e2e-test:api"]);
  assert.deepEqual(killPaneCall.args, ["kill-pane", "-t", "%2"]);
});

test("openSplitAttachWindow creates a dashboard without moving the live app windows", () => {
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
  const tmux = createTmuxController({
    runCommand: stub.runCommand,
    cliScriptPath: "/tmp/bin/_dev.js",
  });

  tmux.openSplitAttachWindow({
    tmuxSession: "dev-e2e-test",
    appNames: ["api", "web"],
    lines: 180,
    root: "/tmp/project",
  });

  assert.deepEqual(stub.state.windows, ["api", "web", "split-attach"]);
  assert.deepEqual(
    stub.state.panes.map((pane) => ({
      paneId: pane.paneId,
      windowName: pane.windowName,
      appName: pane.appName,
      paneTitle: pane.paneTitle,
    })),
    [
      { paneId: "%0", windowName: "api", appName: "api", paneTitle: "api" },
      { paneId: "%1", windowName: "web", appName: "web", paneTitle: "web" },
      { paneId: "%2", windowName: "split-attach", appName: "", paneTitle: "api" },
      { paneId: "%3", windowName: "split-attach", appName: "", paneTitle: "web" },
    ]
  );

  const newWindowCall = stub.calls.find((call) => call.args[0] === "new-window" && call.args.includes("split-attach"));
  const splitWindowCall = stub.calls.find((call) => call.args[0] === "split-window");
  const selectLayoutCall = stub.calls.find((call) => call.args[0] === "select-layout");
  const selectWindowCall = stub.calls.find((call) => call.args[0] === "select-window");
  const selectPaneCall = stub.calls.find((call) => call.args[0] === "select-pane" && call.args.length === 3);
  const borderStatusCall = stub.calls.find(
    (call) => call.args[0] === "set-window-option" && call.args[3] === "pane-border-status"
  );
  const borderFormatCall = stub.calls.find(
    (call) => call.args[0] === "set-window-option" && call.args[3] === "pane-border-format"
  );

  assert.deepEqual(newWindowCall.args.slice(0, 11), [
    "new-window",
    "-d",
    "-P",
    "-F",
    "#{pane_id}",
    "-t",
    "dev-e2e-test",
    "-n",
    "split-attach",
    "-c",
    "/tmp/project",
  ]);
  assert.match(newWindowCall.args[11], /_DEV_SPLIT_ATTACH=1/);
  assert.match(newWindowCall.args[11], /tail 'api' --lines 180/);
  assert.deepEqual(splitWindowCall.args.slice(0, 9), [
    "split-window",
    "-d",
    "-P",
    "-F",
    "#{pane_id}",
    "-t",
    "dev-e2e-test:split-attach",
    "-c",
    "/tmp/project",
  ]);
  assert.match(splitWindowCall.args[9], /tail 'web' --lines 180/);
  assert.deepEqual(selectLayoutCall.args, ["select-layout", "-t", "dev-e2e-test:split-attach", "tiled"]);
  assert.deepEqual(selectWindowCall.args, ["select-window", "-t", "dev-e2e-test:split-attach"]);
  assert.deepEqual(selectPaneCall.args, ["select-pane", "-t", "%2"]);
  assert.deepEqual(borderStatusCall.args, [
    "set-window-option",
    "-t",
    "dev-e2e-test:split-attach",
    "pane-border-status",
    "top",
  ]);
  assert.deepEqual(borderFormatCall.args, [
    "set-window-option",
    "-t",
    "dev-e2e-test:split-attach",
    "pane-border-format",
    "#{pane_title}",
  ]);
});

test("openSplitAttachWindow re-resolves unlabeled app windows before creating the dashboard", () => {
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
  const tmux = createTmuxController({
    runCommand: stub.runCommand,
    cliScriptPath: "/tmp/bin/_dev.js",
  });

  tmux.openSplitAttachWindow({
    tmuxSession: "dev-e2e-test",
    appNames: ["admin", "web", "mobile"],
    lines: 90,
    root: "/tmp/project",
  });

  assert.deepEqual(stub.state.windows, ["admin", "web", "split-attach"]);
  assert.deepEqual(
    stub.state.panes.map((pane) => ({
      paneId: pane.paneId,
      windowName: pane.windowName,
      appName: pane.appName,
      paneTitle: pane.paneTitle,
    })),
    [
      { paneId: "%0", windowName: "admin", appName: "admin", paneTitle: "admin" },
      { paneId: "%1", windowName: "web", appName: "web", paneTitle: "web" },
      { paneId: "%2", windowName: "split-attach", appName: "", paneTitle: "admin" },
      { paneId: "%3", windowName: "split-attach", appName: "", paneTitle: "web" },
    ]
  );
});

test("selectApp restores a legacy split-attach pane back into its own app window", () => {
  const stub = createTmuxStateStub({
    panes: [
      {
        paneId: "%0",
        windowName: "split-attach",
        appName: "api",
        paneTitle: "api",
      },
      {
        paneId: "%1",
        windowName: "split-attach",
        appName: "web",
        paneTitle: "web",
      },
    ],
    windows: ["split-attach"],
  });
  const tmux = createTmuxController({ runCommand: stub.runCommand });

  assert.equal(tmux.selectApp("dev-e2e-test", "web"), true);

  assert.deepEqual(stub.state.windows, ["split-attach", "web"]);
  assert.deepEqual(
    stub.state.panes.map((pane) => ({
      paneId: pane.paneId,
      windowName: pane.windowName,
      appName: pane.appName,
    })),
    [
      { paneId: "%0", windowName: "split-attach", appName: "api" },
      { paneId: "%1", windowName: "web", appName: "web" },
    ]
  );

  const breakPaneCall = stub.calls.find((call) => call.args[0] === "break-pane");
  const selectWindowCall = stub.calls.filter((call) => call.args[0] === "select-window").at(-1);
  const selectPaneCall = stub.calls.filter((call) => call.args[0] === "select-pane" && call.args.length === 3).at(-1);

  assert.deepEqual(breakPaneCall.args, ["break-pane", "-d", "-s", "%1", "-n", "web"]);
  assert.deepEqual(selectWindowCall.args, ["select-window", "-t", "dev-e2e-test:web"]);
  assert.deepEqual(selectPaneCall.args, ["select-pane", "-t", "%1"]);
});
