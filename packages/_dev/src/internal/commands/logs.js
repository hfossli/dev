const { ensureAppTarget, resolveLineCount } = require("./shared.js");

function handleLogs(parsed, runtime) {
  const { apps, tmux, tmuxSession, usageText } = runtime;
  ensureAppTarget({
    appName: parsed.app,
    apps,
    usageText,
    tmuxSession,
    tmux,
  });

  const lines = resolveLineCount(parsed.linesOverride);
  const snapshot = tmux.captureWindowLogs(tmuxSession, parsed.app, lines);
  if (snapshot) {
    process.stdout.write(`${snapshot}\n`);
  }
}

module.exports = {
  handleLogs,
};
