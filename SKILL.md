---
name: llm-wiki-build-skill
description: Build a reusable SQLite-backed LLM Wiki knowledge base and knowledge graph from Markdown, README, SKILL.md, or text sources. Use when a project needs scripts to initialize a wiki database, ingest documents, chunk content with evidence locations, extract entities/topics/relations with an OpenAI-compatible LLM, query knowledge, lint quality, reingest sources, and export a graph without building a full platform backend.
---

# LLM Wiki Build Skill

Use this skill to add a complete portable LLM Wiki knowledge base to any project.

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

5. Optional: configure LLM extraction with environment variables:

```bash
export LLM_API_BASE="https://api.openai.com/v1"
export LLM_API_KEY="your-key"
export LLM_MODEL="gpt-4.1-mini"
```

Then test and extract:

```bash
node path/to/llm-wiki-build-skill/scripts/test-llm.mjs
node path/to/llm-wiki-build-skill/scripts/extract-llm.mjs ./data/wiki.db --depth standard
```

6. Query, lint, and reingest:

```bash
node path/to/llm-wiki-build-skill/scripts/query-wiki.mjs ./data/wiki.db "frontend design"
node path/to/llm-wiki-build-skill/scripts/lint-wiki.mjs ./data/wiki.db
node path/to/llm-wiki-build-skill/scripts/reingest.mjs ./data/wiki.db ./docs --extract
```

## Notes

- Storage is SQLite. See `references/schema.md` for table and index details.
- Ingestion chunks Markdown by heading structure first, then falls back to overlapping character chunks for long sections.
- API keys are read only from environment variables and are never written into SQLite.
- Graph relations combine deterministic edges (`wikilink`, `shared_tag`, `source_overlap`) and LLM edges (`llm_relation`).
- LLM extraction writes `entities`, `topics`, `relations`, and `synthesis` pages with source evidence locations.
