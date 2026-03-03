import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson, nowIso, makeId } from "../runtime/json-store.js";

function handoffDir() {
  return path.resolve(process.cwd(), "handoffs");
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

function summarizeContext(rawSummary) {
  const summary = (rawSummary || "").trim();
  const sourceChars = summary.length;
  const maxChars = 1200;
  if (sourceChars <= maxChars) {
    return {
      summary,
      compression: {
        strategy: "none",
        source_chars: sourceChars,
        stored_chars: sourceChars
      }
    };
  }

  const prefix = summary.slice(0, maxChars);
  const sentenceBreak = Math.max(prefix.lastIndexOf(". "), prefix.lastIndexOf(".\n"));
  const cutoff = sentenceBreak > Math.floor(maxChars * 0.7) ? sentenceBreak + 1 : maxChars;
  const stored = summary.slice(0, cutoff).trim();

  return {
    summary: stored,
    compression: {
      strategy: cutoff < maxChars ? "sentence-boundary" : "truncate-1200",
      source_chars: sourceChars,
      stored_chars: stored.length
    }
  };
}

export function validateHandoffShape(payload) {
  const issues = [];
  const requiredString = ["handoff_id", "goal", "from_agent", "to_agent", "status", "created_at", "updated_at"];
  for (const key of requiredString) {
    if (!payload?.[key] || typeof payload[key] !== "string") {
      issues.push(`missing or invalid '${key}'`);
    }
  }

  if (!payload?.protocol?.delivery || !payload?.protocol?.mode) {
    issues.push("missing protocol.delivery or protocol.mode");
  }
  if (!payload?.work_item?.id || !payload?.work_item?.title || !payload?.work_item?.source) {
    issues.push("missing work_item.id, work_item.title, or work_item.source");
  }
  if (!payload?.context?.summary) {
    issues.push("missing context.summary");
  }
  if (!payload?.checkpoint?.label || !payload?.checkpoint?.notes || !payload?.checkpoint?.captured_at) {
    issues.push("missing checkpoint fields");
  }

  const requiredLists = ["decisions", "risks", "open_loops", "next_commands", "files_touched"];
  for (const key of requiredLists) {
    if (!Array.isArray(payload?.[key]) || payload[key].length === 0) {
      issues.push(`'${key}' must be a non-empty array`);
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function handoffFilePath(handoffId) {
  return path.join(handoffDir(), `${handoffId}.json`);
}

export async function createHandoff(flags) {
  const handoffId = makeId("handoff");
  const createdAt = nowIso();
  const context = summarizeContext(flags["context-summary"] || "");

  const payload = {
    handoff_id: handoffId,
    goal: String(flags.goal || "").trim(),
    from_agent: String(flags.from || "").trim(),
    to_agent: String(flags.to || "").trim(),
    status: "captured",
    protocol: {
      delivery: flags.delivery === "pull" ? "pull" : "push",
      mode: flags.mode === "sync" ? "sync" : "async"
    },
    work_item: {
      id: String(flags["work-item"] || "").trim(),
      title: String(flags.title || "").trim(),
      source: String(flags.source || "local").trim()
    },
    context,
    decisions: splitList(flags.decisions),
    risks: splitList(flags.risks),
    open_loops: splitList(flags["open-loops"]),
    next_commands: splitList(flags["next-commands"]),
    files_touched: splitList(flags["files-touched"]),
    checkpoint: {
      label: String(flags.checkpoint || "session-state").trim(),
      notes: String(flags.notes || "").trim(),
      captured_at: createdAt
    },
    created_at: createdAt,
    updated_at: createdAt
  };

  const validation = validateHandoffShape(payload);
  if (!validation.ok) {
    throw new Error(`handoff start validation failed: ${validation.issues.join("; ")}`);
  }

  const outputPath = handoffFilePath(handoffId);
  await writeJson(outputPath, payload);
  return { handoffId, file: outputPath, status: payload.status };
}

export async function readHandoff(file) {
  const payload = await readJson(path.resolve(process.cwd(), file), null);
  if (!payload) {
    throw new Error(`handoff file not found or unreadable: ${file}`);
  }
  return payload;
}

export async function validateHandoffFile(file) {
  const absolute = path.resolve(process.cwd(), file);
  const payload = await readJson(absolute, null);
  if (!payload) {
    return { ok: false, file: absolute, issues: ["file not found or invalid json"] };
  }
  const result = validateHandoffShape(payload);
  if (result.ok && payload.status === "captured") {
    payload.status = "validated";
    payload.updated_at = nowIso();
    await writeJson(absolute, payload);
  }
  return { ...result, file: absolute, status: payload.status };
}

export async function resumeHandoff(file, resumedBy, resumeNotes = "") {
  const absolute = path.resolve(process.cwd(), file);
  const payload = await readJson(absolute, null);
  if (!payload) {
    throw new Error(`handoff file not found or unreadable: ${file}`);
  }

  const result = validateHandoffShape(payload);
  if (!result.ok) {
    throw new Error(`cannot resume invalid handoff: ${result.issues.join("; ")}`);
  }

  payload.status = "resumed";
  payload.resume = {
    resumed_by: resumedBy,
    resumed_at: nowIso(),
    resume_notes: resumeNotes
  };
  payload.updated_at = payload.resume.resumed_at;
  await writeJson(absolute, payload);

  return {
    file: absolute,
    handoffId: payload.handoff_id,
    status: payload.status,
    resumedBy
  };
}

export async function rollbackHandoff(file, rolledBackBy, rollbackReason = "") {
  const absolute = path.resolve(process.cwd(), file);
  const payload = await readJson(absolute, null);
  if (!payload) {
    throw new Error(`handoff file not found or unreadable: ${file}`);
  }

  payload.status = "rolled_back";
  payload.rollback = {
    rolled_back_by: rolledBackBy,
    rolled_back_at: nowIso(),
    rollback_reason: rollbackReason
  };
  payload.updated_at = payload.rollback.rolled_back_at;
  await writeJson(absolute, payload);

  return {
    file: absolute,
    handoffId: payload.handoff_id,
    status: payload.status,
    rolledBackBy
  };
}

export async function listHandoffs(filters = {}) {
  const dir = handoffDir();
  let files = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const rows = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const payload = await readJson(path.join(dir, file), null);
    if (!payload) {
      continue;
    }

    if (filters.toAgent && payload.to_agent !== filters.toAgent) {
      continue;
    }
    if (filters.status && payload.status !== filters.status) {
      continue;
    }
    if (filters.workItem && payload.work_item?.id !== filters.workItem) {
      continue;
    }

    rows.push({
      handoff_id: payload.handoff_id,
      from_agent: payload.from_agent,
      to_agent: payload.to_agent,
      status: payload.status,
      work_item: payload.work_item,
      created_at: payload.created_at,
      updated_at: payload.updated_at,
      file: path.join(dir, file)
    });
  }

  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
