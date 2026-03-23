# `@hfossli/dev-sdk`

Public config authoring API for [`@hfossli/dev`](https://www.npmjs.com/package/@hfossli/dev).

## Install

```sh
pnpm add -D @hfossli/dev-sdk
```

## Usage

```js
const { defineConfig } = require("@hfossli/dev-sdk");

module.exports = defineConfig(({ root, session }) => ({
  apps: {
    web: {
      start: () => `pnpm run dev --port 3000`,
    },
  },
}));
```

Use this package together with `@hfossli/dev` and, when needed, `@hfossli/dev-helpers`.
