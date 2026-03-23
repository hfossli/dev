function fail(message) {
  const error = new Error(message);
  error.isUsageError = true;
  throw error;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!value || !Number.isInteger(parsed) || parsed <= 0) {
    fail(`Error: ${flag} requires a positive integer value.`);
  }
  return parsed;
}

function parsePositiveNumber(value, flag) {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed <= 0) {
    fail(`Error: ${flag} requires a positive number of seconds.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const positional = [];
  let linesOverride = null;
  let untilMarker = null;
  let untilTimeoutSeconds = null;
  let attachRequested = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const command = positional[0] || "";

    if (command === "tool") {
      positional.push(arg);
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "--attach" || arg === "-a") {
      attachRequested = true;
      continue;
    }
    if (arg === "--lines") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        fail("Error: --lines requires a positive integer value.");
      }
      linesOverride = parsePositiveInteger(value, "--lines");
      i++;
      continue;
    }
    if (arg.startsWith("--lines=")) {
      linesOverride = parsePositiveInteger(arg.slice("--lines=".length), "--lines");
      continue;
    }
    if (arg === "--until-marker") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        fail("Error: --until-marker requires a non-empty value.");
      }
      untilMarker = value;
      i++;
      continue;
    }
    if (arg.startsWith("--until-marker=")) {
      untilMarker = arg.slice("--until-marker=".length);
      if (!untilMarker) {
        fail("Error: --until-marker requires a non-empty value.");
      }
      continue;
    }
    if (arg === "--until-timeout") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        fail("Error: --until-timeout requires a positive number of seconds.");
      }
      untilTimeoutSeconds = parsePositiveNumber(value, "--until-timeout");
      i++;
      continue;
    }
    if (arg.startsWith("--until-timeout=")) {
      untilTimeoutSeconds = parsePositiveNumber(
        arg.slice("--until-timeout=".length),
        "--until-timeout"
      );
      continue;
    }
    if (arg.startsWith("-")) fail(`Error: unknown option "${arg}"`);
    positional.push(arg);
  }

  const command = positional[0] || "";
  if (command !== "tool" && positional.length > 2) {
    fail(`Error: unexpected argument "${positional[2]}"`);
  }

  return {
    help,
    command,
    app: positional[1] || "",
    commandArgs: command === "tool" ? positional.slice(2) : [],
    linesOverride,
    untilMarker,
    untilTimeoutSeconds,
    attachRequested,
  };
}

module.exports = {
  parseArgs,
};
