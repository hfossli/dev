function formatAvailableEntries(entries = []) {
  if (!entries || entries.length === 0) return ["  (none)"];
  return entries.map((entry) =>
    entry.description ? `  ${entry.name}: ${entry.description}` : `  ${entry.name}`
  );
}

function usage(appEntries = [], toolEntries = []) {
  const appLines = formatAvailableEntries(appEntries);
  const toolLines = formatAvailableEntries(toolEntries);
  return [
    "Usage:",
    "  _dev start <app> [--attach|--split-attach] [--lines <n>]",
    "  _dev restart <app|all> [--attach|--split-attach] [--lines <n>]",
    "  _dev stop <app|all>",
    "  _dev attach",
    "  _dev logs <app> [--lines <n>]",
    "  _dev tail <app> [--lines <n>] [--until-marker <text>] [--until-timeout <seconds>]",
    "  _dev split-attach [--lines <n>]",
    "  _dev tool <tool-name> [tool args...]",
    "",
    "Available apps:",
    ...appLines,
    "",
    "Available tools:",
    ...toolLines,
    "",
    "Examples:",
    "  npx _dev start api",
    "  npx _dev start api --attach",
    "  npx _dev start api --split-attach --lines 200",
    "  npx _dev restart all --split-attach",
    "  npx _dev stop all",
    "  npx _dev logs api --lines 250",
    "  npx _dev tail api --until-marker READY --until-timeout 30",
    "  npx _dev tool axe tap --label \"Continue\"",
  ].join("\n");
}

module.exports = {
  usage,
  formatAvailableEntries,
};
