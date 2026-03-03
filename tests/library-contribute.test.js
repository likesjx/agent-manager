import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addToLibrary, listLibrary, removeFromLibrary, scaffoldLibraryEntry, showLibraryEntry } from "../library/contribute.js";

async function withTempWorkspace(fn) {
  const prev = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-manager-library-"));
  process.chdir(dir);
  try {
    await mkdir("library/manifests", { recursive: true });
    await mkdir("library/skills", { recursive: true });
    await writeFile(
      "library/manifests/team-library.json",
      `${JSON.stringify({ version: "1.0.0", updatedAt: "2026-03-03", entries: [] }, null, 2)}\n`,
      "utf8"
    );
    await fn(dir);
  } finally {
    process.chdir(prev);
  }
}

test("library add/list/show/remove lifecycle", async () => {
  await withTempWorkspace(async () => {
    const created = await addToLibrary({
      kind: "skill",
      name: "Retry Pattern",
      owner: "codex",
      tags: "resilience,http",
      content: "# Retry Pattern\n\nUse exponential backoff."
    });
    assert.equal(created.action, "created");
    assert.equal(created.entry.id, "skill.retry-pattern");

    const listed = await listLibrary({ kind: "skill", owner: "codex" });
    assert.equal(listed.count, 1);

    const shown = await showLibraryEntry({ id: "skill.retry-pattern" });
    assert.match(shown.content, /Retry Pattern/);

    const removed = await removeFromLibrary({ id: "skill.retry-pattern" });
    assert.equal(removed.removed, true);

    const listedAfter = await listLibrary({});
    assert.equal(listedAfter.count, 0);
  });
});

test("library scaffold emits template content", async () => {
  const scaffold = scaffoldLibraryEntry({ kind: "skill", name: "Circuit Breaker", purpose: "Prevent cascading failure" });
  assert.equal(scaffold.kind, "skill");
  assert.match(scaffold.content, /Circuit Breaker/);
  assert.match(scaffold.content, /Prevent cascading failure/);
});
