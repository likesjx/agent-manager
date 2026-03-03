import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../runtime/json-store.js";
import { scaffoldLibraryEntry } from "./templates.js";

const VALID_KINDS = ["agent", "hook", "skill", "plugin", "prompt", "tool"];
const KIND_DIRS = {
  agent: "library/agents",
  hook: "library/hooks",
  skill: "library/skills",
  plugin: "library/plugins",
  prompt: "library/prompts",
  tool: "library/tools"
};

function manifestPath() {
  return path.resolve(process.cwd(), "library", "manifests", "team-library.json");
}

function parseCsv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function sanitizeSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function ensureKind(kind) {
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`Invalid --kind '${kind}'. Use: ${VALID_KINDS.join(", ")}`);
  }
}

function ensureSafePath(targetPath) {
  const root = process.cwd();
  const absolute = path.resolve(root, targetPath);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new Error(`path escapes workspace: ${targetPath}`);
  }
  return absolute;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function loadManifest() {
  const manifest = await readJson(manifestPath(), null);
  if (!manifest || !Array.isArray(manifest.entries)) {
    throw new Error("library manifest missing or invalid");
  }
  return manifest;
}

function entryId(kind, name, explicitId) {
  if (explicitId) {
    const candidate = String(explicitId).trim();
    if (!candidate.startsWith(`${kind}.`)) {
      throw new Error(`--id must start with '${kind}.'`);
    }
    return candidate;
  }
  return `${kind}.${sanitizeSlug(name)}`;
}

function sortEntries(entries) {
  entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind.localeCompare(b.kind);
    }
    return a.id.localeCompare(b.id);
  });
}

async function readContent(flags) {
  if (flags.content) {
    return String(flags.content);
  }
  if (flags.file) {
    const filePath = ensureSafePath(String(flags.file));
    return readFile(filePath, "utf8");
  }
  throw new Error("library add requires --content or --file");
}

export async function addToLibrary(flags) {
  const kind = String(flags.kind || "").trim();
  const name = String(flags.name || "").trim();
  const owner = String(flags.owner || "").trim();

  ensureKind(kind);
  if (!name) {
    throw new Error("library add requires --name");
  }
  if (!owner) {
    throw new Error("library add requires --owner");
  }

  const manifest = await loadManifest();
  const id = entryId(kind, name, flags.id);
  const tags = parseCsv(flags.tags);
  const content = await readContent(flags);
  const slug = id.includes(".") ? id.split(".").slice(1).join(".") : sanitizeSlug(name);
  const relativePath = path.join(KIND_DIRS[kind], `${slug}.md`).replaceAll("\\", "/");
  const absolutePath = ensureSafePath(relativePath);

  const existingIndex = manifest.entries.findIndex((x) => x.id === id);
  const existing = existingIndex >= 0 ? manifest.entries[existingIndex] : null;
  if (existing && !flags.force) {
    throw new Error(`entry '${id}' already exists; use --force to overwrite`);
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");

  const entry = {
    id,
    kind,
    name,
    path: relativePath,
    owner,
    tags
  };

  if (existing) {
    manifest.entries[existingIndex] = entry;
  } else {
    manifest.entries.push(entry);
  }
  sortEntries(manifest.entries);
  manifest.updatedAt = todayDate();

  await writeJson(manifestPath(), manifest);
  return {
    action: existing ? "updated" : "created",
    entry
  };
}

export async function removeFromLibrary(flags) {
  const id = String(flags.id || "").trim();
  if (!id) {
    throw new Error("library remove requires --id");
  }

  const manifest = await loadManifest();
  const index = manifest.entries.findIndex((x) => x.id === id);
  if (index < 0) {
    throw new Error(`entry '${id}' not found`);
  }

  const [entry] = manifest.entries.splice(index, 1);
  manifest.updatedAt = todayDate();
  sortEntries(manifest.entries);
  await writeJson(manifestPath(), manifest);

  const keepFile = Boolean(flags["keep-file"]);
  if (!keepFile) {
    await rm(ensureSafePath(entry.path), { force: true });
  }

  return {
    id,
    removed: true,
    fileRemoved: !keepFile
  };
}

export async function listLibrary(flags) {
  const manifest = await loadManifest();
  const kind = flags.kind ? String(flags.kind) : "";
  const owner = flags.owner ? String(flags.owner) : "";
  const tag = flags.tag ? String(flags.tag) : "";

  let entries = manifest.entries.slice();
  if (kind) {
    entries = entries.filter((x) => x.kind === kind);
  }
  if (owner) {
    entries = entries.filter((x) => x.owner === owner);
  }
  if (tag) {
    entries = entries.filter((x) => Array.isArray(x.tags) && x.tags.includes(tag));
  }

  return {
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    count: entries.length,
    entries
  };
}

export async function showLibraryEntry(flags) {
  const id = String(flags.id || "").trim();
  if (!id) {
    throw new Error("library show requires --id");
  }

  const manifest = await loadManifest();
  const entry = manifest.entries.find((x) => x.id === id);
  if (!entry) {
    throw new Error(`entry '${id}' not found`);
  }

  const content = await readFile(ensureSafePath(entry.path), "utf8");
  return {
    ...entry,
    content
  };
}

export { scaffoldLibraryEntry };
