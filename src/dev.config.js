const { getWorktreeRoot, leasePort } = require("./scripts/dev-tools.js");

const config = (session) => {
  const root = getWorktreeRoot(process.cwd());
  const leaseCtx = { cwd: root, session };
  const port = leasePort({ name: "api", basePort: 8787, ...leaseCtx });

  return {
    apps: {
      api: {
        description: "Run next.js app",
        start: () => {
          return `pnpm run dev --port "${port}"`;
        },
      },
    },
    tools: {
      pull: {
        description: "Pull and rebase current branch onto upstream using scripts/pull.",
        run: "./scripts/pull",
      },
      merge: {
        description: "Rebase on main and push to origin/main using scripts/merge.",
        run: "./scripts/merge",
      },
      submit: {
        description: "Deploy ios app to app store",
        run: "cd apps/mobile/ && pnpm testflight",
      },
    },
  };
};

export default config;
