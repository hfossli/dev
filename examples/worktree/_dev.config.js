const { defineConfig } = require("@_dev/sdk");
const { getWorktreeRoot, leasePort } = require("@_dev/helpers");

module.exports = defineConfig(({ root, session }) => {
  const worktreeRoot = getWorktreeRoot(root);
  const leaseCtx = { cwd: worktreeRoot, session };

  return {
    apps: {
      web: {
        description: "Run web app with a leased worktree port",
        start: () => `pnpm run dev --port "${leasePort({ name: "web", basePort: 3000, ...leaseCtx })}"`,
      },
      api: {
        description: "Run API app with a leased worktree port",
        start: () => `pnpm run dev --port "${leasePort({ name: "api", basePort: 8787, ...leaseCtx })}"`,
      },
    },
    tools: {
      pull: {
        description: "Pull and rebase current branch onto upstream",
        run: "echo pull-example",
      },
    },
  };
});
