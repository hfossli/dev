#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function usage() {
  console.log(`ios-sim-lease [options]

Creates (or reuses) a stable iOS simulator per worktree and prints its UDID.
Can also prune or release simulator lease claims.

Options:
  --cwd <path>           Resolve lease key from this directory (default: cwd)
  --owner-root <path>    Worktree root tied to this lease (used for stale pruning)
  --runtime <spec>       Runtime identifier or version (default: latest)
  --device-type <spec>   Device type identifier or name (default: preferred iPhone)
  --name-prefix <prefix> Simulator name prefix (default: ai-pranks-wt)
  --prune                Prune stale lease entries and exit
  --release              Release lease entries for --cwd and exit (also prunes)
  --verbose              Print diagnostics to stderr
  -h, --help             Show this help

Environment:
  IOS_SIM_RUNTIME        Same as --runtime
  IOS_SIM_DEVICE_TYPE    Same as --device-type
  IOS_SIM_NAME_PREFIX    Same as --name-prefix
`);
}

function parseArgs(argv) {
  const args = {
    mode: "lease",
    cwd: process.cwd(),
    ownerRoot: "",
    runtime: process.env.IOS_SIM_RUNTIME || "latest",
    deviceType: process.env.IOS_SIM_DEVICE_TYPE || "",
    namePrefix: process.env.IOS_SIM_NAME_PREFIX || "ai-pranks-wt",
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "-h" || value === "--help") {
      usage();
      process.exit(0);
    }
    if (value === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (value === "--prune") {
      if (args.mode !== "lease") {
        throw new Error("Only one of --prune or --release can be used at a time.");
      }
      args.mode = "prune";
      continue;
    }
    if (value === "--release") {
      if (args.mode !== "lease") {
        throw new Error("Only one of --prune or --release can be used at a time.");
      }
      args.mode = "release";
      continue;
    }
    if (value === "--boot" || value === "--focus") {
      throw new Error(
        `${value} is no longer supported here. Use ios-sim-boot to boot/focus a leased simulator.`
      );
    }
    if (value === "--cwd") {
      args.cwd = argv[++i];
      continue;
    }
    if (value === "--owner-root") {
      args.ownerRoot = argv[++i];
      continue;
    }
    if (value === "--runtime") {
      args.runtime = argv[++i];
      continue;
    }
    if (value === "--device-type") {
      args.deviceType = argv[++i];
      continue;
    }
    if (value === "--name-prefix") {
      args.namePrefix = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  if (!args.cwd) throw new Error("Missing value for --cwd");
  if (args.mode === "lease" && !args.runtime) throw new Error("Missing value for --runtime");
  args.cwd = fs.realpathSync(args.cwd);
  if (args.ownerRoot) {
    args.ownerRoot = fs.realpathSync(args.ownerRoot);
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

function runJson(args) {
  return JSON.parse(run("xcrun", args).stdout);
}

function isRuntimeAvailable(runtime) {
  if (runtime.isAvailable === false) return false;
  if (typeof runtime.availability === "string") {
    if (runtime.availability.toLowerCase().includes("unavailable")) return false;
  }
  if (runtime.availabilityError) return false;
  return true;
}

function parseVersion(version) {
  if (!version || typeof version !== "string") return [];
  return version
    .split(".")
    .map((part) => Number(part))
    .filter((number) => Number.isFinite(number));
}

function cmpVersionDesc(left, right) {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  const len = Math.max(leftVersion.length, rightVersion.length);
  for (let index = 0; index < len; index++) {
    const leftNumber = leftVersion[index] || 0;
    const rightNumber = rightVersion[index] || 0;
    if (leftNumber !== rightNumber) return rightNumber - leftNumber;
  }
  return 0;
}

function normalizeVersionSpec(spec) {
  return spec.replace(/^ios[\s-]*/i, "").trim();
}

function selectRuntime(runtimes, spec) {
  const iosRuntimes = runtimes.filter(
    (runtime) =>
      runtime.identifier &&
      runtime.identifier.includes(".SimRuntime.iOS-") &&
      isRuntimeAvailable(runtime)
  );
  if (iosRuntimes.length === 0) {
    throw new Error(
      "No available iOS runtimes found. Install one in Xcode > Settings > Platforms."
    );
  }

  if (!spec || spec === "latest") {
    return [...iosRuntimes].sort((left, right) => {
      const byVersion = cmpVersionDesc(left.version, right.version);
      if (byVersion !== 0) return byVersion;
      return String(left.identifier).localeCompare(String(right.identifier));
    })[0];
  }

  if (spec.startsWith("com.apple.CoreSimulator.SimRuntime.")) {
    const exact = iosRuntimes.find((runtime) => runtime.identifier === spec);
    if (exact) return exact;
    throw new Error(`Requested runtime not installed or unavailable: ${spec}`);
  }

  const normalized = normalizeVersionSpec(spec);
  const dashed = normalized.replace(/\./g, "-");
  const byVersion = iosRuntimes.find((runtime) => runtime.version === normalized);
  if (byVersion) return byVersion;

  const byIdentifier = iosRuntimes.find((runtime) => runtime.identifier.endsWith(`iOS-${dashed}`));
  if (byIdentifier) return byIdentifier;

  const byName = iosRuntimes.find(
    (runtime) => String(runtime.name || "").toLowerCase() === `ios ${normalized}`.toLowerCase()
  );
  if (byName) return byName;

  const available = iosRuntimes.map((runtime) => `${runtime.version} (${runtime.identifier})`).join(", ");
  throw new Error(`Runtime "${spec}" not found. Available: ${available}`);
}

function selectDeviceType(deviceTypes, spec) {
  if (spec) {
    if (spec.startsWith("com.apple.CoreSimulator.SimDeviceType.")) {
      const exactById = deviceTypes.find((deviceType) => deviceType.identifier === spec);
      if (exactById) return exactById;
      throw new Error(`Device type identifier not found: ${spec}`);
    }

    const lower = spec.toLowerCase();
    const exactByName = deviceTypes.find((deviceType) => String(deviceType.name || "").toLowerCase() === lower);
    if (exactByName) return exactByName;

    const fuzzy = deviceTypes.find((deviceType) =>
      String(deviceType.name || "")
        .toLowerCase()
        .includes(lower)
    );
    if (fuzzy) return fuzzy;

    throw new Error(`Device type not found: ${spec}`);
  }

  const preferred = [
    "iPhone 16",
    "iPhone 16 Pro",
    "iPhone 15",
    "iPhone 15 Pro",
    "iPhone 14",
    "iPhone SE (3rd generation)",
  ];
  for (const name of preferred) {
    const match = deviceTypes.find((deviceType) => deviceType.name === name);
    if (match) return match;
  }

  const anyIphone = deviceTypes.find((deviceType) => String(deviceType.name || "").startsWith("iPhone"));
  if (anyIphone) return anyIphone;

  if (deviceTypes.length === 0) {
    throw new Error("No simulator device types found.");
  }
  return deviceTypes[0];
}

function slugify(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sessionNameLikePath(rootPath) {
  return String(rootPath)
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]/g, "-");
}

function getWorktreeRoot(cwd) {
  const gitRoot = run("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { allowFailure: true });
  if (gitRoot.status === 0 && gitRoot.stdout) return fs.realpathSync(gitRoot.stdout);
  return fs.realpathSync(cwd);
}

function leaseDir() {
  return (
    process.env.IOS_SIM_LEASE_DIR ||
    path.join(
      process.env.HOME || process.env.USERPROFILE || os.homedir() || ".",
      ".cache",
      "ios-sim-lease"
    )
  );
}

function leaseFilePath() {
  return path.join(leaseDir(), "leases.json");
}

function lockFilePath() {
  return path.join(leaseDir(), "leases.lock");
}

function ensureLeaseDir() {
  fs.mkdirSync(leaseDir(), { recursive: true });
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  ensureLeaseDir();
  const lockFile = lockFilePath();
  const maxAttempts = 50;
  const retryDelay = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const pid = Number(fs.readFileSync(lockFile, "utf8").trim());
        if (pid && !isProcessAlive(pid)) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch {
        continue;
      }
      sleepSync(retryDelay);
    }
  }
  throw new Error(`Could not acquire lock after ${maxAttempts} attempts`);
}

function releaseLock() {
  try {
    fs.unlinkSync(lockFilePath());
  } catch {}
}

function readLeaseState() {
  try {
    return JSON.parse(fs.readFileSync(leaseFilePath(), "utf8"));
  } catch {
    return { leases: {} };
  }
}

function writeLeaseState(state) {
  ensureLeaseDir();
  fs.writeFileSync(leaseFilePath(), JSON.stringify(state, null, 2) + "\n");
}

function log(message, args) {
  if (args.verbose) {
    process.stderr.write(`${message}\n`);
  }
}

function runtimeSortValue(runtime) {
  return `${runtime.version || ""}\t${runtime.identifier || ""}`;
}

function loadSimulatorCatalog() {
  const catalog = runJson(["simctl", "list", "devices", "available", "-j"]);
  const runtimes = runJson(["simctl", "list", "runtimes", "-j"]).runtimes || [];
  const devicetypes = runJson(["simctl", "list", "devicetypes", "-j"]).devicetypes || [];
  return {
    devices: catalog.devices || {},
    devicetypes,
    runtimes,
  };
}

function findExistingDevice(devicesByRuntime, runtimeIdentifier, namePrefix) {
  const devices = devicesByRuntime[runtimeIdentifier] || [];
  return devices.find((device) => String(device.name || "").startsWith(namePrefix)) || null;
}

function createDevice({ runtime, deviceType, namePrefix }) {
  const suffix = slugify(`${runtime.version}-${deviceType.name}`).slice(0, 24);
  const deviceName = `${namePrefix}-${suffix}`;
  const udid = run("xcrun", [
    "simctl",
    "create",
    deviceName,
    deviceType.identifier,
    runtime.identifier,
  ]).stdout;
  if (!udid) {
    throw new Error(`Failed to create simulator ${deviceName}`);
  }
  return {
    name: deviceName,
    udid,
  };
}

function readDeviceInfo(udid) {
  const info = runJson(["simctl", "list", "devices", udid, "-j"]);
  const devices = Object.values(info.devices || {}).flat();
  return devices.find((device) => device.udid === udid) || null;
}

function resolveLeaseKey({ cwd, runtime, deviceType, namePrefix }) {
  return `${cwd}\t${runtime.identifier}\t${deviceType.identifier}\t${namePrefix}`;
}

function pruneLeases(state, args) {
  const next = { leases: {} };
  for (const [key, lease] of Object.entries(state.leases || {})) {
    const ownerRoot = lease.ownerRoot || "";
    if (ownerRoot && !fs.existsSync(ownerRoot)) {
      log(`[ios-sim-lease] pruned stale lease for missing owner root: ${ownerRoot}`, args);
      continue;
    }
    if (!lease.cwd || !fs.existsSync(lease.cwd)) {
      log(`[ios-sim-lease] pruned stale lease for missing cwd: ${lease.cwd || key}`, args);
      continue;
    }
    if (lease.udid) {
      const device = readDeviceInfo(lease.udid);
      if (!device) {
        log(`[ios-sim-lease] pruned missing simulator device: ${lease.udid}`, args);
        continue;
      }
    }
    next.leases[key] = lease;
  }
  return next;
}

function releaseLeasesForCwd(state, cwd, args) {
  const next = { leases: {} };
  let changed = false;
  for (const [key, lease] of Object.entries(state.leases || {})) {
    if (lease.cwd === cwd) {
      changed = true;
      log(`[ios-sim-lease] released lease for ${cwd}: ${lease.udid || key}`, args);
      continue;
    }
    next.leases[key] = lease;
  }
  return { changed, state: next };
}

function createOrReuseLease(args) {
  const catalog = loadSimulatorCatalog();
  const runtime = selectRuntime(catalog.runtimes, args.runtime);
  const deviceType = selectDeviceType(catalog.devicetypes, args.deviceType);
  const worktreeRoot = args.ownerRoot || getWorktreeRoot(args.cwd);
  const sessionRoot = sessionNameLikePath(worktreeRoot);
  const namePrefix = `${args.namePrefix}-${slugify(sessionRoot).slice(0, 24)}`;
  const leaseKey = resolveLeaseKey({ cwd: args.cwd, runtime, deviceType, namePrefix });

  let state = pruneLeases(readLeaseState(), args);
  const existing = state.leases[leaseKey];
  if (existing && existing.udid) {
    const device = readDeviceInfo(existing.udid);
    if (device) {
      existing.updatedAt = new Date().toISOString();
      writeLeaseState(state);
      return existing.udid;
    }
    delete state.leases[leaseKey];
  }

  const existingDevice = findExistingDevice(catalog.devices, runtime.identifier, namePrefix);
  const createdOrReused =
    existingDevice || createDevice({ runtime, deviceType, namePrefix });

  state.leases[leaseKey] = {
    cwd: args.cwd,
    ownerRoot: worktreeRoot,
    runtime: runtime.identifier,
    deviceType: deviceType.identifier,
    udid: createdOrReused.udid,
    namePrefix,
    updatedAt: new Date().toISOString(),
    runtimeSortValue: runtimeSortValue(runtime),
  };
  writeLeaseState(state);
  return createdOrReused.udid;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  acquireLock();
  try {
    if (args.mode === "prune") {
      const state = pruneLeases(readLeaseState(), args);
      writeLeaseState(state);
      return;
    }

    if (args.mode === "release") {
      const released = releaseLeasesForCwd(pruneLeases(readLeaseState(), args), args.cwd, args);
      if (released.changed) {
        writeLeaseState(released.state);
      } else {
        writeLeaseState(released.state);
      }
      return;
    }

    console.log(createOrReuseLease(args));
  } finally {
    releaseLock();
  }
}

main();
