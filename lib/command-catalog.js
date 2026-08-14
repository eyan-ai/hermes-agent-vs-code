"use strict";

const LOCAL_GROUPS = [
  ["Session", [
    ["new", "Start a new session", "local"],
    ["title", "Show or rename the current session", "local"],
    ["stop", "Stop the active task", "local"],
    ["queue", "Queue a prompt for the next turn", "local"],
    ["steer", "Guide the active task without interrupting it", "steer"],
    ["status", "Show session status", "local"],
    ["resume", "Resume a local extension session", "local"],
    ["sessions", "List local extension sessions", "local"]
  ]],
  ["Configuration", [
    ["model", "Show or change the model", "local"]
  ]],
  ["Tools & Skills", [
    ["save", "Save the current conversation", "local"]
  ]],
  ["Info", [
    ["help", "Show available commands", "local"],
    ["usage", "Show token usage", "local"],
    ["debug", "Show session diagnostics", "local"]
  ]]
];

const DEFAULT_ACP_COMMANDS = [
  { name: "tools", description: "List available tools" },
  { name: "context", description: "Show conversation context info" },
  { name: "reset", description: "Clear conversation history" },
  { name: "compact", description: "Compress conversation context" },
  { name: "version", description: "Show the Hermes version" }
];

const BUILTIN_ALIASES = {
  compress: "/compact"
};

function stripYamlValue(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseQuickCommands(yamlText) {
  const result = {};
  const lines = String(yamlText || "").replace(/\t/g, "  ").split(/\r?\n/);
  let sectionIndent = -1;
  let commandIndent = -1;
  let currentName = "";
  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const trimmed = rawLine.trim();
    if (sectionIndent < 0) {
      if (trimmed === "quick_commands:") sectionIndent = indent;
      continue;
    }
    if (indent <= sectionIndent) break;
    const commandMatch = trimmed.match(/^([^:#][^:]*):\s*$/);
    if (commandMatch && (commandIndent < 0 || indent <= commandIndent)) {
      currentName = commandMatch[1].trim();
      commandIndent = indent;
      result[currentName] = {};
      continue;
    }
    if (!currentName || indent <= commandIndent) continue;
    const fieldMatch = trimmed.match(/^(type|command|target|description):\s*(.*)$/);
    if (fieldMatch) result[currentName][fieldMatch[1]] = stripYamlValue(fieldMatch[2]);
  }
  for (const [name, command] of Object.entries(result)) {
    if (!command || typeof command !== "object") delete result[name];
  }
  return result;
}

function normalizedName(value) {
  return String(value || "").trim().replace(/^\//, "").toLowerCase();
}

function commandEntry(name, description, executor = "local", extra = {}) {
  const rawName = normalizedName(name);
  return {
    name: `/${rawName}`,
    description: String(description || ""),
    type: "command",
    value: `/${rawName}`,
    executor,
    ...extra
  };
}

function normalizeAvailableCommands(availableCommands = DEFAULT_ACP_COMMANDS) {
  const result = [];
  const seen = new Set();
  for (const item of availableCommands || []) {
    const raw = typeof item === "string" ? { name: item } : (item || {});
    const name = normalizedName(raw.name);
    if (!name || seen.has(name) || ["help", "model", "queue", "steer"].includes(name)) continue;
    seen.add(name);
    result.push({
      name,
      description: raw.description || `Run Hermes /${name}`,
      input: raw.input || null
    });
  }
  return result;
}

function buildCommandCatalog({ skills = [], quickCommands = {}, availableCommands = DEFAULT_ACP_COMMANDS } = {}) {
  const groups = LOCAL_GROUPS.map(([name, commands]) => ({
    name,
    commands: commands.map(([command, description, executor]) => commandEntry(command, description, executor))
  }));
  const acpCommands = normalizeAvailableCommands(availableCommands)
    .map(command => commandEntry(command.name, command.description, "acp", { input: command.input }));
  if (acpCommands.some(command => command.name === "/compact")) {
    acpCommands.push(commandEntry("compress", "Alias for /compact", "alias", { target: "/compact" }));
  }
  if (acpCommands.length) groups.splice(2, 0, { name: "Hermes ACP", commands: acpCommands });

  const executableNames = new Set(groups.flatMap(group => group.commands.map(command => command.name)));
  const userCommands = Object.entries(quickCommands || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, config]) => {
      const command = config && typeof config === "object" ? config : {};
      if (command.type !== "alias") return [];
      const targetName = `/${normalizedName(String(command.target || "").split(/\s+/, 1)[0])}`;
      if (!executableNames.has(targetName)) return [];
      return [commandEntry(name, command.description || `alias -> ${command.target}`, "alias", { target: command.target })];
    });
  if (userCommands.length) groups.push({ name: "User commands", commands: userCommands });

  const installedSkills = (skills || []).map(skill => ({
    name: `/${String(skill.name || "").replace(/^\//, "")}`,
    description: skill.description || "Installed Skill",
    type: "skill",
    value: String(skill.name || "").replace(/^\//, "")
  })).sort((left, right) => left.name.localeCompare(right.name));
  if (installedSkills.length) groups.push({ name: "Installed Skills", commands: installedSkills });
  return groups;
}

function resolveCommand(commandName, options = {}) {
  const name = `/${normalizedName(commandName)}`;
  for (const group of buildCommandCatalog(options)) {
    const match = (group.commands || []).find(command => command.type === "command" && command.name === name);
    if (match) return { ...match };
  }
  const aliasTarget = BUILTIN_ALIASES[normalizedName(commandName)];
  return aliasTarget ? commandEntry(commandName, `Alias for ${aliasTarget}`, "alias", { target: aliasTarget }) : undefined;
}

const BUILTIN_GROUPS = LOCAL_GROUPS;

module.exports = {
  BUILTIN_ALIASES,
  BUILTIN_GROUPS,
  DEFAULT_ACP_COMMANDS,
  buildCommandCatalog,
  normalizeAvailableCommands,
  parseQuickCommands,
  resolveCommand
};
