const ports = require("./ports.js");
const worktree = require("./worktree.js");
const shell = require("./shell.js");
const setup = require("./setup.js");
const ios = require("./ios.js");

module.exports = {
  ...ports,
  ...worktree,
  ...shell,
  ...setup,
  ...ios,
  ios,
  ports,
  setup,
  shell,
  worktree,
};
