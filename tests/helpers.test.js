const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { leasePort } = require("../packages/@_dev/helpers");

function listJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listJsFiles(target));
      continue;
    }
    if (entry.isFile() && target.endsWith(".js")) {
      results.push(target);
    }
  }
  return results;
}

test("leasePort is stable for the same cwd/session/basePort", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dev-port-helper-"));
  process.env.PORTLEASE_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "dev-port-cache-"));
  process.env.PORTLEASE_SKIP_PORT_CHECK = "1";
  const first = leasePort({ name: "web", basePort: 3900, cwd, session: "helper-test" });
  const second = leasePort({ name: "web", basePort: 3900, cwd, session: "helper-test" });

  assert.equal(first, second);
  assert.match(first, /^\d+$/);
});

test("public helpers do not import CLI internals", () => {
  const helpersRoot = path.join(__dirname, "..", "packages/@_dev/helpers");
  const files = listJsFiles(helpersRoot);

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /packages\/_dev/);
    assert.doesNotMatch(source, /src\/dev\.tools/);
  }
});
