const { createUsageError } = require("../config/normalize-config.js");

function resolveLineCount(linesOverride) {
  if (Number.isInteger(linesOverride) && linesOverride > 0) return linesOverride;
  const fromEnv = Number.parseInt(String(process.env.TAIL_LINES || ""), 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return 120;
}

function dieWithUsage(message, usageText, code = 1) {
  const error = createUsageError(message);
  error.usageText = usageText;
  error.exitCode = code;
  throw error;
}

function ensureAppDefined({ appName, apps, usageText }) {
  if (!appName) {
    const error = new Error(usageText);
    error.exitCode = 2;
    error.onlyUsage = true;
    throw error;
  }

  if (!Object.prototype.hasOwnProperty.call(apps, appName)) {
    dieWithUsage(`Error: unknown app "${appName}"`, usageText);
  }
}

function ensureAppTarget({ appName, apps, usageText, tmuxSession, tmux }) {
  ensureAppDefined({ appName, apps, usageText });
  tmux.ensureInstalled();

  if (!tmux.sessionExists(tmuxSession)) {
    throw createUsageError(`Error: session "${tmuxSession}" does not exist.`);
  }

  if (!tmux.windowExists(tmuxSession, appName)) {
    throw createUsageError(`Error: window "${appName}" does not exist in session "${tmuxSession}".`);
  }
}

function getOverlapCount(previousLines, nextLines) {
  const maxOverlap = Math.min(previousLines.length, nextLines.length);
  for (let overlap = maxOverlap; overlap >= 0; overlap--) {
    let equal = true;
    for (let index = 0; index < overlap; index++) {
      if (previousLines[previousLines.length - overlap + index] !== nextLines[index]) {
        equal = false;
        break;
      }
    }
    if (equal) return overlap;
  }
  return 0;
}

module.exports = {
  dieWithUsage,
  ensureAppDefined,
  ensureAppTarget,
  getOverlapCount,
  resolveLineCount,
};
