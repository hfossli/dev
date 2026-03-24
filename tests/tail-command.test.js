const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleInteractiveInputChunk,
  renderTailSnapshot,
} = require("../packages/_dev/src/internal/commands/tail.js");

test("renderTailSnapshot appends only new lines in standard tail mode", () => {
  const writes = [];

  const rendered = renderTailSnapshot({
    snapshot: "second\nthird",
    previousLines: ["first", "second"],
    previousSnapshot: "first\nsecond",
    fullRefresh: false,
    write(text) {
      writes.push(text);
    },
  });

  assert.deepEqual(writes, ["third\n"]);
  assert.deepEqual(rendered.nextLines, ["second", "third"]);
  assert.equal(rendered.nextSnapshot, "second\nthird");
});

test("renderTailSnapshot clears and redraws in split-attach mirror mode", () => {
  const writes = [];

  const rendered = renderTailSnapshot({
    snapshot: "\u001b[32mready\u001b[39m",
    previousLines: ["old output"],
    previousSnapshot: "old output",
    fullRefresh: true,
    write(text) {
      writes.push(text);
    },
  });

  assert.deepEqual(writes, ["\u001b[2J\u001b[H", "\u001b[32mready\u001b[39m\n"]);
  assert.deepEqual(rendered.nextLines, ["\u001b[32mready\u001b[39m"]);
  assert.equal(rendered.nextSnapshot, "\u001b[32mready\u001b[39m");
});

test("handleInteractiveInputChunk forwards c and r to the backing app window", () => {
  const calls = [];
  const tmux = {
    sendKeysToApp(session, appName, keys) {
      calls.push([session, appName, keys]);
    },
  };

  assert.equal(
    handleInteractiveInputChunk("c", {
      appName: "web",
      stopTail() {
        throw new Error("stopTail should not be called for c");
      },
      tmux,
      tmuxSession: "dev-e2e-test",
    }),
    true
  );

  assert.equal(
    handleInteractiveInputChunk("r", {
      appName: "web",
      stopTail() {
        throw new Error("stopTail should not be called for r");
      },
      tmux,
      tmuxSession: "dev-e2e-test",
    }),
    true
  );

  assert.deepEqual(calls, [
    ["dev-e2e-test", "web", ["c"]],
    ["dev-e2e-test", "web", ["r"]],
  ]);
});

test("handleInteractiveInputChunk stops the mirror tail on ctrl-c", () => {
  const calls = [];
  let stoppedWith = null;

  const handled = handleInteractiveInputChunk("\u0003", {
    appName: "api",
    stopTail(code) {
      stoppedWith = code;
    },
    tmux: {
      sendKeysToApp(session, appName, keys) {
        calls.push([session, appName, keys]);
      },
    },
    tmuxSession: "dev-e2e-test",
  });

  assert.equal(handled, true);
  assert.equal(stoppedWith, 0);
  assert.deepEqual(calls, []);
});
