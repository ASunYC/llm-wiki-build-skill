# SQLite Schema

The scripts create these tables:

- `wikis`: wiki metadata.
- `sources`: imported files or URLs.
- `pages`: wiki pages derived from sources.
- `chunks`: searchable text chunks.
- `entities`: extracted entities.
- `topics`: extracted topics/tags.
- `relations`: graph edges.
- `analysis_configs`: wiki analysis behavior (`fast`, `standard`, `deep`, summaries, document relations, merge policy).
- `llm_runs`: LLM extraction audit records.
- `skills`: optional skill records.
- `repositories`: optional GitHub repository records.
- `authors`: optional GitHub owner records.
- `locations`: optional geocoded locations.
- `import_jobs`: import status records.
- `chunks_fts`: SQLite FTS5 index over chunk text.

LLM-related fields:

- `chunks.line_start`, `chunks.line_end`, `chunks.start_offset`, `chunks.end_offset`: evidence location metadata.
- `entities.evidence`, `entities.properties`: source-grounded extraction metadata.
- `topics.definition`, `topics.evidence`, `topics.properties`: topic extraction metadata.
- `relations.confidence`, `relations.evidence_details`, `relations.properties`: relation confidence, source location, and typed LLM metadata.
- `pages.metadata`: JSON metadata for synthesis/query/source pages.

Important indexes:

- `pages(wiki_id, page_type)`
- `pages(wiki_id, title)`
- `chunks(wiki_id, source_id)`
- `entities(wiki_id, name)`
- `topics(wiki_id, name)`
- `relations(wiki_id, source_id, target_id)`
- `skills(display_name)`
- `skills(github_repo)`
- `skills(stars DESC)`
- `locations(lat, lon)`

Graph export shape:

```json
{
  "nodes": [{ "id": "page:...", "type": "source", "name": "...", "tags": [], "community": "community-1" }],
  "edges": [{
    "source": "page:a",
    "target": "entity:b",
    "relation": "llm_relation",
    "weight": 0.9,
    "evidenceDetails": [{ "chunkId": "chunk:...", "lineStart": 10, "lineEnd": 18 }]
  }],
  "communities": [{ "id": "community-1", "label": "Community 1", "nodeIds": ["page:..."] }],
  "insights": { "isolatedNodes": [], "bridgeNodes": [], "surprisingConnections": [] },
  "statistics": { "totalNodes": 10, "totalEdges": 12, "totalCommunities": 2 }
}
```

API key policy:

- LLM credentials are read from `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`, and optional `LLM_TIMEOUT_MS`.
- Credentials are not written into `wikis`, `analysis_configs`, `llm_runs`, or any other SQLite table.
