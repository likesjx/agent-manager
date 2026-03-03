import path from "node:path";
import { readJson, writeJson } from "../json-store.js";

function credentialsPath(rootDir) {
  return path.resolve(rootDir, ".agent-manager", "credentials.json");
}

export async function storeCredential(rootDir, key, value) {
  const file = credentialsPath(rootDir);
  const current = await readJson(file, { version: 1, values: {} });
  current.values[key] = { value: String(value), updatedAt: new Date().toISOString() };
  await writeJson(file, current);
  return { backend: "file", key };
}

export async function getCredential(rootDir, key) {
  const file = credentialsPath(rootDir);
  const current = await readJson(file, { version: 1, values: {} });
  const entry = current.values?.[key];
  return entry?.value || null;
}

export async function listCredentials(rootDir) {
  const file = credentialsPath(rootDir);
  const current = await readJson(file, { version: 1, values: {} });
  return Object.keys(current.values || {});
}
