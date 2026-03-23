# `_dev`

`_dev` is a reusable development orchestration CLI for starting apps, managing tmux sessions, tailing logs, and composing repo-specific tools from a code-first `_dev.config.js` or `_dev.config.ts`.

## Packages

- `_dev`: CLI runtime and config loader
- `@_dev/sdk`: public config API via `defineConfig(...)`
- `@_dev/helpers`: first-party helpers for ports, worktrees, shell commands, setup, and iOS simulator leasing

## Official usage

Install the packages in the consumer repo:

```sh
pnpm add -D _dev @_dev/sdk @_dev/helpers
```

Then create `_dev.config.js`:

```js
const { defineConfig } = require("@_dev/sdk");
const { leasePort } = require("@_dev/helpers");

module.exports = defineConfig(({ root, session }) => {
  const webPort = leasePort({ name: "web", basePort: 3000, cwd: root, session });

  return {
    apps: {
      web: {
        description: "Run web app",
        start: () => `pnpm run dev --port "${webPort}"`,
      },
    },
  };
});
```

Run it with:

```sh
npx _dev start web
```

For TypeScript repos, `_dev.config.ts` is also supported.
If the repo wants a bootstrap script for worktree-specific setup, use `_dev.setup.worktree.sh`.

## Examples

- [basic](/Users/hfossli/Projects/fossli/dev/examples/basic/_dev.config.js)
- [worktree](/Users/hfossli/Projects/fossli/dev/examples/worktree/_dev.config.js)

`install.sh` and the files under `src/` are retained as example/bootstrap assets, but installed packages and `npx` are the primary supported workflow.
