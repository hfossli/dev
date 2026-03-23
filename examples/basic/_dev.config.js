const { defineConfig } = require("@_dev/sdk");

module.exports = defineConfig(({ session }) => ({
  apps: {
    api: {
      description: "Minimal example app",
      start: () => `echo basic-api-${session}`,
    },
  },
  tools: {
    hello: {
      description: "Echo tool arguments",
      run: (quotedArgs) => `echo hello ${quotedArgs}`.trim(),
    },
  },
}));
