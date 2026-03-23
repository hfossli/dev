const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "packages/_dev/bin/_dev.js");
const nodePath = path.join(repoRoot, "packages");
const portleaseCacheDir = path.join(os.tmpdir(), "dev-cli-smoke-portlease");

function runCli(args, cwd) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      NODE_PATH: nodePath,
      PORTLEASE_CACHE_DIR: portleaseCacheDir,
      PORTLEASE_SKIP_PORT_CHECK: "1",
    },
    encoding: "utf8",
  });
}

test("basic example config loads through the CLI cmd command", () => {
  const exampleRoot = path.join(repoRoot, "examples/basic");
  const output = runCli(["cmd", "api"], exampleRoot);
  assert.match(output, /^cd '.*examples\/basic' && echo basic-api-/);
});

test("worktree example config loads through the CLI cmd command", () => {
  const exampleRoot = path.join(repoRoot, "examples/worktree");
  const output = runCli(["cmd", "web"], exampleRoot);
  assert.match(output, /^cd '.*examples\/worktree' && pnpm run dev --port "\d+"/);
});

test("basic example tool runs through the CLI tool command", () => {
  const exampleRoot = path.join(repoRoot, "examples/basic");
  const output = runCli(["tool", "hello", "team"], exampleRoot);
  assert.match(output, /Running tool "hello": echo hello 'team'/);
  assert.match(output, /hello team/);
});
