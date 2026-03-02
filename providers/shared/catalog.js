import { readFile } from "node:fs/promises";
import path from "node:path";

function manifestPath() {
  return path.resolve(process.cwd(), "library", "manifests", "team-library.json");
}

export async function loadCatalog() {
  const raw = await readFile(manifestPath(), "utf8");
  const manifest = JSON.parse(raw);

  const entries = await Promise.all(
    (manifest.entries || []).map(async (entry) => {
      const absolute = path.resolve(process.cwd(), entry.path);
      const content = await readFile(absolute, "utf8");
      return {
        ...entry,
        absolutePath: absolute,
        content
      };
    })
  );

  return {
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    entries
  };
}

export function byKind(entries, kind) {
  return entries.filter((entry) => entry.kind === kind);
}
