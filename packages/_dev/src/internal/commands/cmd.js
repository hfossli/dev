const { resolveStartCommand } = require("../config/normalize-config.js");
const { shellQuote } = require("../runtime/shell.js");
const { dieWithUsage } = require("./shared.js");

function handleCmd(parsed, runtime) {
  const { apps, root, usageText } = runtime;
  if (!parsed.app) {
    const error = new Error(usageText);
    error.exitCode = 2;
    error.onlyUsage = true;
    throw error;
  }

  if (!Object.prototype.hasOwnProperty.call(apps, parsed.app)) {
    dieWithUsage(`Error: unknown app "${parsed.app}"`, usageText);
  }

  const startCommand = resolveStartCommand(parsed.app, apps[parsed.app]);
  const wrappedCommand = `cd ${shellQuote(root)} && ${startCommand}`;
  process.stdout.write(`${wrappedCommand}\n`);
}

module.exports = {
  handleCmd,
};
