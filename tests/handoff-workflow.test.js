import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHandoff, resumeHandoff, validateHandoffFile } from "../handoffs/index.js";

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
