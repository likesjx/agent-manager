import path from "node:path";
import { readJson, writeJson, nowIso } from "../runtime/json-store.js";

function registryPath() {
  return path.resolve(process.cwd(), ".agent-manager", "agent-registry.json");
}

async function loadRegistry() {
  return readJson(registryPath(), { version: 1, agents: [] });
}

function splitCsv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function registerAgent(flags) {
  const id = String(flags.id || "").trim();
  const provider = String(flags.provider || "unknown").trim();
  const name = String(flags.name || id || "").trim();
  const capabilities = splitCsv(flags.capabilities);

  if (!id) {
    throw new Error("agent register requires --id");
  }

  const registry = await loadRegistry();
  const index = registry.agents.findIndex((x) => x.id === id);
  if (index >= 0 && !flags.force) {
    throw new Error(`agent '${id}' already registered; use --force to overwrite`);
  }

  const now = nowIso();
  const existing = index >= 0 ? registry.agents[index] : null;
  const payload = {
    id,
    name,
    provider,
    capabilities,
    status: String(flags.status || "active").trim(),
    registered_at: existing?.registered_at || now,
    updated_at: now,
    last_heartbeat: now
  };

  if (index >= 0) {
    registry.agents[index] = payload;
  } else {
    registry.agents.push(payload);
  }

  await writeJson(registryPath(), registry);
  return payload;
}

export async function heartbeatAgent(flags) {
  const id = String(flags.id || "").trim();
  if (!id) {
    throw new Error("agent heartbeat requires --id");
  }

  const registry = await loadRegistry();
  const agent = registry.agents.find((x) => x.id === id);
  if (!agent) {
    throw new Error(`agent '${id}' not registered`);
  }

  agent.last_heartbeat = nowIso();
  if (flags.status) {
    agent.status = String(flags.status).trim();
  }
  agent.updated_at = agent.last_heartbeat;

  await writeJson(registryPath(), registry);
  return { id: agent.id, last_heartbeat: agent.last_heartbeat, status: agent.status };
}

export async function listAgents(flags = {}) {
  const registry = await loadRegistry();
  const maxAgeSeconds = Number(flags["offline-seconds"] || process.env.AGENT_HEARTBEAT_TTL_SECONDS || 300);
  const cutoff = Date.now() - Math.max(30, maxAgeSeconds) * 1000;

  return {
    total: registry.agents.length,
    agents: registry.agents.map((agent) => ({
      ...agent,
      online: Date.parse(agent.last_heartbeat || "") >= cutoff
    }))
  };
}

export async function onboardAgent(flags, deps) {
  const registration = await registerAgent(flags);
  const system = await deps.describeSystem();
  const library = await deps.listLibrary({});
  let install = null;

  if (flags["skip-install"]) {
    install = { skipped: true };
  } else {
    try {
      install = await deps.installProviderBundle({ provider: registration.provider });
    } catch (error) {
      install = { skipped: true, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    registered: registration,
    system,
    library: {
      count: library.count,
      entries: library.entries.slice(0, 10)
    },
    provider_install: install
  };
}
