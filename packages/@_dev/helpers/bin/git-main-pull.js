#!/usr/bin/env node

const { pullCurrentBranch } = require("../git.js");

try {
  pullCurrentBranch();
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exit(1);
}
