import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson, nowIso, makeId } from "../runtime/json-store.js";

function statePath() {
  return path.resolve(process.cwd(), ".agent-manager", "work-state.json");
}

function locksDir() {
  return path.resolve(process.cwd(), ".agent-manager", "locks");
}

function historyDir() {
  return path.resolve(process.cwd(), ".agent-manager", "history");
}

function lockFileName(targetPath) {
  return encodeURIComponent(targetPath).replace(/%/g, "_") + ".lock.json";
}

function splitList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function loadState() {
  const fallback = { version: 1, active_assignments: [], completed_assignments: [] };
  return readJson(statePath(), fallback);
}

async function saveState(state) {
  await writeJson(statePath(), state);
}

async function lockPaths(assignmentId, paths) {
  await mkdir(locksDir(), { recursive: true });
  const locked = [];
  const state = await loadState();

  for (const targetPath of paths) {
    const fileName = lockFileName(targetPath);
    const lockPath = path.join(locksDir(), fileName);
    const existing = await readJson(lockPath, null);
    if (existing && existing.assignment_id !== assignmentId) {
      const blocker = state.active_assignments.find((x) => x.assignment_id === existing.assignment_id);
      const blockerInfo = blocker
        ? ` Agent '${blocker.agent}' is working on '${blocker.title}' (${blocker.checkpoint}).`
        : "";
      const fix = ` Release with: node cli.js work release --assignment ${existing.assignment_id}`;
      throw new Error(`path '${targetPath}' is already locked by ${existing.assignment_id}.${blockerInfo}${fix}`);
    }

    const payload = {
      assignment_id: assignmentId,
      path: targetPath,
      locked_at: nowIso()
    };
    await writeJson(lockPath, payload);
    locked.push(lockPath);
  }

  return locked;
}

function queuePath() {
  return path.resolve(process.cwd(), "queue", "work-items.latest.json");
}

function detectRelevantPaths(item) {
  const source = String(item.source_system || "");
  if (source === "ado") {
    return ["intake/adapters/ado/adapter.js", "intake/index.js"];
  }
  if (source === "itrack") {
    return ["intake/adapters/itrack/adapter.js", "intake/index.js"];
  }
  return ["intake/index.js"];
}

async function unlockPaths(paths) {
  for (const targetPath of paths) {
    const fileName = lockFileName(targetPath);
    const lockPath = path.join(locksDir(), fileName);
    await rm(lockPath, { force: true });
  }
}

export async function assignWork(flags) {
  const workItemId = String(flags["work-item"] || "").trim();
  const agent = String(flags.agent || "").trim();
  const title = String(flags.title || workItemId || "untitled").trim();
  const lockTargets = splitList(flags.paths);

  if (!workItemId || !agent) {
    throw new Error("work assign requires --work-item and --agent");
  }

  const state = await loadState();
  const conflict = state.active_assignments.find(
    (x) => x.work_item_id === workItemId && x.agent !== agent
  );
  if (conflict) {
    throw new Error(`work item '${workItemId}' already assigned to ${conflict.agent}`);
  }

  const assignmentId = makeId("assign");
  await lockPaths(assignmentId, lockTargets);

  const now = nowIso();
  const assignment = {
    assignment_id: assignmentId,
    work_item_id: workItemId,
    title,
    agent,
    status: "active",
    checkpoint: "assigned",
    checkpoint_notes: "",
    paths_locked: lockTargets,
    started_at: now,
    updated_at: now,
    completed_at: null
  };

  state.active_assignments.push(assignment);
  await saveState(state);

  return { assignment_id: assignmentId, status: assignment.status, paths_locked: lockTargets };
}

