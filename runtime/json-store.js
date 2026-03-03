import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath, fallbackValue = null) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.name === "SyntaxError") {
      throw error;
    }
    return fallbackValue;
  }
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export async function withFileLock(lockPath, fn) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle = null;
  try {
    handle = await open(lockPath, "wx");
    return await fn();
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`lock already held: ${lockPath}`);
    }
    throw error;
  } finally {
    if (handle) {
      await handle.close();
      await rm(lockPath, { force: true });
    }
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${suffix}`;
}
