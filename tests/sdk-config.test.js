const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { defineConfig, isDefinedConfig } = require("../packages/@_dev/sdk");
const {
  findConfigPath,
  loadRuntimeConfig,
} = require("../packages/_dev/src/internal/config/load-config.js");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dev-config-test-"));
}

test("defineConfig marks modern configs", () => {
  const config = defineConfig(() => ({ apps: {} }));
  assert.equal(typeof config, "function");
  assert.equal(isDefinedConfig(config), true);
});

test("loadRuntimeConfig loads modern defineConfig configs with runtime context", async () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, "_dev.config.js"),
    [
      'const { defineConfig } = require("@_dev/sdk");',
      "",
      "module.exports = defineConfig(({ root, cwd, session, env, platform }) => ({",
      "  apps: {",
      "    api: {",
      '      start: () => `echo ${root} ${cwd} ${session} ${platform} ${env.NODE_PATH ? "yes" : "no"}`',
      "    }",
      "  }",
      "}));",
      "",
    ].join("\n")
  );

  const { mode, config } = await loadRuntimeConfig({
    root: dir,
    cwd: dir,
    session: "session-1",
  });

  assert.equal(mode, "modern");
  assert.equal(typeof config.apps.api.start, "function");
  assert.match(config.apps.api.start(), /session-1/);
});

test("loadRuntimeConfig supports legacy config(session) and emits a deprecation warning", async () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, "_dev.config.js"),
    "module.exports = (session) => ({ apps: { api: { start: () => `echo ${session}` } } });\n"
  );

  let stderr = "";
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += String(chunk);
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    const { mode, config } = await loadRuntimeConfig({
      root: dir,
      cwd: dir,
      session: "legacy-session",
    });
    assert.equal(mode, "legacy");
    assert.equal(config.apps.api.start(), "echo legacy-session");
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.match(stderr, /legacy config\(session\) API/);
});

test("loadRuntimeConfig rejects invalid exports with a focused error", async () => {
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, "_dev.config.js"), "module.exports = { nope: true };\n");

  await assert.rejects(
    () =>
      loadRuntimeConfig({
        root: dir,
        cwd: dir,
        session: "broken",
      }),
    /must export defineConfig/
  );
});

test("findConfigPath prefers _dev.config.js over legacy names", () => {
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, "dev.config.js"), "module.exports = () => ({ apps: {} });\n");
  fs.writeFileSync(path.join(dir, "_dev.config.js"), "module.exports = () => ({ apps: {} });\n");

  assert.equal(findConfigPath(dir), path.join(dir, "_dev.config.js"));
});

test("loadRuntimeConfig loads _dev.config.ts with TypeScript syntax", async () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, "_dev.config.ts"),
    [
      'import { defineConfig } from "@_dev/sdk";',
      "",
      "type Ctx = { root: string; session: string };",
      "",
      "export default defineConfig(({ root, session }: Ctx) => ({",
      "  apps: {",
      "    api: {",
      '      start: () => `echo ${root} ${session}`',
      "    }",
      "  }",
      "}));",
      "",
    ].join("\n")
  );

  const { mode, config } = await loadRuntimeConfig({
    root: dir,
    cwd: dir,
    session: "typed-session",
  });

  assert.equal(mode, "modern");
  assert.match(config.apps.api.start(), /typed-session/);
});

test("loadRuntimeConfig warns when using the legacy filename", async () => {
  const dir = makeTempDir();
  fs.writeFileSync(path.join(dir, "dev.config.js"), "module.exports = () => ({ apps: {} });\n");

  let stderr = "";
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += String(chunk);
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    await loadRuntimeConfig({
      root: dir,
      cwd: dir,
      session: "legacy-file",
      configPath: path.join(dir, "dev.config.js"),
    });
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.match(stderr, /legacy config filename/);
});
