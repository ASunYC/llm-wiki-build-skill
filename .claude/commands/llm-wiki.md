---
description: Build, query, lint, and extract a SQLite-backed LLM Wiki from the current project.
argument-hint: "<command> [args]"
---

# /llm-wiki

Run the LLM Wiki Build Skill command wrapper from the current project directory.

Use `$ARGUMENTS` as the command arguments. Prefer this command form:

```bash
node ~/.claude/skills/llm-wiki-build-skill/scripts/llm-wiki.mjs $ARGUMENTS
```

If the skill is installed somewhere else, locate the repository that contains `scripts/llm-wiki.mjs` and run that file instead.

Examples:

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki extract
/llm-wiki query "frontend design"
/llm-wiki graph
/llm-wiki lint
/llm-wiki status
```
