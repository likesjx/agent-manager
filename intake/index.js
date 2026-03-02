import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runAdoSync } from "./adapters/ado/adapter.js";
import { runItrackSync } from "./adapters/itrack/adapter.js";

const STATE_DIR = path.resolve(process.cwd(), ".agent-manager");
const STATE_PATH = path.join(STATE_DIR, "sync-state.json");
const OUTPUT_DIR = path.resolve(process.cwd(), "queue");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "work-items.latest.json");

async function loadState() {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { sources: {} };
  }
}

async function saveState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function writeOutput(items) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function runIntakeSync({ source, limit, dryRun }) {
  const state = await loadState();
  const summaries = [];
  let allItems = [];

  const sources = source === "all" ? ["ado", "itrack"] : [source];
  for (const provider of sources) {
    const cursor = state.sources[provider]?.cursor || null;
    const runner = provider === "ado" ? runAdoSync : runItrackSync;
    const result = await runner({ cursor, limit });
    allItems = allItems.concat(result.items);
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
    outputPath: dryRun ? null : OUTPUT_PATH,
    statePath: dryRun ? null : STATE_PATH,
    sources: summaries
  };
}
