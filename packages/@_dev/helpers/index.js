const ports = require("./ports.js");
const worktree = require("./worktree.js");
const shell = require("./shell.js");
const setup = require("./setup.js");
const ios = require("./ios.js");
const git = require("./git.js");

module.exports = {
  ...ports,
  ...worktree,
  ...shell,
  ...setup,
  ...ios,
  ...git,
  git,
  ios,
  ports,
  setup,
  shell,
  worktree,
};
