#!/usr/bin/env node

const { mergeToMain } = require("../git.js");

try {
  mergeToMain();
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exit(1);
}
