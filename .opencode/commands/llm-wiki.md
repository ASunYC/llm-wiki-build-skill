---
description: Build, query, lint, and extract a SQLite-backed LLM Wiki from the current project.
agent: build
---

# /llm-wiki

Use this command to operate the LLM Wiki Build Skill from OpenCode.

Run from the user's current project directory:

```bash
node ~/.opencode/skills/llm-wiki-build-skill/scripts/llm-wiki.mjs $ARGUMENTS
```

If the skill is installed in another shared agent directory, locate `scripts/llm-wiki.mjs` and run it with the same arguments.

Examples:

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki query "agent"
/llm-wiki graph
/llm-wiki lint
```
