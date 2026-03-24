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
    "  dev start <app|all> [-a|--attach] [--lines <n>]",
    "  dev restart <app|all> [-a|--attach] [--lines <n>]",
    "  dev stop <app|all>",
    "  dev attach [app] [--lines <n>]",
    "  dev logs <app> [--lines <n>]",
    "  dev tail <app> [--lines <n>] [--until-marker <text>] [--until-timeout <seconds>]",
    "  dev tool <tool-name> [tool args...]",
    "",
    "Available apps:",
    ...appLines,
    "",
    "Available tools:",
    ...toolLines,
    "",
    "Examples:",
    "  npx dev start api",
    "  npx dev start api -a",
    "  npx dev start all --attach",
    "  npx dev attach",
    "  npx dev attach web",
    "  npx dev restart all -a",
    "  npx dev stop all",
    "  npx dev logs api --lines 250",
    "  npx dev tail api --until-marker READY --until-timeout 30",
    "  npx dev tool axe tap --label \"Continue\"",
  ].join("\n");
}

module.exports = {
  usage,
  formatAvailableEntries,
};
