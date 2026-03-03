import path from "node:path";
import { readJson, withFileLock, writeJson } from "../runtime/json-store.js";
import { runAdoSync } from "./adapters/ado/adapter.js";
import { runItrackSync } from "./adapters/itrack/adapter.js";

function stateDir() {
  return path.resolve(process.cwd(), ".agent-manager");
}

function statePath() {
  return path.join(stateDir(), "sync-state.json");
}

function stateLockPath() {
  return path.join(stateDir(), "sync-state.lock");
}

function outputPath() {
  return path.resolve(process.cwd(), "queue", "work-items.latest.json");
}

async function loadState() {
  return readJson(statePath(), { sources: {} });
}

async function saveState(state) {
  await writeJson(statePath(), state);
}

async function writeOutput(items) {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items
  };
  await writeJson(outputPath(), payload);
}

async function runSyncUnsafe({ source, limit, dryRun }) {
  const state = await loadState();
  const summaries = [];
  const allItems = [];

  const sources = source === "all" ? ["ado", "itrack"] : [source];
  for (const provider of sources) {
    const cursor = state.sources[provider]?.cursor || null;
    const runner = provider === "ado" ? runAdoSync : runItrackSync;
    const result = await runner({ cursor, limit });
    allItems.push(...result.items);
    state.sources[provider] = {
      cursor: result.nextCursor || cursor,
      lastSyncAt: new Date().toISOString(),
      fetched: result.items.length
    };
    summaries.push({
      source: provider,
      fetched: result.items.length,
      nextCursor: result.nextCursor || cursor
    });
  }

  if (!dryRun) {
    await writeOutput(allItems);
    await saveState(state);
  }

  return {
    dryRun,
    totalFetched: allItems.length,
    outputPath: dryRun ? null : outputPath(),
    statePath: dryRun ? null : statePath(),
    sources: summaries
  };
}

export async function runIntakeSync({ source, limit, dryRun }) {
  if (dryRun) {
    return runSyncUnsafe({ source, limit, dryRun });
  }
  return withFileLock(stateLockPath(), () => runSyncUnsafe({ source, limit, dryRun }));
}
