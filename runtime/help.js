export function generateHelp(topic = "") {
  const t = String(topic || "").trim();

  if (!t) {
    return {
      usage: "agent-manager <command> [options]",
      commands: {
        intake: "Sync work items from external systems",
        library: "Manage shared team library entries",
        handoff: "Create and manage agent handoffs",
        work: "Assign and track work items",
        provider: "Render/install provider bundles",
        workflow: "Validate workflow definitions",
        agent: "Register and track active agents",
        describe: "Introspect capabilities, commands, and workflows"
      },
      examples: [
        "agent-manager describe system",
        "agent-manager library list --kind skill",
        "agent-manager agent register --id codex-1 --provider claude-code",
        "agent-manager handoff start --from codex --to architect --work-item W-101 ..."
      ]
    };
  }

  const topics = {
    library: {
      operations: ["check", "add", "remove", "list", "show", "scaffold"],
      example: "agent-manager library add --kind skill --name 'Retry Pattern' --owner codex --content '# Retry Pattern'"
    },
    agent: {
      operations: ["register", "heartbeat", "list", "onboard"],
      example: "agent-manager agent onboard --id codex-1 --provider claude-code --capabilities nodejs,workflow"
    },
    describe: {
      operations: ["system", "commands", "workflows", "config"],
      example: "agent-manager describe commands"
    }
  };

  if (!topics[t]) {
    return { error: `No help available for '${t}'` };
  }
  return topics[t];
}
