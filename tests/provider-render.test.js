import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installProviderBundle, renderProviderBundle } from "../providers/index.js";

async function withTempCwd(fn) {
  const prev = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-manager-provider-"));
  process.chdir(dir);
  try {
    await fn(dir);
  } finally {
    process.chdir(prev);
  }
}

test("provider render outputs claude bundle from manifest", async () => {
  await withTempCwd(async () => {
    await mkdir("library/manifests", { recursive: true });
    await mkdir("library/skills", { recursive: true });

    await writeFile("library/skills/context.md", "# Context Skill\n\nStay sharp.\n", "utf8");
    await writeFile(
      "library/manifests/team-library.json",
      `${JSON.stringify(
        {
          version: "1.0.0",
          updatedAt: "2026-03-02",
          entries: [
            {
              id: "skill.context",
              kind: "skill",
              name: "Context",
              path: "library/skills/context.md",
              owner: "platform",
              tags: ["context"]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await renderProviderBundle({ provider: "claude-code", "output-dir": ".output/claude" });
    assert.equal(result.provider, "claude-code");

    const instructions = await readFile(path.join(process.cwd(), ".output/claude/system_instructions.md"), "utf8");
    assert.match(instructions, /Agent Manager Bundle \(Claude Code\)/);
    assert.match(instructions, /Context Skill/);
  });
});

test("provider install copies bundle into .claud_project", async () => {
  await withTempCwd(async () => {
    await mkdir("library/manifests", { recursive: true });
    await mkdir("library/skills", { recursive: true });

    await writeFile("library/skills/context.md", "# Context Skill\n\nStay sharp.\n", "utf8");
    await writeFile(
      "library/manifests/team-library.json",
      `${JSON.stringify(
        {
          version: "1.0.0",
          updatedAt: "2026-03-02",
          entries: [
            {
              id: "skill.context",
              kind: "skill",
              name: "Context",
              path: "library/skills/context.md",
              owner: "platform",
              tags: ["context"]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await installProviderBundle({ provider: "claude-code" });
    assert.equal(result.installed, true);

    const installed = await readFile(path.join(process.cwd(), ".claud_project/system_instructions.md"), "utf8");
    assert.match(installed, /Agent Manager Bundle \(Claude Code\)/);
  });
});
