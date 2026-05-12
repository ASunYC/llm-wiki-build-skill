---
description: Build, query, lint, and extract a SQLite-backed LLM Wiki from the current project.
---

# /llm-wiki

Use this command to operate the LLM Wiki Build Skill from Codex.

Run from the user's current project directory:

```bash
node ~/.codex/skills/llm-wiki-build-skill/scripts/llm-wiki.mjs $ARGUMENTS
```

If the skill is installed under another agent directory, use that path instead:

```bash
node ~/.claude/skills/llm-wiki-build-skill/scripts/llm-wiki.mjs $ARGUMENTS
node ~/.opencode/skills/llm-wiki-build-skill/scripts/llm-wiki.mjs $ARGUMENTS
```

Supported commands: `init`, `ingest`, `extract`, `query`, `graph`, `lint`, `reingest`, `status`, `test`.
