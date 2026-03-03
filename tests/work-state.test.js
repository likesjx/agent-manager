import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assignWork, assignWorkFromQueue, checkpointWork, completeWork, statusWork } from "../state/work-state.js";

async function withTempCwd(fn) {
  const prev = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-manager-work-"));
  process.chdir(dir);
  try {
    await fn(dir);
  } finally {
    process.chdir(prev);
  }
}

test("work assignment locks paths and blocks conflicting assignment", async () => {
  await withTempCwd(async () => {
    await mkdir(".agent-manager", { recursive: true });

    const assignment = await assignWork({
      "work-item": "W-201",
      title: "Add work locks",
      agent: "codex",
      paths: "cli.js,state/work-state.js"
    });

    await assert.rejects(
      () =>
        assignWork({
          "work-item": "W-202",
          title: "Conflicting edit",
          agent: "architect",
          paths: "cli.js"
        }),
      /Release with: node cli.js work release --assignment/
    );

    const checkpoint = await checkpointWork({
      assignment: assignment.assignment_id,
      label: "midpoint",
      note: "lock check passed"
    });
    assert.equal(checkpoint.checkpoint, "midpoint");

    const completed = await completeWork({
      assignment: assignment.assignment_id,
      result: "all done"
    });
    assert.equal(completed.status, "completed");

    const state = await statusWork();
    assert.equal(state.active_assignments.length, 0);
    assert.equal(state.completed_assignments.length, 1);

    let locks = [];
    try {
      locks = await readdir(path.join(process.cwd(), ".agent-manager", "locks"));
    } catch {
      locks = [];
    }
    assert.equal(locks.length, 0);

    const historyPath = path.join(process.cwd(), ".agent-manager", "history", `${assignment.assignment_id}.json`);
    const history = JSON.parse(await readFile(historyPath, "utf8"));
    assert.equal(history.result, "all done");
  });
});

test("assign from queue picks unassigned item and sets defaults", async () => {
  await withTempCwd(async () => {
    await mkdir("queue", { recursive: true });
    await writeFile(
      "queue/work-items.latest.json",
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          count: 2,
          items: [
            {
              source_system: "ado",
              source_id: "A-1",
              title: "First item",
              priority: "1",
              labels: ["backend"]
            },
            {
              source_system: "itrack",
              source_id: "I-2",
              title: "Second item",
              priority: "3",
              labels: ["frontend"]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const assigned = await assignWorkFromQueue({ agent: "codex", priority: "1" });
    assert.equal(assigned.status, "active");

    const state = await statusWork();
    assert.equal(state.active_assignments.length, 1);
    assert.equal(state.active_assignments[0].work_item_id, "A-1");
    assert.equal(state.active_assignments[0].paths_locked.includes("intake/adapters/ado/adapter.js"), true);
  });
});
