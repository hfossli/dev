const path = require("node:path");
const { run } = require("./internal/process.js");
const { getSessionAnchorDir, getWorktreeRoot } = require("./internal/worktree.js");

function leasePort({ name, basePort, cwd = process.cwd(), session } = {}) {
  if (!name) throw new Error("leasePort: name is required");
  if (!Number.isInteger(basePort)) {
    throw new Error(`leasePort: missing basePort for app "${name}"`);
  }

  const root = getWorktreeRoot(cwd);
  const anchorDir = getSessionAnchorDir({ cwd: root, session, name: `port-${name}` });
  const portleasePath = path.join(__dirname, "bin", "portlease.js");
  const out = run(process.execPath, [portleasePath, String(basePort), "--cwd", anchorDir]);
  const leasedPort = Number(out.stdout);
  if (!Number.isInteger(leasedPort)) {
    throw new Error(`leasePort: expected numeric port but got "${out.stdout}"`);
  }
  return String(leasedPort);
}

module.exports = {
  leasePort,
};
