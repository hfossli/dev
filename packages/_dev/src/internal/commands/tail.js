const { ensureAppTarget, getOverlapCount, resolveLineCount } = require("./shared.js");

const SPLIT_ATTACH_ENV = "_DEV_SPLIT_ATTACH";
const CLEAR_SCREEN = "\u001b[2J\u001b[H";
const ESCAPE_SEQUENCE_KEYS = new Map([
  ["\u001b[A", "Up"],
  ["\u001b[B", "Down"],
  ["\u001b[C", "Right"],
  ["\u001b[D", "Left"],
  ["\u001b[H", "Home"],
  ["\u001b[F", "End"],
  ["\u001b[3~", "Delete"],
  ["\u001b[5~", "PageUp"],
  ["\u001b[6~", "PageDown"],
  ["\u001b[Z", "BTab"],
]);

function renderTailSnapshot({
  snapshot,
  previousLines,
  previousSnapshot,
  fullRefresh,
  write = (text) => process.stdout.write(text),
}) {
  const normalizedSnapshot = snapshot || "";
  const nextLines = normalizedSnapshot ? normalizedSnapshot.split(/\r?\n/) : [];

  if (fullRefresh) {
    if (normalizedSnapshot !== previousSnapshot) {
      write(CLEAR_SCREEN);
      if (normalizedSnapshot) {
        write(`${normalizedSnapshot}\n`);
      }
    }
    return {
      nextLines,
      nextSnapshot: normalizedSnapshot,
    };
  }

  const overlap = getOverlapCount(previousLines, nextLines);
  const appended = nextLines.slice(overlap);
  if (appended.length > 0) {
    write(`${appended.join("\n")}\n`);
  }

  return {
    nextLines,
    nextSnapshot: normalizedSnapshot,
  };
}

function flushLiteralBuffer(buffer, { appName, tmux, tmuxSession }) {
  if (!buffer) return;
  tmux.sendKeysToApp(tmuxSession, appName, [buffer], { literal: true });
}

function forwardInteractiveInput(text, { appName, tmux, tmuxSession }) {
  let literalBuffer = "";
  let forwarded = false;

  for (let index = 0; index < text.length; ) {
    const remaining = text.slice(index);
    let handledEscape = false;

    if (remaining.startsWith("\u001b")) {
      for (const [sequence, keyName] of ESCAPE_SEQUENCE_KEYS) {
        if (!remaining.startsWith(sequence)) continue;
        flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
        literalBuffer = "";
        tmux.sendKeysToApp(tmuxSession, appName, [keyName]);
        forwarded = true;
        index += sequence.length;
        handledEscape = true;
        break;
      }

      if (handledEscape) {
        continue;
      }
    }

    const char = text[index];
    const codePoint = char.charCodeAt(0);

    if (char === "\r" || char === "\n") {
      flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
      literalBuffer = "";
      tmux.sendKeysToApp(tmuxSession, appName, ["Enter"]);
      forwarded = true;
      index += 1;
      if (char === "\r" && text[index] === "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "\t") {
      flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
      literalBuffer = "";
      tmux.sendKeysToApp(tmuxSession, appName, ["Tab"]);
      forwarded = true;
      index += 1;
      continue;
    }

    if (char === "\u007f" || char === "\b") {
      flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
      literalBuffer = "";
      tmux.sendKeysToApp(tmuxSession, appName, ["BSpace"]);
      forwarded = true;
      index += 1;
      continue;
    }

    if (char === "\u001b") {
      flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
      literalBuffer = "";
      tmux.sendKeysToApp(tmuxSession, appName, ["Escape"]);
      forwarded = true;
      index += 1;
      continue;
    }

    if (codePoint > 0 && codePoint < 32) {
      flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
      literalBuffer = "";
      const controlKey = `C-${String.fromCharCode(codePoint + 96)}`;
      tmux.sendKeysToApp(tmuxSession, appName, [controlKey]);
      forwarded = true;
      index += 1;
      continue;
    }

    literalBuffer += char;
    forwarded = true;
    index += 1;
  }

  flushLiteralBuffer(literalBuffer, { appName, tmux, tmuxSession });
  return forwarded;
}

function handleInteractiveInputChunk(chunk, { appName, stopTail, tmux, tmuxSession }) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);

  if (text === "\u0003") {
    stopTail(0);
    return true;
  }

  return forwardInteractiveInput(text, {
    appName,
    tmux,
    tmuxSession,
  });
}

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
  let previousSnapshot = "";
  let timer = null;
  let timeoutTimer = null;
  let tailStopped = false;
  let cleanupInteractiveInput = null;
  const fullRefresh = String(process.env[SPLIT_ATTACH_ENV] || "").trim() === "1";

  const stopTail = (code = 0, message = "") => {
    if (tailStopped) return;
    tailStopped = true;
    if (timer) clearInterval(timer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (cleanupInteractiveInput) cleanupInteractiveInput();
    if (message) {
      const out = code === 0 ? process.stdout : process.stderr;
      out.write(`${message}\n`);
    }
    process.exit(code);
  };

  if (fullRefresh && process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    if (typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onData = (chunk) => {
      try {
        handleInteractiveInputChunk(chunk, {
          appName: parsed.app,
          stopTail,
          tmux,
          tmuxSession,
        });
      } catch (error) {
        stopTail(1, `Error: ${error.message}`);
      }
    };

    process.stdin.on("data", onData);
    cleanupInteractiveInput = () => {
      process.stdin.off("data", onData);
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };
  }

  const initialSnapshot = tmux.captureWindowLogs(tmuxSession, parsed.app, lines);
  const initialRender = renderTailSnapshot({
    snapshot: initialSnapshot,
    previousLines,
    previousSnapshot,
    fullRefresh,
  });
  previousLines = initialRender.nextLines;
  previousSnapshot = initialRender.nextSnapshot;
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
      const nextRender = renderTailSnapshot({
        snapshot,
        previousLines,
        previousSnapshot,
        fullRefresh,
      });
      previousLines = nextRender.nextLines;
      previousSnapshot = nextRender.nextSnapshot;
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
  handleInteractiveInputChunk,
  renderTailSnapshot,
};
