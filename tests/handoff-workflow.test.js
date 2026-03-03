import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHandoff, listHandoffs, resumeHandoff, validateHandoffFile } from "../handoffs/index.js";

async function withTempCwd(fn) {
  const prev = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-manager-handoff-"));
  process.chdir(dir);
  try {
    await fn(dir);
  } finally {
    process.chdir(prev);
  }
}

test("handoff lifecycle: start -> validate -> resume", async () => {
  await withTempCwd(async () => {
    await mkdir("handoffs", { recursive: true });

    const created = await createHandoff({
      from: "codex",
      to: "architect",
      "work-item": "W-123",
      title: "Improve handoff protocol",
      goal: "Ship resilient handoff",
      "context-summary": "Implemented capture and validation",
      decisions: "json-schema,structured-checkpoint",
      risks: "missing-env,partial-rollout",
      "open-loops": "add-more-tests",
      "next-commands": "npm run validate,node cli.js workflow check",
      "files-touched": "cli.js,handoffs/index.js",
      notes: "ready for review",
      checkpoint: "post-implementation"
    });

    await stat(created.file);

    const validated = await validateHandoffFile(created.file);
    assert.equal(validated.ok, true);
    assert.equal(validated.status, "validated");

    const resumed = await resumeHandoff(created.file, "architect", "starting review");
    assert.equal(resumed.status, "resumed");

    const payload = JSON.parse(await readFile(created.file, "utf8"));
    assert.equal(payload.status, "resumed");
    assert.equal(payload.resume.resumed_by, "architect");
  });
});

test("handoff list filters by receiver and status", async () => {
  await withTempCwd(async () => {
    await mkdir("handoffs", { recursive: true });

    const one = await createHandoff({
      from: "codex",
      to: "architect",
      "work-item": "W-200",
      title: "One",
      goal: "Goal one",
      "context-summary": "Context one",
      decisions: "d1",
      risks: "r1",
      "open-loops": "o1",
      "next-commands": "npm run validate",
      "files-touched": "cli.js",
      notes: "n1"
    });
    await validateHandoffFile(one.file);

    await createHandoff({
      from: "codex",
      to: "qa",
      "work-item": "W-201",
      title: "Two",
      goal: "Goal two",
      "context-summary": "Context two",
      decisions: "d2",
      risks: "r2",
      "open-loops": "o2",
      "next-commands": "npm test",
      "files-touched": "README.md",
      notes: "n2"
    });

    const filtered = await listHandoffs({ toAgent: "architect", status: "validated" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].work_item.id, "W-200");
  });
});

test("handoff context compression keeps sentence boundaries when possible", async () => {
  await withTempCwd(async () => {
    await mkdir("handoffs", { recursive: true });

    const longSummary = `${"A".repeat(1150)}. ${"B".repeat(100)}`;
    const created = await createHandoff({
      from: "codex",
      to: "architect",
      "work-item": "W-300",
      title: "Compression",
      goal: "Preserve context",
      "context-summary": longSummary,
      decisions: "d1",
      risks: "r1",
      "open-loops": "o1",
      "next-commands": "npm run validate",
      "files-touched": "handoffs/index.js",
      notes: "n1"
    });

    const payload = JSON.parse(await readFile(created.file, "utf8"));
    assert.equal(payload.context.compression.strategy, "sentence-boundary");
    assert.ok(payload.context.summary.endsWith("."));
    assert.ok(payload.context.compression.stored_chars < payload.context.compression.source_chars);
  });
});
