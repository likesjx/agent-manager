#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST_PATH = path.resolve(process.cwd(), "library/manifests/team-library.json");

function fail(message) {
  process.stderr.write(`library-check: ${message}\n`);
  process.exit(1);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);

  if (!Array.isArray(manifest.entries)) {
    fail("manifest.entries must be an array");
  }

  const seen = new Set();
  const allowedKinds = new Set(["agent", "hook", "skill", "plugin", "prompt", "tool"]);

  for (const entry of manifest.entries) {
    if (!entry.id || typeof entry.id !== "string") {
      fail("entry.id is required");
    }
    if (seen.has(entry.id)) {
      fail(`duplicate entry id: ${entry.id}`);
    }
    seen.add(entry.id);

    if (!allowedKinds.has(entry.kind)) {
      fail(`invalid kind for ${entry.id}: ${entry.kind}`);
    }
    if (!entry.path || typeof entry.path !== "string") {
      fail(`entry.path is required for ${entry.id}`);
    }

    const abs = path.resolve(process.cwd(), entry.path);
    if (!(await exists(abs))) {
      fail(`entry.path not found for ${entry.id}: ${entry.path}`);
    }
  }

  process.stdout.write(
    `library-check: ok (${manifest.entries.length} entries validated)\n`
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
