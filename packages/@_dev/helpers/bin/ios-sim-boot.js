#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

function usage() {
  console.log(`ios-sim-boot [udid] [options]

Boots an iOS simulator and prints its UDID.
If no UDID is provided, leases one from ios-sim-lease first.

Options:
  --cwd <path>           Passed to ios-sim-lease when UDID is omitted
  --runtime <spec>       Passed to ios-sim-lease when UDID is omitted
  --device-type <spec>   Passed to ios-sim-lease when UDID is omitted
  --name-prefix <prefix> Passed to ios-sim-lease when UDID is omitted
  --boot                 No-op (kept for compatibility)
  --focus                Focus Simulator.app on the booted device
  --verbose              Print diagnostics to stderr
  -h, --help             Show this help
`);
}

function parseArgs(argv) {
  const args = {
    udid: "",
    cwd: "",
    runtime: "",
    deviceType: "",
    namePrefix: "",
    focus: false,
    verbose: false,
  };

  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--focus") {
      args.focus = true;
      continue;
    }
    if (arg === "--boot") {
      continue;
    }
    if (arg === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (arg === "--cwd") {
      args.cwd = takeValue(i, arg);
      i += 1;
      continue;
    }
    if (arg === "--runtime") {
      args.runtime = takeValue(i, arg);
      i += 1;
      continue;
    }
    if (arg === "--device-type") {
      args.deviceType = takeValue(i, arg);
      i += 1;
      continue;
    }
    if (arg === "--name-prefix") {
      args.namePrefix = takeValue(i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (!args.udid) {
      args.udid = arg;
      continue;
    }
    throw new Error(`Unexpected positional argument: ${arg}`);
  }

  return args;
}

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !opts.allowFailure) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const detail = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`${cmd} ${cmdArgs.join(" ")} failed: ${detail}`);
  }
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function log(verbose, message) {
  if (verbose) process.stderr.write(`[ios-sim-boot] ${message}\n`);
}

function leaseIfNeeded(args) {
  if (args.udid) return args.udid;

  const leaseScript = path.join(__dirname, "ios-sim-lease.js");
  const leaseArgs = [leaseScript];
  if (args.cwd) leaseArgs.push("--cwd", args.cwd);
  if (args.runtime) leaseArgs.push("--runtime", args.runtime);
  if (args.deviceType) leaseArgs.push("--device-type", args.deviceType);
  if (args.namePrefix) leaseArgs.push("--name-prefix", args.namePrefix);
  if (args.verbose) leaseArgs.push("--verbose");

  const leased = run(process.execPath, leaseArgs).stdout;
  if (!leased) {
    throw new Error("ios-sim-lease returned an empty UDID");
  }
  return leased;
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("ios-sim-boot only supports macOS.");
  }

  const args = parseArgs(process.argv.slice(2));
  const udid = leaseIfNeeded(args);

  log(args.verbose, `Booting ${udid}`);
  run("xcrun", ["simctl", "boot", udid], { allowFailure: true });
  run("xcrun", ["simctl", "bootstatus", udid, "-b"]);

  if (args.focus) {
    log(args.verbose, `Focusing Simulator.app on ${udid}`);
    run("open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", udid], {
      allowFailure: true,
    });
  }

  process.stdout.write(`${udid}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ios-sim-boot: ${error.message || String(error)}\n`);
  process.exit(1);
}
