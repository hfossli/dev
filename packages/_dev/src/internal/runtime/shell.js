function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function withInheritedPath(command) {
  const inheritedPath = String(process.env.PATH || "");
  if (!inheritedPath) return String(command || "");
  return `export PATH=${shellQuote(inheritedPath)}; ${command}`;
}

module.exports = {
  shellQuote,
  withInheritedPath,
};
