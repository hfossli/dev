# AGENTS.md

## Purpose

`_dev` is a package-first monorepo for a development orchestration CLI.

The project has three main responsibilities:

- provide the `_dev` CLI for starting and monitoring long-running repo processes
- provide a public SDK for authoring `_dev.config.js` and `_dev.config.ts`
- provide reusable helper functions and utility bins for ports, worktrees, shell commands, simulator tooling, and git workflows

This repo no longer uses `src/` or an installer as a source of truth. Runtime code lives under `packages/`, and sample consumer files live under `examples/`.

## Repo Structure

- `packages/_dev`
  - The CLI package.
  - Entry bin: `packages/_dev/bin/_dev.js`
  - Main runtime entrypoint: `packages/_dev/src/cli.js`
  - Internal areas:
    - `src/internal/commands`: command handlers like `start`, `stop`, `logs`, `tail`, `tool`, `cmd`
    - `src/internal/config`: config discovery, loading, normalization, validation
    - `src/internal/runtime`: tmux/process/shell helpers used by the CLI
    - `src/internal/usage.js` and `src/internal/parse-args.js`: help text and arg parsing
- `packages/@_dev/sdk`
  - Public config authoring API.
  - Main file: `packages/@_dev/sdk/index.js`
  - Owns `defineConfig(...)` and config marker detection.
- `packages/@_dev/helpers`
  - Public helper library and utility-bin package.
  - Main file: `packages/@_dev/helpers/index.js`
  - Domain modules:
    - `ports.js`
    - `worktree.js`
    - `shell.js`
    - `setup.js`
    - `ios.js`
    - `git.js`
  - Published utility bins are declared in `packages/@_dev/helpers/package.json`.
- `examples/`
  - Sample consumer configs and setup scripts.
  - Use these when updating docs or demonstrating a feature.
- `tests/`
  - Node test runner coverage for config loading, CLI smoke behavior, helpers, and runtime command behavior.

## Current Public Model

The current public config model still uses `apps` and `tools`.

- `apps` are long-running managed processes
  - started via `_dev start ...`
  - managed in tmux
  - support `restart`, `stop`, `logs`, `tail`, `attach`, and `split-attach`
- `tools` are one-shot commands
  - run via `_dev tool <name>`
  - accept passthrough args
  - are not tmux-managed

Important: there has been discussion about renaming these to `services` and `commands`, but that rename is not implemented in the current code. Keep docs, examples, and validation aligned with the actual current API unless you are intentionally doing that migration.

## Config Loading Notes

Config loading lives in `packages/_dev/src/internal/config/load-config.js`.

Behavior to know:

- preferred filenames are `_dev.config.js` and `_dev.config.ts`
- legacy `dev.config.js` and `dev.config.ts` are still supported with warnings
- modern configs use `defineConfig(({ root, cwd, session, env, platform }) => ({ ... }))`
- legacy `config(session)` style is still supported with warnings
- `_dev.config.ts` is supported without a TS build step by using Node's `stripTypeScriptTypes`

Normalization and structural validation live in `packages/_dev/src/internal/config/normalize-config.js`.

If you change config shape, update:

- `load-config.js`
- `normalize-config.js`
- examples under `examples/`
- tests in `tests/sdk-config.test.js` and any affected CLI smoke tests

## Utility Bins

The helper package owns these executable bins today:

- `portlease`
- `ios-sim-lease`
- `ios-sim-boot`
- `git-main-pull`
- `git-main-merge`

If you add a new utility bin:

- implement it under `packages/@_dev/helpers/bin/`
- expose reusable logic from a helper module when appropriate
- register it in `packages/@_dev/helpers/package.json`
- add or update tests in `tests/helpers.test.js`

## Where To Make Changes

Use this as a shortcut when debugging or adding features:

- CLI command behavior is wrong
  - start in `packages/_dev/src/cli.js`
  - then go to `packages/_dev/src/internal/commands/`
- config file is not discovered or loaded correctly
  - start in `packages/_dev/src/internal/config/load-config.js`
- config validation or allowed fields need to change
  - start in `packages/_dev/src/internal/config/normalize-config.js`
- tmux behavior is wrong
  - start in `packages/_dev/src/internal/runtime/tmux.js`
- shell/process execution behavior is wrong
  - check `packages/_dev/src/internal/runtime/process.js`
  - and `packages/@_dev/helpers/internal/process.js`
- helper API or utility bin behavior is wrong
  - start in `packages/@_dev/helpers/`
- public config authoring API needs to change
  - start in `packages/@_dev/sdk/index.js`

## Development Workflow

Run tests from the repo root:

```sh
NODE_PATH=$PWD/packages node --test tests/*.test.js
```

Or use:

```sh
npm test
```

Notes:

- tests rely on `NODE_PATH=$PWD/packages` so workspace packages can be required without an install step
- helper tests set `PORTLEASE_SKIP_PORT_CHECK=1` to avoid sandbox/network/socket issues during testing
- CLI smoke tests execute the real `_dev` bin against files in `examples/`

## Expectations For Changes

When adding or changing features:

- prefer package code over repo-local scaffolding
- keep `examples/` up to date when public behavior changes
- keep tests close to the changed behavior
- do not reintroduce `src/`-based wrappers or installer-driven architecture unless the product direction explicitly changes

When fixing bugs:

- add or update the smallest test that would have caught the bug
- prefer fixing behavior in the canonical package module rather than patching around it in a bin

## Good First Checks

If you are new to the repo and trying to diagnose a bug quickly:

1. read `README.md`
2. inspect `packages/_dev/src/cli.js`
3. inspect the relevant file under `packages/_dev/src/internal/`
4. run `NODE_PATH=$PWD/packages node --test tests/*.test.js`
5. compare behavior with `examples/basic/_dev.config.js` and `examples/worktree/_dev.config.js`
