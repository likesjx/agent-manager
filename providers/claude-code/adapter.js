import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { byKind, loadCatalog } from "../shared/catalog.js";

function section(title, items, formatter) {
  if (!items.length) {
    return `## ${title}\n\n- none\n`;
  }
  const body = items.map(formatter).join("\n\n");
  return `## ${title}\n\n${body}\n`;
}

function formatEntry(entry) {
  return `### ${entry.name}\nID: ${entry.id}\n\n${entry.content.trim()}`;
}

export async function renderClaudeBundle(options = {}) {
  const outputDir = path.resolve(process.cwd(), options.outputDir || ".agent-manager/providers/claude-code");
  const catalog = await loadCatalog();

  const agents = byKind(catalog.entries, "agent");
  const hooks = byKind(catalog.entries, "hook");
  const skills = byKind(catalog.entries, "skill");
  const prompts = byKind(catalog.entries, "prompt");
  const plugins = byKind(catalog.entries, "plugin");
  const tools = byKind(catalog.entries, "tool");

  const systemInstructions = [
    "# Agent Manager Bundle (Claude Code)",
    "",
    `Catalog version: ${catalog.version} (updated ${catalog.updatedAt})`,
    "",
    section("Agents", agents, formatEntry),
    section("Hooks", hooks, formatEntry),
    section("Skills", skills, formatEntry),
    section("Prompts", prompts, formatEntry),
    section("Plugins", plugins, formatEntry),
    section("Tools", tools, formatEntry)
  ].join("\n");

  const metadata = {
    provider: "claude-code",
    generatedAt: new Date().toISOString(),
    output_files: ["system_instructions.md", "bundle-metadata.json"],
    catalog_version: catalog.version,
    entries: catalog.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      path: entry.absolutePath
    }))
  };

  await mkdir(outputDir, { recursive: true });
  const instructionsPath = path.join(outputDir, "system_instructions.md");
  const metadataPath = path.join(outputDir, "bundle-metadata.json");

  await writeFile(instructionsPath, `${systemInstructions}\n`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    provider: "claude-code",
    outputDir,
    files: [instructionsPath, metadataPath],
    entryCount: catalog.entries.length
  };
}
