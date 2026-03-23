# `dev`

`dev` is a reusable development orchestration CLI for starting apps, managing tmux sessions, tailing logs, and composing repo-specific tools from a code-first `dev.config.js` or `dev.config.ts`.

## Packages

- `@hfossli/dev`: CLI runtime and config loader
- `@hfossli/dev-sdk`: public config API via `defineConfig(...)`
- `@hfossli/dev-helpers`: first-party utility package for ports, worktrees, shell commands, setup, iOS simulator tooling, and git workflow helpers

## Official usage

Install the packages in the consumer repo:

```sh
pnpm add -D @hfossli/dev @hfossli/dev-sdk @hfossli/dev-helpers
```

Then create `dev.config.js`:

```js
const { defineConfig } = require("@hfossli/dev-sdk");
const { leasePort } = require("@hfossli/dev-helpers");

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
npx dev start web
```

For TypeScript repos, `dev.config.ts` is also supported.
If the repo wants a bootstrap script for worktree-specific setup, copy or adapt [examples/worktree/_dev.setup.worktree.sh](examples/worktree/_dev.setup.worktree.sh).

## Utility Bins

`@hfossli/dev-helpers` is the package home for utility commands:

- `portlease`
- `ios-sim-lease`
- `ios-sim-boot`
- `git-main-pull`
- `git-main-merge`

## Examples

- [basic](examples/basic/dev.config.js)
- [worktree](examples/worktree/dev.config.js)

The repo is package-first: runtime code lives under `packages/`, and examples live under `examples/`.
