---
name: llm-wiki-build-skill
description: Build a reusable SQLite-backed LLM Wiki knowledge base and knowledge graph from Markdown, README, SKILL.md, or text sources. Use when a project needs scripts to initialize a wiki database, ingest documents, chunk content, derive entities/topics/relations, query knowledge, and export a graph without building a full platform backend.
---

# LLM Wiki Build Skill

Use this skill to add a lightweight LLM Wiki knowledge base to any project.

## Workflow

1. Install the runtime dependency in the target project:

```bash
npm install better-sqlite3
```

2. Initialize a database:

```bash
node path/to/llm-wiki-build-skill/scripts/init-wiki.mjs ./data/wiki.db --name "Project Wiki"
```

3. Ingest Markdown, README, SKILL.md, or text files:

```bash
node path/to/llm-wiki-build-skill/scripts/ingest-docs.mjs ./data/wiki.db ./docs ./README.md
```

4. Build the knowledge graph:

```bash
node path/to/llm-wiki-build-skill/scripts/build-graph.mjs ./data/wiki.db --out ./data/wiki-graph.json
```

5. Query the wiki:

```bash
node path/to/llm-wiki-build-skill/scripts/query-wiki.mjs ./data/wiki.db "frontend design"
```

## Notes

- Storage is SQLite. See `references/schema.md` for table and index details.
- Ingestion chunks Markdown by heading structure first, then falls back to overlapping character chunks for long sections.
- Graph relations are deterministic by default: wiki links, shared tags, source overlap, and inferred text signals.
- If a target project adds an OpenAI-compatible LLM step, write LLM extracted relations into the `relations` table with `relation_type = "llm_relation"`.
