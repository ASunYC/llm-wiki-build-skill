# SQLite Schema

The scripts create these tables:

- `wikis`: wiki metadata.
- `sources`: imported files or URLs.
- `pages`: wiki pages derived from sources.
- `chunks`: searchable text chunks.
- `entities`: extracted entities.
- `topics`: extracted topics/tags.
- `relations`: graph edges.
- `skills`: optional skill records.
- `repositories`: optional GitHub repository records.
- `authors`: optional GitHub owner records.
- `locations`: optional geocoded locations.
- `import_jobs`: import status records.

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
  "nodes": [{ "id": "page:...", "type": "source", "name": "...", "tags": [] }],
  "edges": [{ "source": "page:a", "target": "page:b", "relation": "shared_tag", "weight": 0.5 }],
  "statistics": { "totalNodes": 10, "totalEdges": 12, "totalCommunities": 1 }
}
```
