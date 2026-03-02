import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath, fallbackValue = null) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${suffix}`;
}
