const path = require("node:path");
const { spawnSync } = require("node:child_process");

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

function isExecutableFile(filePath) {
  try {
    const stat = require("node:fs").statSync(filePath);
    if (!stat.isFile()) return false;
    require("node:fs").accessSync(filePath, require("node:fs").constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(commandName, env = process.env) {
  const name = String(commandName || "").trim();
  if (!name) return false;

  if (name.includes(path.sep) || (path.sep === "\\" && name.includes("/"))) {
    return isExecutableFile(name);
  }

  const pathValue = String(env.PATH || "");
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  if (directories.length === 0) return false;

  if (process.platform === "win32") {
    const pathExt = String(env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
      .split(";")
      .filter(Boolean)
      .map((value) => value.toLowerCase());

    for (const dir of directories) {
      const baseCandidate = path.join(dir, name);
      if (isExecutableFile(baseCandidate)) return true;
      for (const ext of pathExt) {
        if (isExecutableFile(`${baseCandidate}${ext}`)) return true;
      }
    }
    return false;
  }

  return directories.some((dir) => isExecutableFile(path.join(dir, name)));
}

function ensureCommandInPath(commandName, { hint } = {}) {
  if (commandExists(commandName)) return;
  let message = `${commandName} is required but was not found in PATH.`;
  if (hint) message += `\n${hint}`;
  throw new Error(message);
}

function firstCommandToken(command) {
  const match = String(command || "")
    .trim()
    .match(/^([^\s]+)/);
  return match ? match[1] : "";
}

function shouldCheckTokenInPath(token) {
  if (!token) return false;
  if (token.includes("=")) return false;
  if (token.startsWith("$")) return false;
  if (token === "&&" || token === "||") return false;
  if (token === ";" || token === "|") return false;
  return true;
}

module.exports = {
  commandExists,
  ensureCommandInPath,
  firstCommandToken,
  run,
  shouldCheckTokenInPath,
};
