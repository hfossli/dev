# `@hfossli/dev`

CLI for starting apps, managing tmux sessions, tailing logs, and running repo tools from a `dev.config.js` or `dev.config.ts` file.

## Install

```sh
pnpm add -D @hfossli/dev @hfossli/dev-sdk @hfossli/dev-helpers
```

## Usage

Create `dev.config.js`:

```js
const { defineConfig } = require("@hfossli/dev-sdk");
const { leasePort } = require("@hfossli/dev-helpers");

module.exports = defineConfig(({ root, session }) => ({
  apps: {
    web: {
      start: () => `pnpm run dev --port "${leasePort({ name: "web", basePort: 3000, cwd: root, session })}"`,
    },
  },
}));
```

Start an app:

```sh
npx dev start web
```

See the repo README for examples and helper utilities.
