"use strict";

const assert = require("assert");
const { buildCommandCatalog, parseQuickCommands, resolveCommand } = require("../lib/command-catalog");

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test("the catalog exposes only commands with explicit executors", () => {
  const groups = buildCommandCatalog({ skills: [], quickCommands: {} });
  const commands = groups.flatMap(group => group.commands);
  assert.ok(commands.length > 0);
  assert.ok(commands.every(command => command.type !== "command" || command.executor));
  assert.ok(commands.some(command => command.name === "/stop" && command.executor === "local"));
  assert.ok(commands.some(command => command.name === "/compact" && command.executor === "acp"));
  assert.ok(commands.some(command => command.name === "/compress" && command.target === "/compact"));
  assert.ok(!commands.some(command => command.name === "/rollback"));
});

test("ACP command discovery controls the remote command group", () => {
  const groups = buildCommandCatalog({ availableCommands: [
    { name: "version", description: "Show version" },
    { name: "future-command", description: "Future capability" }
  ] });
  const acp = groups.find(group => group.name === "Hermes ACP").commands;
  assert.deepStrictEqual(acp.map(command => command.name), ["/version", "/future-command"]);
  assert.ok(acp.every(command => command.executor === "acp"));
});

test("only executable quick-command aliases are advertised and exec entries stay hidden", () => {
  const groups = buildCommandCatalog({
    quickCommands: {
      savecopy: { type: "alias", target: "/save", description: "Save a copy" },
      missing: { type: "alias", target: "/does-not-exist" },
      deploy: { type: "exec", command: "scripts/deploy.sh" }
    },
    skills: [{ name: "gif-search", description: "Find a GIF" }]
  });
  const user = groups.find(group => group.name === "User commands");
  const skills = groups.find(group => group.name === "Installed Skills");
  assert.deepStrictEqual(user.commands.map(command => command.name), ["/savecopy"]);
  assert.strictEqual(user.commands[0].target, "/save");
  assert.deepStrictEqual(skills.commands[0], {
    name: "/gif-search",
    description: "Find a GIF",
    type: "skill",
    value: "gif-search"
  });
});

test("command resolution rejects unadvertised CLI-only commands", () => {
  assert.strictEqual(resolveCommand("/rollback"), undefined);
  assert.strictEqual(resolveCommand("/stop").executor, "local");
  assert.strictEqual(resolveCommand("/compress").target, "/compact");
});

test("quick command YAML parser supports exec and alias entries", () => {
  const parsed = parseQuickCommands(`model:\n  default: example\nquick_commands:\n  status:\n    type: exec\n    command: systemctl status hermes-agent\n  inbox:\n    type: alias\n    target: /save\n    description: Save now\nother: true\n`);
  assert.deepStrictEqual(parsed, {
    status: { type: "exec", command: "systemctl status hermes-agent" },
    inbox: { type: "alias", target: "/save", description: "Save now" }
  });
});

test("quick command YAML parser also supports the nested gateway form", () => {
  const parsed = parseQuickCommands(`gateway:\n  quick_commands:\n    limits:\n      type: exec\n      command: echo ok\n`);
  assert.deepStrictEqual(parsed, {
    limits: { type: "exec", command: "echo ok" }
  });
});

for (const { name, run } of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
