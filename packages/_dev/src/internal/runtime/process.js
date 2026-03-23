const { spawnSync } = require("node:child_process");

function die(message, code = 1) {
  const text = String(message);
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
  process.exit(code);
}

function run(cmd, args = [], options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });

  const status = Number.isInteger(result.status) ? result.status : 1;
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";

  if (result.error && !options.allowFailure) {
    throw result.error;
  }

  if (status !== 0 && !options.allowFailure) {
    const detail = stderr || stdout || `exit code ${status}`;
    throw new Error(`${cmd} ${args.join(" ")} failed: ${detail}`);
  }

  return {
    status,
    stdout,
    stderr,
    error: result.error || null,
  };
}

module.exports = {
  die,
  run,
};
