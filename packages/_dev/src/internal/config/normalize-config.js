const { shellQuote } = require("../runtime/shell.js");

function createUsageError(message) {
  const error = new Error(message);
  error.isUsageError = true;
  return error;
}

function normalizeRuntimeConfig(cfg, configPath) {
  if (!cfg || typeof cfg !== "object") {
    throw createUsageError(`Error: config in ${configPath} must return an object.`);
  }
  if (!cfg.apps || typeof cfg.apps !== "object") {
    throw createUsageError(`Error: config in ${configPath} must return an apps object.`);
  }
  if (cfg.tools !== undefined && (!cfg.tools || typeof cfg.tools !== "object")) {
    throw createUsageError(`Error: config in ${configPath} must return tools as an object when provided.`);
  }

  for (const [appName, appDef] of Object.entries(cfg.apps)) {
    if (typeof appDef === "string") continue;
    if (!appDef || typeof appDef !== "object") {
      throw createUsageError(`Error: app "${appName}" in ${configPath} must be a string or object.`);
    }
    if (appDef.description !== undefined && typeof appDef.description !== "string") {
      throw createUsageError(`Error: app "${appName}" description in ${configPath} must be a string.`);
    }
    if (appDef.start !== undefined && typeof appDef.start !== "string" && typeof appDef.start !== "function") {
      throw createUsageError(`Error: app "${appName}" start in ${configPath} must be a string or function.`);
    }
  }

  if (cfg.tools) {
    for (const [toolName, toolDef] of Object.entries(cfg.tools)) {
      if (typeof toolDef === "string" || typeof toolDef === "function") continue;
      if (!toolDef || typeof toolDef !== "object") {
        throw createUsageError(`Error: tool "${toolName}" in ${configPath} must be a string, function, or object.`);
      }
      if (toolDef.description !== undefined && typeof toolDef.description !== "string") {
        throw createUsageError(`Error: tool "${toolName}" description in ${configPath} must be a string.`);
      }
      if (toolDef.run !== undefined && typeof toolDef.run !== "string" && typeof toolDef.run !== "function") {
        throw createUsageError(`Error: tool "${toolName}" run in ${configPath} must be a string or function.`);
      }
    }
  }

  return {
    apps: cfg.apps,
    tools: cfg.tools && typeof cfg.tools === "object" ? cfg.tools : {},
  };
}

function getItemDescription(itemDef) {
  if (!itemDef || typeof itemDef !== "object") return "";
  if (typeof itemDef.description !== "string") return "";
  return itemDef.description.trim();
}

function resolveStartCommand(appName, appDef) {
  if (typeof appDef === "string") return appDef;
  if (!appDef || typeof appDef !== "object") {
    throw createUsageError(`Error: app "${appName}" must be a string command or an object with start.`);
  }

  const { start } = appDef;
  if (typeof start === "string") return start;
  if (typeof start === "function") {
    const command = start();
    if (typeof command !== "string" || !command.trim()) {
      throw createUsageError(`Error: app "${appName}" start() must return a non-empty string.`);
    }
    return command;
  }

  throw createUsageError(`Error: app "${appName}" must define start as a string or function.`);
}

function resolveToolCommand(toolName, toolDef, toolArgs) {
  let executableDef = toolDef;
  if (
    toolDef &&
    typeof toolDef === "object" &&
    (typeof toolDef.run === "function" || typeof toolDef.run === "string")
  ) {
    executableDef = toolDef.run;
  }

  if (typeof executableDef === "string") return executableDef;
  if (typeof executableDef === "function") {
    const quotedArgs = toolArgs.map((arg) => shellQuote(arg)).join(" ");
    const plainArgs = toolArgs.join(" ");
    const command = executableDef(quotedArgs, toolArgs, plainArgs);
    if (typeof command !== "string" || !command.trim()) {
      throw createUsageError(`Error: tool "${toolName}" must return a non-empty command string.`);
    }
    return command;
  }
  throw createUsageError(`Error: tool "${toolName}" must be a string/function or an object with run.`);
}

module.exports = {
  createUsageError,
  getItemDescription,
  normalizeRuntimeConfig,
  resolveStartCommand,
  resolveToolCommand,
};