export async function assignWorkFromQueue(flags) {
  const agent = String(flags.agent || "").trim();
  if (!agent) {
    throw new Error("work assign --from-queue requires --agent");
  }

  const queue = await readJson(queuePath(), null);
  const items = Array.isArray(queue?.items) ? queue.items : [];
  if (items.length === 0) {
    throw new Error("no work items in queue; run node cli.js intake sync first");
  }

  const state = await loadState();
  const assigned = new Set(state.active_assignments.map((x) => x.work_item_id));

  const priorityFilter = flags.priority ? String(flags.priority).trim() : "";
  const labelFilter = splitList(flags.labels);

  const candidate = items.find((item) => {
    const itemId = String(item.source_id || "");
    if (!itemId || assigned.has(itemId)) {
      return false;
    }
    if (priorityFilter && String(item.priority || "") !== priorityFilter) {
      return false;
    }
    if (labelFilter.length > 0) {
      const labels = Array.isArray(item.labels) ? item.labels.map((x) => String(x)) : [];
      if (!labelFilter.some((label) => labels.includes(label))) {
        return false;
      }
    }
    return true;
  });

  if (!candidate) {
    throw new Error("no matching unassigned work items in queue");
  }

  const mergedFlags = {
    ...flags,
    "work-item": String(candidate.source_id),
    title: String(candidate.title || candidate.source_id),
    paths: (flags.paths && String(flags.paths).trim()) || detectRelevantPaths(candidate).join(",")
  };
  return assignWork(mergedFlags);
}

export async function checkpointWork(flags) {
  const assignmentId = String(flags.assignment || "").trim();
  const label = String(flags.label || "checkpoint").trim();
  const note = String(flags.note || "").trim();
  if (!assignmentId) {
    throw new Error("work checkpoint requires --assignment");
  }

  const state = await loadState();
  const assignment = state.active_assignments.find((x) => x.assignment_id === assignmentId);
  if (!assignment) {
    throw new Error(`assignment not found: ${assignmentId}`);
  }

  assignment.checkpoint = label;
  assignment.checkpoint_notes = note;
  assignment.updated_at = nowIso();
  await saveState(state);

  return { assignment_id: assignmentId, checkpoint: label, updated_at: assignment.updated_at };
}

export async function completeWork(flags) {
  const assignmentId = String(flags.assignment || "").trim();
  const result = String(flags.result || "completed").trim();
  if (!assignmentId) {
    throw new Error("work complete requires --assignment");
  }

  const state = await loadState();
  const index = state.active_assignments.findIndex((x) => x.assignment_id === assignmentId);
  if (index < 0) {
    throw new Error(`assignment not found: ${assignmentId}`);
  }

  const assignment = state.active_assignments[index];
  assignment.status = "completed";
  assignment.result = result;
  assignment.completed_at = nowIso();
  assignment.updated_at = assignment.completed_at;

  await unlockPaths(assignment.paths_locked || []);
  state.active_assignments.splice(index, 1);
  state.completed_assignments.push(assignment);
  await saveState(state);

  await mkdir(historyDir(), { recursive: true });
  await writeJson(path.join(historyDir(), `${assignmentId}.json`), assignment);

  return { assignment_id: assignmentId, status: assignment.status, completed_at: assignment.completed_at };
}

export async function releaseWork(flags) {
  const assignmentId = String(flags.assignment || "").trim();
  const reason = String(flags.reason || "released").trim();
  if (!assignmentId) {
    throw new Error("work release requires --assignment");
  }

  const state = await loadState();
  const index = state.active_assignments.findIndex((x) => x.assignment_id === assignmentId);
  if (index < 0) {
    throw new Error(`assignment not found: ${assignmentId}`);
  }

  const assignment = state.active_assignments[index];
  assignment.status = "released";
  assignment.result = reason;
  assignment.completed_at = nowIso();
  assignment.updated_at = assignment.completed_at;

  await unlockPaths(assignment.paths_locked || []);
  state.active_assignments.splice(index, 1);
  state.completed_assignments.push(assignment);
  await saveState(state);

  await mkdir(historyDir(), { recursive: true });
  await writeJson(path.join(historyDir(), `${assignmentId}.json`), assignment);

  return { assignment_id: assignmentId, status: assignment.status, released_at: assignment.completed_at };
}

export async function statusWork() {
  return loadState();
}
