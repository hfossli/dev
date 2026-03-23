const { defineConfig } = require("@_dev/sdk");
const { getWorktreeRoot, leasePort } = require("@_dev/helpers");

module.exports = defineConfig(({ root, session }) => {
  const worktreeRoot = getWorktreeRoot(root);
  const leaseCtx = { cwd: worktreeRoot, session };
  const webPort = leasePort({ name: "web", basePort: 3000, ...leaseCtx });
  const apiPort = leasePort({ name: "api", basePort: 8787, ...leaseCtx });

  return {
    apps: {
      web: {
        description: "Run web app",
        start: () => `pnpm run dev --port "${webPort}"`,
      },
      api: {
        description: "Run API app",
        start: () => `pnpm run dev --port "${apiPort}"`,
      },
    },
    tools: {
      pull: {
        description: "Pull and rebase current branch onto upstream using dev.tools/pull.",
        run: "./dev.tools/pull",
      },
      merge: {
        description: "Rebase on main and push to origin/main using dev.tools/merge.",
        run: "./dev.tools/merge",
      },
      submit: {
        description: "Deploy ios app to app store",
        run: "cd apps/mobile/ && pnpm testflight",
      },
    },
  };
});
