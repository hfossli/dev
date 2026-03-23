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
