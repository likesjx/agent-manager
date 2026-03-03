import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describeCommands, describeSystem, describeWorkflows, getConfig } from "../runtime/introspect.js";
import { heartbeatAgent, listAgents, onboardAgent, registerAgent } from "../profiles/registry.js";

async function withTempWorkspace(fn) {
  const prev = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-manager-agent-"));
  process.chdir(dir);
  try {
    await mkdir("inventory", { recursive: true });
    await mkdir("workflows", { recursive: true });
    await mkdir("library/manifests", { recursive: true });
    await mkdir("library/skills", { recursive: true });
    await writeFile("package.json", `${JSON.stringify({ version: "0.1.0" }, null, 2)}\n`, "utf8");
    await writeFile(
      "inventory/commands.yaml",
      "commands:\n  - id: library.list\n    usage: node cli.js library list\n    category: library\n",
      "utf8"
    );
    await writeFile(
      "workflows/handoff.yaml",
      "workflow_id: handoff\nname: Agent Handoff\nrequired_steps: []\nartifacts: []\nrole_policy: {}\nautomation_hooks: []\n",
      "utf8"
    );
    await writeFile(
      "library/manifests/team-library.json",
      `${JSON.stringify({ version: "1.0.0", updatedAt: "2026-03-03", entries: [] }, null, 2)}\n`,
      "utf8"
    );
    await fn(dir);
  } finally {
    process.chdir(prev);
  }
}

test("introspection commands produce structured output", async () => {
  await withTempWorkspace(async () => {
    const system = await describeSystem();
    assert.equal(system.name, "agent-manager");

    const commands = await describeCommands();
    assert.equal(commands.commands.length, 1);

    const workflows = await describeWorkflows();
    assert.equal(workflows.workflows.length, 1);

    const config = await getConfig();
    assert.ok(config.paths.library.endsWith("library"));
  });
});

test("agent register heartbeat list and onboard", async () => {
  await withTempWorkspace(async () => {
    const reg = await registerAgent({ id: "codex-a", provider: "claude-code", capabilities: "nodejs,workflow" });
    assert.equal(reg.id, "codex-a");

    const beat = await heartbeatAgent({ id: "codex-a", status: "working" });
    assert.equal(beat.status, "working");

    const listed = await listAgents({});
    assert.equal(listed.total, 1);

    const onboarded = await onboardAgent(
      { id: "codex-b", provider: "claude-code", capabilities: "docs", "skip-install": true },
      {
        describeSystem,
        listLibrary: async () => ({ count: 0, entries: [] }),
        installProviderBundle: async () => ({ installed: true })
      }
    );
    assert.equal(onboarded.registered.id, "codex-b");
    assert.equal(onboarded.provider_install.skipped, true);
  });
});
