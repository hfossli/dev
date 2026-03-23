#!/usr/bin/env node

require("../src/cli.js").main().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
