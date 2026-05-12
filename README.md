# LLM Wiki Build Skill

> A reusable Codex/Claude-style skill for building SQLite-backed LLM Wiki knowledge bases and knowledge graphs from Markdown, README, SKILL.md, and text files.

<div align="center">

<img alt="Node.js 22+" src="https://img.shields.io/badge/node.js-22+-green.svg"> <img alt="SQLite" src="https://img.shields.io/badge/storage-SQLite-blue.svg"> <img alt="better-sqlite3" src="https://img.shields.io/badge/driver-better--sqlite3-lightgrey.svg"> <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg">

**Author**: [ASunYC](https://github.com/ASunYC)

</div>

---

## Project Overview

`llm-wiki-build-skill` extracts the core idea of an LLM Wiki into a portable skill project. It lets any repository quickly create a local knowledge base, import documentation, split content into searchable chunks with evidence locations, extract entities/topics/relations with an OpenAI-compatible LLM, lint quality, reingest sources, and export graph JSON for UI or agent workflows.

The project is designed for two modes:

- **Fallback wiki mode**: no LLM credentials required. It builds sources, pages, chunks, FTS search, deterministic graph edges, and graph communities.
- **LLM-enhanced mode**: set environment variables and run extraction. It adds entities, topics, semantic/document relations, contradictions, and synthesis pages with source evidence.

It supports projects like `skills-book`, where public skill repositories are transformed into `skills.db` and exported into a Skills Shop interface.

---

## What It Builds

The generated wiki database can store:

- `sources`: imported files, URLs, or documents.
- `pages`: normalized wiki pages, including `source`, `entity`, `topic`, `synthesis`, and `query` pages.
- `chunks`: searchable text chunks with line and character offsets.
- `entities`: LLM-extracted people, tools, frameworks, projects, concepts, or patterns.
- `topics`: reusable topic labels and definitions.
- `relations`: deterministic and LLM-extracted graph edges.
- `analysis_configs`: analysis behavior such as depth and merge policy.
- `llm_runs`: audit records for LLM extraction runs.
- `skills`, `repositories`, `authors`, `locations`: optional marketplace-style metadata.

Graph output includes:

- `nodes`
- `edges`
- `communities`
- `insights`
- `statistics`

---

## Installation

Clone the repository:

```bash
git clone https://github.com/ASunYC/llm-wiki-build-skill.git
cd llm-wiki-build-skill
npm install
```

Or install the runtime dependency in a target project:

```bash
npm install better-sqlite3
```

---

## Quick Start

Use the unified command wrapper in an agent session:

```bash
node scripts/llm-wiki.mjs init
node scripts/llm-wiki.mjs ingest
node scripts/llm-wiki.mjs query "frontend design"
node scripts/llm-wiki.mjs graph
node scripts/llm-wiki.mjs lint
```

When installed as an Agent command, the same workflow becomes:

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki extract
/llm-wiki query "frontend design"
/llm-wiki graph
/llm-wiki lint
```

The wrapper defaults to `./data/wiki.db` and imports `README.md`, `docs`, and `SKILL.md` when present.

Initialize a wiki database:

```bash
node scripts/init-wiki.mjs ./data/wiki.db --name "Project Wiki"
```

Import documents:

```bash
node scripts/ingest-docs.mjs ./data/wiki.db ./README.md ./docs
```

Query the wiki:

```bash
node scripts/query-wiki.mjs ./data/wiki.db "frontend design"
```

Build a graph:

```bash
node scripts/build-graph.mjs ./data/wiki.db --out ./data/wiki-graph.json
```

Lint the wiki:

```bash
node scripts/lint-wiki.mjs ./data/wiki.db
```

---

## LLM Extraction

The API key design is intentionally simple and safe:

- `LLM_API_BASE`: OpenAI-compatible endpoint, for example `https://api.openai.com/v1`.
- `LLM_API_KEY`: API key. It is read from the environment only and is never written to SQLite.
- `LLM_MODEL`: model name.
- `LLM_TIMEOUT_MS`: optional request timeout, default `180000`.

Example:

```bash
export LLM_API_BASE=https://api.openai.com/v1
export LLM_API_KEY=your-key
export LLM_MODEL=gpt-4.1-mini
```

Check masked config:

```bash
node scripts/llm-status.mjs
```

Test the connection:

```bash
node scripts/test-llm.mjs
```

Run extraction:

```bash
node scripts/extract-llm.mjs ./data/wiki.db --depth standard
```

Supported depth values:

- `fast`: larger chunks, fewer extracted items.
- `standard`: balanced default.
- `deep`: smaller chunks, more extracted items.

LLM extraction writes:

- entities into `entities`
- topics into `topics`
- semantic and document relations into `relations(relation_type = "llm_relation")`
- source summaries and contradictions into `pages(page_type = "synthesis")`
- evidence locations into `relations.evidence_details`

---

## Commands

### Agent Slash Command

This repository includes command definitions for mainstream agent tools:

```text
commands/llm-wiki.md
.claude/commands/llm-wiki.md
.codex/commands/llm-wiki.md
.opencode/commands/llm-wiki.md
```

Install the matching command file into your agent command directory, then use:

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki extract
/llm-wiki query "agent memory"
/llm-wiki graph
/llm-wiki lint
/llm-wiki status
/llm-wiki test
```

The command calls `scripts/llm-wiki.mjs`, which delegates to the underlying scripts below.

| Command | Example | Description |
| --- | --- | --- |
| `init-wiki` | `node scripts/init-wiki.mjs ./data/wiki.db --name "Project Wiki"` | Create SQLite tables and indexes. |
| `ingest-docs` | `node scripts/ingest-docs.mjs ./data/wiki.db ./README.md ./docs` | Import Markdown/TXT files into sources, pages, chunks, and FTS. |
| `llm-status` | `node scripts/llm-status.mjs` | Show masked LLM configuration loaded from environment variables. |
| `test-llm` | `node scripts/test-llm.mjs` | Test the OpenAI-compatible LLM connection. |
| `extract-llm` | `node scripts/extract-llm.mjs ./data/wiki.db --depth standard` | Extract entities, topics, relations, contradictions, and synthesis pages. |
| `build-graph` | `node scripts/build-graph.mjs ./data/wiki.db --out ./data/wiki-graph.json` | Export deterministic + LLM-enhanced graph JSON. |
| `query-wiki` | `node scripts/query-wiki.mjs ./data/wiki.db "agent"` | Search FTS chunks, pages, entities, and topics. |
| `lint-wiki` | `node scripts/lint-wiki.mjs ./data/wiki.db` | Check pages, chunks, graph edges, and evidence coverage. |
| `reingest` | `node scripts/reingest.mjs ./data/wiki.db ./docs --extract` | Reimport source files and optionally rerun LLM extraction. |

---

## Use It From Another Project

You can keep this repository outside your target project and call scripts by path:

```bash
node ../llm-wiki-build-skill/scripts/init-wiki.mjs ./data/wiki.db --name "My App Wiki"
node ../llm-wiki-build-skill/scripts/ingest-docs.mjs ./data/wiki.db ./README.md ./docs
node ../llm-wiki-build-skill/scripts/extract-llm.mjs ./data/wiki.db --depth standard
node ../llm-wiki-build-skill/scripts/build-graph.mjs ./data/wiki.db --out ./public/wiki-graph.json
```

Recommended target project layout:

```text
my-project/
|-- data/
|   |-- wiki.db
|   `-- wiki-graph.json
|-- docs/
|-- README.md
`-- package.json
```

---

## LLM Wiki Model

### Page Types

- `source`: imported source documents.
- `entity`: entity pages, usually generated from SKILL.md or LLM output.
- `topic`: topic landing pages.
- `synthesis`: generated summaries, contradictions, or cross-document synthesis.
- `query`: saved query results or generated answers.

### Relation Types

- `wikilink`: created from `[[Page Title]]` style links.
- `shared_tag`: created when pages share tags or categories.
- `source_overlap`: created when records share a source or repository.
- `mentions_entity`: created from page-to-entity extraction.
- `has_topic`: created from page-to-topic extraction.
- `llm_relation`: created by `extract-llm.mjs` with confidence, evidence, and evidence location.

### Evidence Locations

Every imported chunk stores:

- `line_start`
- `line_end`
- `start_offset`
- `end_offset`

LLM relations store `evidence_details` with:

- `chunkId`
- `sourceTitle`
- `sourcePath`
- `lineStart`
- `lineEnd`
- `charStart`
- `charEnd`
- `snippet`

---

## SQLite Schema

Core tables:

```text
wikis
sources
pages
chunks
entities
topics
relations
skills
repositories
authors
locations
import_jobs
analysis_configs
llm_runs
chunks_fts
```

Important indexes:

```text
pages(wiki_id, page_type)
pages(wiki_id, title)
chunks(wiki_id, source_id)
entities(wiki_id, name)
topics(wiki_id, name)
relations(wiki_id, source_id, target_id)
skills(display_name)
skills(github_repo)
skills(stars DESC)
locations(lat, lon)
```

See [references/schema.md](references/schema.md) for the full schema notes.

---

## How It Works

### 1. Initialize

`init-wiki.mjs` creates the database, tables, indexes, FTS table, and default analysis config.

### 2. Ingest

`ingest-docs.mjs` recursively imports `.md` and `.txt` files. Markdown is chunked by heading structure first. Oversized sections are split into overlapping chunks. Each chunk is indexed in SQLite FTS5 and stores source line/character positions.

### 3. Extract With LLM

`extract-llm.mjs` calls an OpenAI-compatible chat completions API. It asks for strict JSON, repairs common JSON formatting issues, and writes entities, topics, relations, source summaries, and contradictions to SQLite.

### 4. Build Graph

`build-graph.mjs` creates graph nodes from pages, entities, and topics. It merges deterministic edges and LLM edges, then computes pair signals, communities, isolated nodes, bridge nodes, and cross-community surprises.

### 5. Query

`query-wiki.mjs` searches chunk FTS first, then falls back to pages, entities, and topics.

### 6. Lint

`lint-wiki.mjs` checks wiki health, broken chunk references, graph edge integrity, isolated nodes, and LLM evidence coverage.

---

## Integration With Skills Book

`skills-book` can use this model to build a skills knowledge base:

```bash
node scripts/skills-book.mjs fetch --force
node scripts/skills-book.mjs build-wiki
node scripts/skills-book.mjs wiki-query "frontend design"
node scripts/skills-book.mjs wiki-graph --out ./skills-graph.json
node scripts/skills-book.mjs shop-export ../ASunYC.github.io/docs/public/data
```

In that workflow:

- `skills.db` becomes the source of truth for skill metadata and wiki content.
- README and SKILL.md files become wiki sources.
- Skill category, repository, author, and location become graph signals.
- Skills Shop consumes exported JSON instead of fetching GitHub at runtime.

---

## Repository Structure

```text
llm-wiki-build-skill/
|-- README.md
|-- SKILL.md
|-- package.json
|-- references/
|   `-- schema.md
`-- scripts/
    |-- init-wiki.mjs
    |-- ingest-docs.mjs
    |-- llm-client.mjs
    |-- llm-status.mjs
    |-- test-llm.mjs
    |-- extract-llm.mjs
    |-- build-graph.mjs
    |-- query-wiki.mjs
    |-- lint-wiki.mjs
    |-- reingest.mjs
    `-- wiki-core.mjs
```

---

## Development Check

Run a local smoke test:

```bash
mkdir -p ./tmp
node scripts/init-wiki.mjs ./tmp/wiki.db --name "Smoke Test"
node scripts/ingest-docs.mjs ./tmp/wiki.db README.md SKILL.md references/schema.md
node scripts/build-graph.mjs ./tmp/wiki.db --out ./tmp/wiki-graph.json
node scripts/query-wiki.mjs ./tmp/wiki.db sqlite
node scripts/lint-wiki.mjs ./tmp/wiki.db
```

LLM smoke test, when credentials are available:

```bash
node scripts/test-llm.mjs
node scripts/extract-llm.mjs ./tmp/wiki.db --depth fast --limit 1
node scripts/lint-wiki.mjs ./tmp/wiki.db
```

Generated `*.db`, `*.db-wal`, and graph scratch files should stay out of Git.

---

## Roadmap

- Add richer import adapters for GitHub repositories and web pages.
- Add export profiles for VitePress, static apps, and agent toolchains.
- Add optional embedding search on top of the current FTS5 keyword search.

---

## License

MIT License

Copyright (c) 2026 ASunYC
