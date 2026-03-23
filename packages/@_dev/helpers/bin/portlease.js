#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

function usage() {
  console.log("portlease <base_port> [--cwd <path>]");
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  usage();
  process.exit(0);
}

const base = Number(args[0]);
if (!Number.isInteger(base) || base < 1024 || base > 65535) {
  console.error("Error: port must be an integer between 1024 and 65535");
  usage();
  process.exit(1);
}

let cwd = process.cwd();
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--cwd" && args[i + 1]) {
    cwd = path.resolve(args[i + 1]);
    i++;
  }
}
cwd = fs.realpathSync(cwd);

const cacheDir =
  process.env.PORTLEASE_CACHE_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || ".", ".cache", "portlease");
const leaseFile = path.join(cacheDir, "leases.json");
const lockFile = path.join(cacheDir, "leases.lock");

function acquireLock() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const maxAttempts = 50;
  const retryDelay = 100;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
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
  throw new Error("Could not acquire lock after " + maxAttempts + " attempts");
}

function releaseLock() {
  try {
    fs.unlinkSync(lockFile);
  } catch {}
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function readLeases() {
  try {
    return JSON.parse(fs.readFileSync(leaseFile, "utf8"));
  } catch {
    return { leases: {} };
  }
}

function writeLeases(data) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(leaseFile, JSON.stringify(data, null, 2) + "\n");
}

function pruneLeases(data) {
  const next = { leases: {} };
  for (const [key, lease] of Object.entries(data.leases || {})) {
    const dir = lease.cwd || key;
    if (fs.existsSync(dir)) {
      next.leases[key] = lease;
    } else {
      console.error(`[portlease] pruned stale lease: ${dir} -> ${lease.port}`);
    }
  }
  return next;
}

function isPortFree(port) {
  if (String(process.env.PORTLEASE_SKIP_PORT_CHECK || "") === "1") {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

function leasedPorts(data) {
  const ports = new Set();
  for (const lease of Object.values(data.leases || {})) {
    ports.add(lease.port);
  }
  return ports;
}

async function findPort(start, reserved) {
  let port = start;
  while (port <= 65535) {
    if (!reserved.has(port) && (await isPortFree(port))) return port;
    port++;
  }
  throw new Error(`No available port found starting from ${start}`);
}

async function main() {
  acquireLock();
  try {
    let data = readLeases();
    data = pruneLeases(data);

    const leaseKey = `${cwd}\t${base}`;
    const existing = data.leases[leaseKey];

    if (existing) {
      if (await isPortFree(existing.port)) {
        existing.updatedAt = new Date().toISOString();
        writeLeases(data);
        console.log(existing.port);
        return;
      }
      delete data.leases[leaseKey];
    }

    const reserved = leasedPorts(data);
    const port = await findPort(base, reserved);

    data.leases[leaseKey] = {
      cwd,
      base,
      port,
      updatedAt: new Date().toISOString(),
    };
    writeLeases(data);
    console.log(port);
  } finally {
    releaseLock();
  }
}

main().catch((error) => {
  releaseLock();
  console.error(error.message || String(error));
  process.exit(1);
});
