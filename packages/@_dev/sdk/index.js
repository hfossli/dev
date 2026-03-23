const CONFIG_MARKER = Symbol.for("dev.defineConfig");
const LEGACY_CONFIG_MARKER = Symbol.for("_dev.defineConfig");

function defineConfig(configFactory) {
  if (typeof configFactory !== "function") {
    throw new TypeError("defineConfig(...) requires a function.");
  }

  Object.defineProperty(configFactory, CONFIG_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(configFactory, LEGACY_CONFIG_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return configFactory;
}

function isDefinedConfig(value) {
  return Boolean(value && (value[CONFIG_MARKER] || value[LEGACY_CONFIG_MARKER]));
}

module.exports = {
  CONFIG_MARKER,
  defineConfig,
  isDefinedConfig,
};
