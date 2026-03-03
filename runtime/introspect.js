import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "./json-store.js";

function commandsPath() {
  return path.resolve(process.cwd(), "inventory", "commands.yaml");
}

export async function describeSystem() {
  const pkg = await readJson(path.resolve(process.cwd(), "package.json"), { version: "0.0.0" });
  return {
    name: "agent-manager",
    version: pkg.version,
    capabilities: {
      intake: { sources: ["ado", "itrack"], operations: ["sync"] },
      library: { kinds: ["agent", "hook", "skill", "plugin", "prompt", "tool"], operations: ["check", "add", "remove", "list", "show", "scaffold"] },
      handoff: { operations: ["start", "validate", "resume", "rollback", "list"], protocols: { delivery: ["push", "pull"], mode: ["sync", "async"] } },
      work: { operations: ["assign", "checkpoint", "complete", "release", "status"] },
      provider: { supported: ["claude-code"], operations: ["render", "install"] },
      workflow: { operations: ["check"] },
      agent: { operations: ["register", "heartbeat", "list", "onboard"] }
    },
    paths: {
      library: "library/",
      queue: "queue/",
      handoffs: "handoffs/",
      state: ".agent-manager/",
      providers: ".agent-manager/providers/"
    }
  };
}

export async function describeCommands() {
  const raw = await readFile(commandsPath(), "utf8");
  const lines = raw.split(/\r?\n/);
  const commands = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- id:")) {
      if (current) {
        commands.push(current);
      }
      current = { id: trimmed.slice(5).trim() };
      continue;
    }
    if (!current) {
      continue;
    }
    if (trimmed.startsWith("usage:")) {
      current.usage = trimmed.slice(6).trim();
      continue;
    }
    if (trimmed.startsWith("category:")) {
      current.category = trimmed.slice(9).trim();
    }
  }
  if (current) {
    commands.push(current);
  }

  return { commands };
}

export async function describeWorkflows() {
  const dir = path.resolve(process.cwd(), "workflows");
  const files = (await readdir(dir)).filter((x) => x.endsWith(".yaml")).sort();
  const workflows = [];

  for (const file of files) {
    const full = path.join(dir, file);
    const raw = await readFile(full, "utf8");
    const workflowId = (raw.match(/^workflow_id:\s*(.+)$/m) || [null, ""])[1].trim();
    const name = (raw.match(/^name:\s*(.+)$/m) || [null, ""])[1].trim();
    workflows.push({ workflow_id: workflowId, name, file: `workflows/${file}` });
  }

  return { workflows };
}

export async function getConfig() {
  const adoConfigured = Boolean(process.env.ADO_ORG && process.env.ADO_PROJECT && process.env.ADO_PAT);
  const itrackConfigured = Boolean(process.env.ITRACK_BASE_URL && process.env.ITRACK_TOKEN);

  return {
    environment: {
      ado: { configured: adoConfigured, required_vars: ["ADO_ORG", "ADO_PROJECT", "ADO_PAT"] },
      itrack: { configured: itrackConfigured, required_vars: ["ITRACK_BASE_URL", "ITRACK_TOKEN"] }
    },
    paths: {
      library: path.resolve(process.cwd(), "library"),
      queue: path.resolve(process.cwd(), "queue"),
      handoffs: path.resolve(process.cwd(), "handoffs"),
      state: path.resolve(process.cwd(), ".agent-manager"),
      providers: path.resolve(process.cwd(), ".agent-manager", "providers")
    },
    library: {
      manifest: "library/manifests/team-library.json",
      kinds: ["agent", "hook", "skill", "plugin", "prompt", "tool"]
    }
  };
}
