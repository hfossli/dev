const path = require("node:path");
const { run } = require("./internal/process.js");
const { getSessionAnchorDir, getWorktreeRoot, sessionName, stableShortHash } = require("./internal/worktree.js");

function leaseSimulator({
  name = "simulator",
  cwd = process.cwd(),
  session,
  runtime,
  deviceType,
} = {}) {
  const root = getWorktreeRoot(cwd);
  const anchorDir = getSessionAnchorDir({ cwd: root, session, name: `sim-${name}` });
  const simLeasePath = path.join(__dirname, "bin", "ios-sim-lease.js");
  const namePrefix = `ai-pranks-${stableShortHash(`${root}\t${session || ""}\t${name}`)}`;
  const args = [
    simLeasePath,
    "--cwd",
    anchorDir,
    "--owner-root",
    root,
    "--name-prefix",
    namePrefix,
  ];
  if (runtime) args.push("--runtime", runtime);
  if (deviceType) args.push("--device-type", deviceType);

  const out = run(process.execPath, args);
  if (!out.stdout) throw new Error("leaseSimulator: ios-sim-lease returned an empty UDID");
  return out.stdout;
}

module.exports = {
  leaseSimulator,
};
