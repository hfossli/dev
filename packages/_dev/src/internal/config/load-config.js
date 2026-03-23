const fs = require("node:fs");
const path = require("node:path");
const { createRequire, stripTypeScriptTypes } = require("node:module");
const { pathToFileURL } = require("node:url");
const { isDefinedConfig } = require("../../../../@_dev/sdk");
const { sessionName } = require("../../../../@_dev/helpers/worktree.js");
const { normalizeRuntimeConfig } = require("./normalize-config.js");
const { createUsageError } = require("./normalize-config.js");

const CONFIG_CANDIDATE_FILENAMES = [
  "_dev.config.js",
  "_dev.config.ts",
  "dev.config.js",
  "dev.config.ts",
];
const LEGACY_CONFIG_FILENAMES = new Set(["dev.config.js", "dev.config.ts"]);

function stripConfigTypeScript(sourceCode) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function emitWarningPatched(warning, ...args) {
    const type = typeof args[0] === "string" ? args[0] : warning && warning.name;
    const message =
      typeof warning === "string" ? warning : warning && warning.message ? warning.message : "";
    if (type === "ExperimentalWarning" && message.includes("stripTypeScriptTypes")) {
      return;
    }
    return originalEmitWarning.call(this, warning, ...args);
  };

  try {
    return stripTypeScriptTypes(sourceCode);
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function transformImportsToRequire(sourceCode) {
  return sourceCode
    .replace(
      /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
      (_match, imports, moduleName) => `const {${imports.trim()}} = require(${JSON.stringify(moduleName)});`
    )
    .replace(
      /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm,
      (_match, name, moduleName) => `const ${name} = require(${JSON.stringify(moduleName)});`
    )
    .replace(
      /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm,
      (_match, name, moduleName) =>
        `const ${name} = (() => { const __imported = require(${JSON.stringify(moduleName)}); return __imported && __imported.default !== undefined ? __imported.default : __imported; })();`
    );
}

function transformExportsToCommonJs(sourceCode) {
  const transformed = sourceCode.replace(/\bexport\s+default\b/, "module.exports.default =");
  if (transformed !== sourceCode) {
    return transformed;
  }
  return sourceCode;
}

function loadConfigModuleFromTransformedSource(configPath, sourceCode) {
  const stripped = configPath.endsWith(".ts") ? stripConfigTypeScript(sourceCode) : sourceCode;
  const transformed = transformExportsToCommonJs(transformImportsToRequire(stripped));

  const moduleObj = { exports: {} };
  const localRequire = createRequire(configPath);
  const dirname = path.dirname(configPath);
  const runner = new Function(
    "require",
    "module",
    "exports",
    "__filename",
    "__dirname",
    transformed
  );
  runner(localRequire, moduleObj, moduleObj.exports, configPath, dirname);
  return moduleObj.exports;
}

async function loadModule(configPath) {
  let loaded;

  try {
    loaded = require(configPath);
  } catch (requireError) {
    try {
      const imported = await import(pathToFileURL(configPath).href);
      loaded = imported;
    } catch (importError) {
      try {
        const sourceCode = fs.readFileSync(configPath, "utf8");
        loaded = loadConfigModuleFromTransformedSource(configPath, sourceCode);
      } catch (transpileError) {
        const detail =
          transpileError && transpileError.message
            ? transpileError.message
            : importError && importError.message
              ? importError.message
              : requireError.message;
        throw createUsageError(`Error: failed to load ${configPath}: ${detail}`);
      }
    }
  }

  if (!loaded || (typeof loaded !== "object" && typeof loaded !== "function")) {
    throw createUsageError(`Error: ${configPath} must export a config function or module object.`);
  }

  return loaded;
}

function findConfigPath(cwd = process.cwd()) {
  let currentDir = path.resolve(cwd);

  while (true) {
    for (const filename of CONFIG_CANDIDATE_FILENAMES) {
      const candidate = path.join(currentDir, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  throw createUsageError(
    `Error: failed to load config from ${path.resolve(cwd)}: no ${CONFIG_CANDIDATE_FILENAMES.join(", ")} file was found in this directory or any parent directory.`
  );
}

function getFactoryCandidate(loaded) {
  const candidates = [
    typeof loaded === "function" ? loaded : null,
    loaded && loaded.config,
    loaded && loaded.default,
    loaded && loaded.default && loaded.default.config,
  ];

  return candidates.find((candidate) => typeof candidate === "function") || null;
}

function buildConfigContext({ root, cwd, session }) {
  return {
    root,
    cwd,
    session,
    env: { ...process.env },
    platform: process.platform,
  };
}

function warnLegacyConfig(configPath) {
  process.stderr.write(
    `[deprecation] ${configPath} is using the legacy config(session) API. ` +
      `Switch to defineConfig(({ root, cwd, session, env, platform }) => ({ ... })).\n`
  );
}

function warnLegacyFilename(configPath) {
  process.stderr.write(
    `[deprecation] ${configPath} uses the legacy config filename. ` +
      `Rename it to _dev.config.js or _dev.config.ts.\n`
  );
}

async function loadRuntimeConfig({ configPath, root, cwd, session }) {
  const resolvedConfigPath = configPath || findConfigPath(cwd);
  const configRoot = root || path.dirname(resolvedConfigPath);
  const resolvedSession = session || sessionName(configRoot);
  const loaded = await loadModule(resolvedConfigPath);
  const configFactory = getFactoryCandidate(loaded);

  if (!configFactory) {
    throw createUsageError(
      `Error: ${resolvedConfigPath} must export defineConfig(...) or legacy config(session).`
    );
  }

  const mode = isDefinedConfig(configFactory) ? "modern" : "legacy";
  if (mode === "legacy") {
    warnLegacyConfig(resolvedConfigPath);
  }
  if (LEGACY_CONFIG_FILENAMES.has(path.basename(resolvedConfigPath))) {
    warnLegacyFilename(resolvedConfigPath);
  }

  const rawConfig =
    mode === "modern"
      ? configFactory(buildConfigContext({ root: configRoot, cwd, session: resolvedSession }))
      : configFactory(resolvedSession);

  return {
    configPath: resolvedConfigPath,
    root: configRoot,
    session: resolvedSession,
    mode,
    config: normalizeRuntimeConfig(rawConfig, resolvedConfigPath),
  };
}

module.exports = {
  buildConfigContext,
  findConfigPath,
  loadRuntimeConfig,
  loadConfigModuleFromTransformedSource,
};
