---
description: Build, query, lint, and extract a SQLite-backed LLM Wiki from the current project.
---

# LLM Wiki Command

Use this command when the user types `/llm-wiki ...`, `llm-wiki ...`, or asks to operate an LLM Wiki from an agent session.

## Execution

Resolve the skill root in this order:

1. The current repository if it contains `scripts/llm-wiki.mjs`.
2. `~/.codex/skills/llm-wiki-build-skill`
3. `~/.claude/skills/llm-wiki-build-skill`
4. `~/.opencode/skills/llm-wiki-build-skill`

Then run:

```bash
node <skill-root>/scripts/llm-wiki.mjs $ARGUMENTS
```

## Common Usage

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki extract
/llm-wiki query "frontend design"
/llm-wiki graph
/llm-wiki lint
/llm-wiki status
/llm-wiki test
```

When no database path is supplied, the wrapper uses `./data/wiki.db` in the current project.
