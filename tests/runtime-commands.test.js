const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../packages/_dev/src/internal/parse-args.js");
const { validateParsedArgs } = require("../packages/_dev/src/cli.js");
const { handleAttach } = require("../packages/_dev/src/internal/commands/attach.js");
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
          linesOverride: null,
        },
        runtime
      ),
    /already exists/
  );
});

test("start all with --attach opens the split attach view", () => {
  const runtime = createBaseRuntime();
  const calls = [];
  runtime.tmux = {
    ensureInstalled() {
      calls.push(["ensureInstalled"]);
    },
    sessionExists(session) {
      calls.push(["sessionExists", session]);
      return false;
    },
    newWindow(session, name, command) {
      calls.push(["newWindow", session, name, command]);
    },
    newSession(session, name, command) {
      calls.push(["newSession", session, name, command]);
    },
    enableMouse(session) {
      calls.push(["enableMouse", session]);
    },
    openSplitAttachWindow(options) {
      calls.push(["openSplitAttachWindow", options]);
    },
    attachSession(session) {
      calls.push(["attachSession", session]);
    },
  };

  handleStartOrRestart(
    {
      command: "start",
      app: "all",
      attachRequested: true,
      linesOverride: 180,
    },
    runtime
  );

  assert.deepEqual(calls, [
    ["ensureInstalled"],
    ["sessionExists", "dev-e2e-test"],
    ["newSession", "dev-e2e-test", "api", "cd '/tmp/project' && pnpm api"],
    ["newWindow", "dev-e2e-test", "web", "cd '/tmp/project' && pnpm web"],
    ["enableMouse", "dev-e2e-test"],
    [
      "openSplitAttachWindow",
      {
        root: "/tmp/project",
        tmuxSession: "dev-e2e-test",
        appNames: ["api", "web"],
        lines: 180,
      },
    ],
    ["attachSession", "dev-e2e-test"],
  ]);
});

test("start app with --attach selects the started window", () => {
  const runtime = createBaseRuntime();
  const calls = [];
  runtime.tmux = {
    ensureInstalled() {
      calls.push(["ensureInstalled"]);
    },
    sessionExists(session) {
      calls.push(["sessionExists", session]);
      return false;
    },
    newSession(session, name, command) {
      calls.push(["newSession", session, name, command]);
    },
    enableMouse(session) {
      calls.push(["enableMouse", session]);
    },
    selectWindow(session, name) {
      calls.push(["selectWindow", session, name]);
    },
    attachSession(session) {
      calls.push(["attachSession", session]);
    },
  };

  handleStartOrRestart(
    {
      command: "start",
      app: "web",
      attachRequested: true,
      linesOverride: null,
    },
    runtime
  );

  assert.deepEqual(calls, [
    ["ensureInstalled"],
    ["sessionExists", "dev-e2e-test"],
    ["newSession", "dev-e2e-test", "web", "cd '/tmp/project' && pnpm web"],
    ["enableMouse", "dev-e2e-test"],
    ["selectWindow", "dev-e2e-test", "web"],
    ["attachSession", "dev-e2e-test"],
  ]);
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

test("attach without an app opens the split attach window", () => {
  const runtime = createBaseRuntime();
  const calls = [];
  runtime.tmux = {
    ensureInstalled() {
      calls.push(["ensureInstalled"]);
    },
    sessionExists(session) {
      calls.push(["sessionExists", session]);
      return true;
    },
    enableMouse(session) {
      calls.push(["enableMouse", session]);
    },
    openSplitAttachWindow(options) {
      calls.push(["openSplitAttachWindow", options]);
    },
    attachSession(session) {
      calls.push(["attachSession", session]);
    },
  };

  handleAttach(
    {
      app: "",
      linesOverride: 250,
    },
    runtime
  );

  assert.deepEqual(calls, [
    ["ensureInstalled"],
    ["sessionExists", "dev-e2e-test"],
    ["enableMouse", "dev-e2e-test"],
    [
      "openSplitAttachWindow",
      {
        root: "/tmp/project",
        tmuxSession: "dev-e2e-test",
        appNames: ["api", "web"],
        lines: 250,
      },
    ],
    ["attachSession", "dev-e2e-test"],
  ]);
});

test("attach with an app selects the requested window", () => {
  const runtime = createBaseRuntime();
  const calls = [];
  runtime.tmux = {
    ensureInstalled() {
      calls.push(["ensureInstalled"]);
    },
    sessionExists(session) {
      calls.push(["sessionExists", session]);
      return true;
    },
    enableMouse(session) {
      calls.push(["enableMouse", session]);
    },
    windowExists(session, name) {
      calls.push(["windowExists", session, name]);
      return name === "web";
    },
    selectWindow(session, name) {
      calls.push(["selectWindow", session, name]);
    },
    attachSession(session) {
      calls.push(["attachSession", session]);
    },
  };

  handleAttach(
    {
      app: "web",
      linesOverride: null,
    },
    runtime
  );

  assert.deepEqual(calls, [
    ["ensureInstalled"],
    ["sessionExists", "dev-e2e-test"],
    ["enableMouse", "dev-e2e-test"],
    ["windowExists", "dev-e2e-test", "web"],
    ["selectWindow", "dev-e2e-test", "web"],
    ["attachSession", "dev-e2e-test"],
  ]);
});

test("attach with an app rejects --lines", () => {
  const runtime = createBaseRuntime();
  runtime.tmux = {
    ensureInstalled() {},
    sessionExists() {
      return true;
    },
    enableMouse() {},
  };

  assert.throws(
    () =>
      handleAttach(
        {
          app: "web",
          linesOverride: 50,
        },
        runtime
      ),
    /does not support --lines/
  );
});

test("attach supports --lines and split-attach is no longer a command", () => {
  assert.doesNotThrow(() =>
    validateParsedArgs(
      {
        command: "attach",
        attachRequested: false,
        linesOverride: 150,
        untilMarker: null,
        untilTimeoutSeconds: null,
      },
      "usage text"
    )
  );

  assert.throws(
    () =>
      validateParsedArgs(
        {
          command: "split-attach",
          attachRequested: false,
          linesOverride: null,
          untilMarker: null,
          untilTimeoutSeconds: null,
        },
        "usage text"
      ),
    /unknown command "split-attach"/
  );
});

test("start app with --lines rejects direct attach and -a aliases --attach", () => {
  assert.doesNotThrow(() => {
    const parsed = parseArgs(["start", "web", "-a"]);
    assert.equal(parsed.attachRequested, true);
    assert.equal(parsed.app, "web");
  });

  assert.throws(
    () =>
      validateParsedArgs(
        {
          command: "start",
          app: "web",
          attachRequested: true,
          linesOverride: 120,
          untilMarker: null,
          untilTimeoutSeconds: null,
        },
        "usage text"
      ),
    /start\/restart all with --attach/
  );

  assert.throws(() => parseArgs(["start", "api", "--split-attach"]), /unknown option "--split-attach"/);
});
