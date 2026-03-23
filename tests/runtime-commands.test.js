const test = require("node:test");
const assert = require("node:assert/strict");

const { handleStartOrRestart } = require("../packages/_dev/src/internal/commands/start-restart.js");
const { handleLogs } = require("../packages/_dev/src/internal/commands/logs.js");

function createBaseRuntime() {
  return {
    appNames: ["api", "web"],
    apps: {
      api: {
        start: "pnpm api",
      },
      web: {
        start: "pnpm web",
      },
    },
    root: "/tmp/project",
    tmuxSession: "dev-e2e-test",
    usageText: "usage text",
  };
}

test("start refuses to create a window that already exists", () => {
  const runtime = createBaseRuntime();
  runtime.tmux = {
    ensureInstalled() {},
    sessionExists() {
      return true;
    },
    windowExists(_session, name) {
      return name === "api";
    },
  };

  assert.throws(
    () =>
      handleStartOrRestart(
        {
          command: "start",
          app: "api",
          attachRequested: false,
          splitAttachRequested: false,
          linesOverride: null,
        },
        runtime
      ),
    /already exists/
  );
});

test("logs surfaces tmux capture failures", () => {
  const runtime = createBaseRuntime();
  runtime.tmux = {
    ensureInstalled() {},
    sessionExists() {
      return true;
    },
    windowExists() {
      return true;
    },
    captureWindowLogs() {
      throw new Error("capture failed");
    },
  };

  assert.throws(
    () =>
      handleLogs(
        {
          app: "api",
          linesOverride: 20,
        },
        runtime
      ),
    /capture failed/
  );
});
