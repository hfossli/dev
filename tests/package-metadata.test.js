const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

test("published packages include package root readmes", () => {
  const packageRoots = [
    path.join(repoRoot, "packages/_dev"),
    path.join(repoRoot, "packages/@_dev/sdk"),
    path.join(repoRoot, "packages/@_dev/helpers"),
  ];

  for (const packageRoot of packageRoots) {
    assert.equal(fs.existsSync(path.join(packageRoot, "README.md")), true, `${packageRoot} is missing README.md`);
  }
});

test("@hfossli/dev depends on the current published workspace versions", () => {
  const devPkg = require("../packages/_dev/package.json");
  const sdkPkg = require("../packages/@_dev/sdk/package.json");
  const helpersPkg = require("../packages/@_dev/helpers/package.json");

  assert.equal(devPkg.dependencies["@hfossli/dev-sdk"], sdkPkg.version);
  assert.equal(devPkg.dependencies["@hfossli/dev-helpers"], helpersPkg.version);
});
