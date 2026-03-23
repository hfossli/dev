const { ensureAppTarget, getOverlapCount, resolveLineCount } = require("./shared.js");

function handleTail(parsed, runtime) {
  const { apps, tmux, tmuxSession, usageText } = runtime;
  ensureAppTarget({
    appName: parsed.app,
    apps,
    usageText,
    tmuxSession,
    tmux,
  });

  const lines = resolveLineCount(parsed.linesOverride);
  const untilMarker = parsed.untilMarker;
  const untilTimeoutSeconds = parsed.untilTimeoutSeconds;
  let previousLines = [];
  let timer = null;
  let timeoutTimer = null;
  let tailStopped = false;

  const stopTail = (code = 0, message = "") => {
    if (tailStopped) return;
    tailStopped = true;
    if (timer) clearInterval(timer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (message) {
      const out = code === 0 ? process.stdout : process.stderr;
      out.write(`${message}\n`);
    }
    process.exit(code);
  };

  const initialSnapshot = tmux.captureWindowLogs(tmuxSession, parsed.app, lines);
  if (initialSnapshot) {
    process.stdout.write(`${initialSnapshot}\n`);
    previousLines = initialSnapshot.split(/\r?\n/);
  }
  if (untilMarker && initialSnapshot.includes(untilMarker)) {
    stopTail(0);
    return;
  }

  if (untilTimeoutSeconds !== null) {
    const timeoutMs = Math.max(1, Math.round(untilTimeoutSeconds * 1000));
    timeoutTimer = setTimeout(() => {
      if (untilMarker) {
        stopTail(
          124,
          `Error: marker "${untilMarker}" was not found within ${untilTimeoutSeconds} seconds.`
        );
        return;
      }
      stopTail(0);
    }, timeoutMs);
  }

  timer = setInterval(() => {
    try {
      const snapshot = tmux.captureWindowLogs(tmuxSession, parsed.app, lines);
      const nextLines = snapshot ? snapshot.split(/\r?\n/) : [];
      const overlap = getOverlapCount(previousLines, nextLines);
      const appended = nextLines.slice(overlap);
      if (appended.length > 0) {
        process.stdout.write(`${appended.join("\n")}\n`);
      }
      previousLines = nextLines;
      if (untilMarker && snapshot.includes(untilMarker)) {
        stopTail(0);
      }
    } catch (error) {
      stopTail(1, `Error: ${error.message}`);
    }
  }, 1000);

  process.on("SIGINT", () => stopTail(0));
  process.on("SIGTERM", () => stopTail(0));
}

module.exports = {
  handleTail,
};
