# `_dev`

`_dev` is a reusable development orchestration CLI for starting apps, managing tmux sessions, tailing logs, and composing repo-specific tools from a code-first `_dev.config.js` or `_dev.config.ts`.

## Packages

- `_dev`: CLI runtime and config loader
- `@_dev/sdk`: public config API via `defineConfig(...)`
- `@_dev/helpers`: first-party utility package for ports, worktrees, shell commands, setup, iOS simulator tooling, and git workflow helpers

## Quick Start

Install the packages in the consumer repo:

```sh
pnpm add -D _dev @_dev/sdk @_dev/helpers
```

Then create `_dev.config.ts`:

```ts
import { defineConfig } from "@_dev/sdk";
import { leasePort } from "@_dev/helpers";

export default defineConfig(({ root, session }) => {
  const webPort = leasePort({ name: "web", basePort: 3000, cwd: root, session });
  const apiPort = leasePort({ name: "api", basePort: 8787, cwd: root, session });

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
        description: "Example one-shot command",
        run: "git-main-pull",
      },
    },
  };
});
```

If the repo wants a worktree bootstrap script, create `_dev.setup.worktree.sh` by copying or adapting [examples/worktree/_dev.setup.worktree.sh](/Users/hfossli/Projects/fossli/dev/examples/worktree/_dev.setup.worktree.sh).

Run it with:

```sh
npx _dev start web
npx _dev start api
npx _dev tool pull
```

## Mental Model

`_dev` currently uses `apps` and `tools` in config.

- `apps` are long-running managed processes
  - examples: web app, API server, worker, tunnel, watcher
  - they work with `start`, `restart`, `stop`, `logs`, `tail`, `attach`, and tmux
- `tools` are one-shot commands
  - examples: pull, merge, deploy, codegen, cleanup
  - they run through `_dev tool <name>`

If you prefer the language of `services` and `commands`, that is a good mental model, but the current config schema still uses `apps` and `tools`.

## Utility Bins

`@_dev/helpers` is the package home for utility commands:

- `portlease`
- `ios-sim-lease`
- `ios-sim-boot`
- `git-main-pull`
- `git-main-merge`

## Examples

- [basic](/Users/hfossli/Projects/fossli/dev/examples/basic/_dev.config.js)
- [worktree](/Users/hfossli/Projects/fossli/dev/examples/worktree/_dev.config.js)

The repo is package-first: runtime code lives under `packages/`, and examples live under `examples/`.
