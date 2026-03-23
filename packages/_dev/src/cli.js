const path = require("node:path");
const { usage } = require("./internal/usage.js");
const { parseArgs } = require("./internal/parse-args.js");
const { findConfigPath, loadRuntimeConfig } = require("./internal/config/load-config.js");
const { getItemDescription, createUsageError } = require("./internal/config/normalize-config.js");
const { createTmuxController } = require("./internal/runtime/tmux.js");
const { die } = require("./internal/runtime/process.js");
const { sessionName } = require("@hfossli/dev-helpers/worktree");
const { handleTool } = require("./internal/commands/tool.js");
const { handleCmd } = require("./internal/commands/cmd.js");
const { handleStartOrRestart } = require("./internal/commands/start-restart.js");
const { handleStop } = require("./internal/commands/stop.js");
const { handleLogs } = require("./internal/commands/logs.js");
const { handleTail } = require("./internal/commands/tail.js");
const { handleAttach } = require("./internal/commands/attach.js");

function buildRuntime({ root, config, configPath }) {
  const sessionId = sessionName(root);
  const tmuxSession = `dev-e2e-${sessionId}`;
  const apps = config.apps;
  const tools = config.tools;
  const appNames = Object.keys(apps).sort();
  const toolNames = Object.keys(tools).sort();
  const appEntries = appNames.map((name) => ({
    name,
    description: getItemDescription(apps[name]),
  }));
  const toolEntries = toolNames.map((name) => ({
    name,
    description: getItemDescription(tools[name]),
  }));

  return {
    appNames,
    apps,
    configPath,
    root,
    tmux: createTmuxController({
      cliScriptPath: path.resolve(__dirname, "../bin/_dev.js"),
    }),
    tmuxSession,
    toolNames,
    tools,
    usageText: usage(appEntries, toolEntries),
  };
}

function validateParsedArgs(parsed, baseUsageText) {
  const validCommands = new Set([
    "start",
    "restart",
    "stop",
    "attach",
    "logs",
    "tail",
    "tool",
    "cmd",
  ]);

  if (!validCommands.has(parsed.command)) {
    const error = new Error(`Error: unknown command "${parsed.command}"`);
    error.isUsageError = true;
    error.usageText = baseUsageText;
    throw error;
  }

  const isStartLike = parsed.command === "start" || parsed.command === "restart";
  if (!isStartLike && parsed.attachRequested) {
    throw createUsageError("Error: --attach is only supported for start/restart.");
  }
  const allowsLines =
    parsed.command === "logs" ||
    parsed.command === "tail" ||
    (parsed.command === "attach" && !parsed.app) ||
    (isStartLike && parsed.attachRequested && parsed.app === "all");

  if (parsed.linesOverride !== null && !allowsLines) {
    throw createUsageError(
      "Error: --lines is only supported for logs, tail, attach, or start/restart all with --attach."
    );
  }
  if (parsed.untilMarker !== null && parsed.command !== "tail") {
    throw createUsageError("Error: --until-marker is only supported for tail.");
  }
  if (parsed.untilTimeoutSeconds !== null && parsed.command !== "tail") {
    throw createUsageError("Error: --until-timeout is only supported for tail.");
  }
}

function renderError(error, fallbackUsageText) {
  if (error.onlyUsage) {
    process.stderr.write(`${fallbackUsageText}\n`);
    process.exit(error.exitCode || 2);
  }

  if (error.isUsageError && error.usageText) {
    process.stderr.write(`${error.message}\n\n${error.usageText}\n`);
    process.exit(error.exitCode || 1);
  }

  if (error.isUsageError) {
    die(error.message, error.exitCode || 1);
  }

  throw error;
}

async function main(argv = process.argv.slice(2)) {
  const baseUsageText = usage();
  let parsed;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    renderError(error, baseUsageText);
    return;
  }

  if (parsed.help) {
    process.stdout.write(`${baseUsageText}\n`);
    return;
  }

  if (!parsed.command) {
    process.stderr.write(`${baseUsageText}\n`);
    process.exit(1);
  }

  try {
    validateParsedArgs(parsed, baseUsageText);

    const cwd = process.cwd();
    const configPath = findConfigPath(cwd);
    const root = path.dirname(configPath);
    const session = sessionName(root);
    const { config } = await loadRuntimeConfig({ cwd, configPath, root, session });
    const runtime = buildRuntime({ root, config, configPath });

    switch (parsed.command) {
      case "tool":
        handleTool(parsed, runtime);
        return;
      case "cmd":
        handleCmd(parsed, runtime);
        return;
      case "start":
      case "restart":
        handleStartOrRestart(parsed, runtime);
        return;
      case "stop":
        handleStop(parsed, runtime);
        return;
      case "logs":
        handleLogs(parsed, runtime);
        return;
      case "tail":
        handleTail(parsed, runtime);
        return;
      case "attach":
        handleAttach(parsed, runtime);
        return;
      default:
        throw createUsageError(`Error: unknown command "${parsed.command}"`);
    }
  } catch (error) {
    renderError(error, baseUsageText);
  }
}

module.exports = {
  buildRuntime,
  main,
  validateParsedArgs,
};
