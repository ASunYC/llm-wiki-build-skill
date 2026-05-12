# LLM Wiki Build Skill

> A reusable Codex/Claude-style skill for building SQLite-backed LLM Wiki knowledge bases and knowledge graphs from Markdown, README, SKILL.md, and text files.

<div align="center">

![Node.js](https://img.shields.io/badge/node.js-22+-green.svg)
![SQLite](https://img.shields.io/badge/storage-SQLite-blue.svg)
![better-sqlite3](https://img.shields.io/badge/driver-better--sqlite3-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Author**: [ASunYC](https://github.com/ASunYC)

</div>

---

## Project Overview

`llm-wiki-build-skill` extracts the core idea of an LLM Wiki into a portable skill project. It lets any repository quickly create a local knowledge base, import documentation, split content into searchable chunks, derive graph relations, and export a graph JSON for UI or agent workflows.

The first version is intentionally lightweight:

- SQLite as the default storage layer.
- `better-sqlite3` for simple, synchronous, stable scripts.
- Markdown heading-aware chunking.
- Deterministic graph relations that work without an LLM.
- Optional room for OpenAI-compatible LLM extraction.
- A schema that can also store skills, repositories, authors, and locations.

It is designed to support projects like `skills-book`, where public skill repositories are transformed into `skills.db` and then exported into a Skills Shop interface.

---

## What It Builds

The generated wiki database can store:

- `sources`: imported files, URLs, or documents.
- `pages`: normalized wiki pages.
- `chunks`: searchable text chunks.
- `entities`: extracted people, tools, frameworks, products, or concepts.
- `topics`: reusable topic labels.
- `relations`: graph edges such as wikilinks, shared tags, source overlap, and LLM relations.
- `skills`, `repositories`, `authors`, `locations`: optional marketplace-style metadata.

Graph output includes:

- `nodes`
- `edges`
- `communities`
- `statistics`

---

## Installation

Clone the repository:

```bash
git clone https://github.com/ASunYC/llm-wiki-build-skill.git
cd llm-wiki-build-skill
npm install
```

Or install the dependency in any target project that wants to run the scripts:

```bash
npm install better-sqlite3
```

---

## Quick Start

Initialize a wiki database:

```bash
node scripts/init-wiki.mjs ./data/wiki.db --name "Project Wiki"
```

Import documents:

```bash
node scripts/ingest-docs.mjs ./data/wiki.db ./README.md ./docs
```

Build a graph:

```bash
node scripts/build-graph.mjs ./data/wiki.db --out ./data/wiki-graph.json
```

Query the wiki:

```bash
node scripts/query-wiki.mjs ./data/wiki.db "frontend design"
```

---

## Use It From Another Project

You can keep this repository outside your target project and call scripts by path:

```bash
node ../llm-wiki-build-skill/scripts/init-wiki.mjs ./data/wiki.db --name "My App Wiki"
node ../llm-wiki-build-skill/scripts/ingest-docs.mjs ./data/wiki.db ./README.md ./docs
node ../llm-wiki-build-skill/scripts/build-graph.mjs ./data/wiki.db --out ./public/wiki-graph.json
```

Recommended target project layout:

```text
my-project/
├── data/
│   ├── wiki.db
│   └── wiki-graph.json
├── docs/
├── README.md
└── package.json
```

---

## Commands

| Command | Example | Description |
| --- | --- | --- |
| `init-wiki` | `node scripts/init-wiki.mjs ./data/wiki.db --name "Project Wiki"` | Create SQLite tables and indexes. |
| `ingest-docs` | `node scripts/ingest-docs.mjs ./data/wiki.db ./README.md ./docs` | Import Markdown/TXT files into sources, pages, and chunks. |
| `build-graph` | `node scripts/build-graph.mjs ./data/wiki.db --out ./data/wiki-graph.json` | Export deterministic graph JSON. |
| `query-wiki` | `node scripts/query-wiki.mjs ./data/wiki.db "agent"` | Search pages and chunks by keyword. |

---

## LLM Wiki Model

### Page Types

The schema supports these page types:

- `source`: imported source documents.
- `entity`: extracted entities.
- `topic`: topic landing pages.
- `synthesis`: generated summaries or cross-document synthesis.
- `query`: saved query results or generated answers.

### Relation Types

The graph supports these relation sources:

- `wikilink`: created from `[[Page Title]]` style links.
- `shared_tag`: created when pages share tags or categories.
- `source_overlap`: created when records share a source or repository.
- `llm_relation`: reserved for LLM-extracted relationships.

The default scripts work without an LLM. If you add an OpenAI-compatible extraction step, write richer edges into `relations` with `relation_type = "llm_relation"`.

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

`init-wiki.mjs` creates the database, tables, and indexes.

### 2. Ingest

`ingest-docs.mjs` recursively imports `.md` and `.txt` files. Markdown is chunked by heading structure first. Oversized sections are split into overlapping character chunks.

### 3. Build Graph

`build-graph.mjs` creates graph nodes from pages and derives deterministic edges from:

- wiki links
- shared tags
- same source overlap

### 4. Query

`query-wiki.mjs` performs simple keyword search across page titles, page content, and chunks.

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

## Optional LLM Extraction

The base scripts do not require any LLM credentials. A future extractor can use OpenAI-compatible environment variables:

```bash
LLM_API_BASE=https://api.openai.com/v1
LLM_API_KEY=your-key
LLM_MODEL=gpt-4.1-mini
```

Suggested LLM extraction outputs:

- entities into `entities`
- topics into `topics`
- relations into `relations` with `relation_type = "llm_relation"`
- generated summaries into `pages` with `page_type = "synthesis"`

---

## Repository Structure

```text
llm-wiki-build-skill/
├── README.md
├── SKILL.md
├── package.json
├── references/
│   └── schema.md
└── scripts/
    ├── init-wiki.mjs
    ├── ingest-docs.mjs
    ├── build-graph.mjs
    ├── query-wiki.mjs
    └── wiki-core.mjs
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
```

The generated `*.db`, `*.db-wal`, and graph scratch files should stay out of Git.

---

## Roadmap

- Add optional OpenAI-compatible entity/topic/relation extraction.
- Add full-text search using SQLite FTS5.
- Add graph community detection beyond the current deterministic default.
- Add richer import adapters for GitHub repositories and web pages.
- Add export profiles for VitePress, static apps, and agent toolchains.

---

## License

MIT License

Copyright (c) 2026 ASunYC

