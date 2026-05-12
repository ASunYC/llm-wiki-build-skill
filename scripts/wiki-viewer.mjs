import fs from "node:fs";
import path from "node:path";

export function collectViewerData(db, wikiId = "default") {
  const wiki = db.prepare("SELECT id, name, description, updated_at FROM wikis WHERE id = ?").get(wikiId)
    || db.prepare("SELECT id, name, description, updated_at FROM wikis LIMIT 1").get()
    || { id: wikiId, name: "LLM Wiki", description: "" };
  const pages = db.prepare(`
SELECT id, title, path, page_type AS type, tags, word_count, substr(content, 1, 6000) AS content, updated_at
FROM pages
WHERE wiki_id = ?
ORDER BY updated_at DESC
`).all(wiki.id).map((row) => ({ ...row, tags: safeJson(row.tags, []) }));
  const chunks = db.prepare(`
SELECT id, source_id, page_id, chunk_index, heading, substr(text, 1, 1600) AS text, line_start, line_end
FROM chunks
WHERE wiki_id = ?
ORDER BY page_id, chunk_index
`).all(wiki.id);
  const entities = db.prepare(`
SELECT id, name, entity_type AS type, confidence, evidence, page_id, source_id
FROM entities
WHERE wiki_id = ?
ORDER BY confidence DESC, name
`).all(wiki.id);
  const topics = db.prepare(`
SELECT id, name, weight, definition, evidence, page_id, source_id
FROM topics
WHERE wiki_id = ?
ORDER BY weight DESC, name
`).all(wiki.id);
  const relations = db.prepare(`
SELECT id, source_id, target_id, relation_type AS type, weight, evidence, confidence, evidence_details
FROM relations
WHERE wiki_id = ?
ORDER BY weight DESC
`).all(wiki.id).map((row) => ({ ...row, evidenceDetails: safeJson(row.evidence_details, []) }));
  const skills = tableExists(db, "skills")
    ? db.prepare(`
SELECT id, slug, display_name AS displayName, description, stars, category, github_repo AS githubRepo, url, author_login AS authorLogin
FROM skills
WHERE wiki_id = ?
ORDER BY stars DESC, display_name
`).all(wiki.id)
    : [];
  return {
    generatedAt: new Date().toISOString(),
    wiki,
    statistics: {
      pages: pages.length,
      chunks: chunks.length,
      entities: entities.length,
      topics: topics.length,
      relations: relations.length,
      skills: skills.length,
    },
    pages,
    chunks,
    entities,
    topics,
    relations,
    skills,
  };
}

export function exportViewerBundle(db, graph, { outPath, wikiId = "default" }) {
  const outDir = path.dirname(path.resolve(outPath));
  const graphFile = path.basename(outPath);
  const dataFile = "wiki-data.json";
  const dataJsFile = "wiki-viewer-data.js";
  const htmlFile = "wiki-viewer.html";
  const appJsFile = "wiki-viewer.js";
  const data = collectViewerData(db, wikiId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, dataFile), JSON.stringify(data, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, dataJsFile), makeDataScript(graph, data), "utf8");
  fs.writeFileSync(path.join(outDir, htmlFile), makeHtml({ graphFile, dataFile, dataJsFile, appJsFile }), "utf8");
  fs.writeFileSync(path.join(outDir, appJsFile), viewerJs(), "utf8");
  return {
    htmlPath: path.join(outDir, htmlFile),
    appJsPath: path.join(outDir, appJsFile),
    dataPath: path.join(outDir, dataFile),
    dataJsPath: path.join(outDir, dataJsFile),
  };
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function makeDataScript(graph, data) {
  return `window.WIKI_VIEWER_BUNDLE = ${escapeScriptJson({ graph, data })};\n`;
}

function makeHtml({ graphFile, dataFile, dataJsFile, appJsFile }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LLM Wiki Viewer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111318;
      --panel: #191c23;
      --panel-2: #20242d;
      --text: #f2f4f8;
      --muted: #a9b0bd;
      --line: #303643;
      --accent: #7dd3fc;
      --accent-2: #a7f3d0;
      --warn: #facc15;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .app { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    header {
      border-bottom: 1px solid var(--line);
      padding: 18px 24px;
      background: #151820;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    .subtitle { margin-top: 4px; color: var(--muted); font-size: 13px; }
    .meta { color: var(--muted); font-size: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
    main {
      display: grid;
      grid-template-columns: minmax(280px, 360px) 1fr minmax(300px, 420px);
      min-height: 0;
    }
    aside, section, .detail { min-height: 0; }
    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      display: grid;
      grid-template-rows: auto auto 1fr;
    }
    .controls { padding: 16px; border-bottom: 1px solid var(--line); display: grid; gap: 12px; }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101218;
      color: var(--text);
      padding: 10px 12px;
      font-size: 14px;
    }
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 12px; border-bottom: 1px solid var(--line); }
    button {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-2);
      color: var(--text);
      padding: 7px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    button.active { border-color: var(--accent); color: #0b1220; background: var(--accent); }
    .list { overflow: auto; padding: 10px; }
    .item {
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
      display: grid;
      gap: 4px;
    }
    .item:hover, .item.active { border-color: var(--line); background: var(--panel-2); }
    .item-title { font-size: 13px; font-weight: 700; }
    .item-sub { color: var(--muted); font-size: 12px; line-height: 1.4; }
    .graph-wrap { min-width: 0; position: relative; background: #0f1117; }
    .toolbar {
      position: absolute;
      z-index: 2;
      top: 14px;
      left: 14px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    svg { width: 100%; height: 100%; display: block; min-height: calc(100vh - 76px); }
    .edge { stroke: #64748b; stroke-opacity: .42; }
    .node { stroke: #0f1117; stroke-width: 1.5; cursor: pointer; }
    .label { fill: #dbe4ef; font-size: 11px; pointer-events: none; text-shadow: 0 1px 2px #000; }
    .detail {
      border-left: 1px solid var(--line);
      background: var(--panel);
      overflow: auto;
      padding: 18px;
    }
    .detail h2 { margin: 0 0 8px; font-size: 18px; }
    .badge { display: inline-block; margin: 0 6px 6px 0; border: 1px solid var(--line); border-radius: 999px; padding: 4px 8px; color: var(--muted); font-size: 12px; }
    .card { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--panel-2); margin-top: 12px; }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.5;
      color: #d6deeb;
      font-size: 12px;
      margin: 0;
    }
    @media (max-width: 1100px) {
      main { grid-template-columns: 320px 1fr; }
      .detail { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--line); max-height: 42vh; }
    }
    @media (max-width: 760px) {
      main { grid-template-columns: 1fr; }
      aside { min-height: 42vh; border-right: 0; border-bottom: 1px solid var(--line); }
      svg { min-height: 62vh; }
    }
  </style>
</head>
<body>
  <div id="app" class="app" data-graph="${graphFile}" data-data="${dataFile}">
    <header>
      <div>
        <h1>LLM Wiki Viewer</h1>
        <div class="subtitle">Local knowledge base and graph explorer</div>
      </div>
      <div class="meta">
        <span>Graph: ${graphFile}</span>
        <span>Data: ${dataFile}</span>
      </div>
    </header>
    <main>
      <aside>
        <div class="controls">
          <input id="search" placeholder="Search pages, entities, topics, skills">
        </div>
        <div id="tabs" class="tabs"></div>
        <div id="list" class="list"></div>
      </aside>
      <section class="graph-wrap">
        <div class="toolbar">
          <button id="fit">Fit</button>
          <button id="labels" class="active">Labels</button>
        </div>
        <svg id="graph" role="img" aria-label="Knowledge graph"></svg>
      </section>
      <section id="detail" class="detail"></section>
    </main>
  </div>
  <script src="./${dataJsFile}"></script>
  <script src="./${appJsFile}"></script>
</body>
</html>
`;
}

function viewerJs() {
  return String.raw`(() => {
  const bundle = window.WIKI_VIEWER_BUNDLE || { graph: { nodes: [], edges: [] }, data: {} };
  const graph = normalizeGraph(bundle.graph || {});
  const data = bundle.data || {};
  const state = { filter: "all", query: "", selectedId: null, showLabels: true };
  const colors = {
    source: "#7dd3fc",
    entity: "#a7f3d0",
    topic: "#facc15",
    synthesis: "#c4b5fd",
    query: "#fda4af",
    skill: "#fb923c",
    default: "#94a3b8"
  };

  const byId = new Map();
  for (const item of allItems()) byId.set(item.id, item);
  for (const node of graph.nodes) {
    if (!byId.has(node.id)) byId.set(node.id, { id: node.id, title: node.name, type: node.type, summary: "" });
  }

  const tabs = [
    ["all", "All"],
    ["source", "Pages"],
    ["entity", "Entities"],
    ["topic", "Topics"],
    ["synthesis", "Synthesis"],
    ["skill", "Skills"]
  ];

  function allItems() {
    return [
      ...(data.pages || []).map((x) => ({ ...x, title: x.title, summary: x.path || "", type: x.type || "source" })),
      ...(data.entities || []).map((x) => ({ ...x, title: x.name, summary: x.evidence || "", type: "entity" })),
      ...(data.topics || []).map((x) => ({ ...x, title: x.name, summary: x.definition || x.evidence || "", type: "topic" })),
      ...(data.skills || []).map((x) => ({ ...x, title: x.displayName, summary: x.description || x.githubRepo || "", type: "skill" }))
    ];
  }

  function normalizeGraph(input) {
    const nodes = (input.nodes || []).map((node, index) => ({
      ...node,
      id: node.id,
      name: node.name || node.title || node.id,
      type: node.type || "default",
      x: 240 + Math.cos(index) * 180,
      y: 240 + Math.sin(index) * 180,
      vx: 0,
      vy: 0
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = (input.edges || [])
      .map((edge) => ({ ...edge, source: edge.source || edge.source_id, target: edge.target || edge.target_id, relation: edge.relation || edge.relation_type }))
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { ...input, nodes, edges };
  }

  function renderTabs() {
    const el = document.getElementById("tabs");
    el.innerHTML = "";
    for (const [id, label] of tabs) {
      const button = document.createElement("button");
      button.textContent = label;
      button.className = state.filter === id ? "active" : "";
      button.onclick = () => { state.filter = id; render(); };
      el.appendChild(button);
    }
  }

  function visibleItems() {
    const q = state.query.trim().toLowerCase();
    return allItems().filter((item) => {
      const typeOk = state.filter === "all" || item.type === state.filter;
      const text = [item.title, item.summary, item.path, item.category, item.githubRepo].filter(Boolean).join(" ").toLowerCase();
      return typeOk && (!q || text.includes(q));
    });
  }

  function renderList() {
    const el = document.getElementById("list");
    const items = visibleItems();
    el.innerHTML = "";
    if (!items.length) {
      el.innerHTML = '<div class="item-sub" style="padding:12px">No matching records.</div>';
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "item" + (item.id === state.selectedId ? " active" : "");
      row.onclick = () => select(item.id);
      row.innerHTML = '<div class="item-title">' + escapeHtml(item.title || item.id) + '</div>' +
        '<div class="item-sub">' + escapeHtml([item.type, item.summary].filter(Boolean).join(" · ").slice(0, 180)) + '</div>';
      el.appendChild(row);
    }
  }

  function renderDetail() {
    const el = document.getElementById("detail");
    const selected = byId.get(state.selectedId) || allItems()[0] || graph.nodes[0];
    if (!selected) {
      el.innerHTML = "<h2>Empty Wiki</h2><p class='item-sub'>No pages or graph nodes were exported.</p>";
      return;
    }
    state.selectedId = selected.id;
    const related = graph.edges
      .filter((edge) => edge.source === selected.id || edge.target === selected.id)
      .slice(0, 12)
      .map((edge) => {
        const otherId = edge.source === selected.id ? edge.target : edge.source;
        const other = byId.get(otherId) || { title: otherId };
        return '<div class="item-sub">' + escapeHtml(edge.relation || "related") + " -> " + escapeHtml(other.title || other.name || otherId) + '</div>';
      }).join("");
    const chunks = (data.chunks || []).filter((chunk) => chunk.page_id === selected.id).slice(0, 5);
    el.innerHTML = '<h2>' + escapeHtml(selected.title || selected.name || selected.id) + '</h2>' +
      '<div>' + badge(selected.type || "node") + (selected.path ? badge(selected.path) : "") + (selected.word_count ? badge(selected.word_count + " words") : "") + '</div>' +
      (selected.summary ? '<div class="card"><pre>' + escapeHtml(selected.summary) + '</pre></div>' : "") +
      (selected.content ? '<div class="card"><pre>' + escapeHtml(selected.content) + '</pre></div>' : "") +
      (selected.evidence ? '<div class="card"><pre>' + escapeHtml(selected.evidence) + '</pre></div>' : "") +
      (chunks.length ? '<div class="card"><strong>Chunks</strong>' + chunks.map((chunk) => '<pre style="margin-top:10px">' + escapeHtml((chunk.heading ? "# " + chunk.heading + "\n" : "") + chunk.text) + '</pre>').join("") + '</div>' : "") +
      (related ? '<div class="card"><strong>Related</strong>' + related + '</div>' : "");
  }

  function badge(text) {
    return '<span class="badge">' + escapeHtml(String(text)) + '</span>';
  }

  function renderGraph() {
    const svg = document.getElementById("graph");
    const rect = svg.getBoundingClientRect();
    const width = Math.max(320, rect.width || svg.clientWidth || 800);
    const height = Math.max(420, rect.height || svg.clientHeight || 640);
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    runLayout(width, height);
    svg.innerHTML = "";
    for (const edge of graph.edges) {
      const a = graph.nodes.find((n) => n.id === edge.source);
      const b = graph.nodes.find((n) => n.id === edge.target);
      if (!a || !b) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "edge");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke-width", String(1 + Math.min(3, edge.weight || 0.5)));
      svg.appendChild(line);
    }
    for (const node of graph.nodes) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "node");
      circle.setAttribute("cx", node.x);
      circle.setAttribute("cy", node.y);
      circle.setAttribute("r", String(6 + Math.min(8, node.degree || 0)));
      circle.setAttribute("fill", colors[node.type] || colors.default);
      circle.onclick = () => select(node.id);
      svg.appendChild(circle);
      if (state.showLabels) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("class", "label");
        text.setAttribute("x", node.x + 10);
        text.setAttribute("y", node.y + 4);
        text.textContent = trim(node.name || node.id, 30);
        svg.appendChild(text);
      }
    }
  }

  function runLayout(width, height) {
    const nodes = graph.nodes;
    if (!nodes.length) return;
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    for (let tick = 0; tick < 160; tick++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy || 1;
          const force = Math.min(2800 / d2, 2.2);
          dx /= Math.sqrt(d2); dy /= Math.sqrt(d2);
          a.vx -= dx * force; a.vy -= dy * force;
          b.vx += dx * force; b.vy += dy * force;
        }
      }
      for (const edge of graph.edges) {
        const a = nodes[index.get(edge.source)], b = nodes[index.get(edge.target)];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 95;
        const force = (d - target) * 0.012 * (edge.weight || 0.7);
        a.vx += (dx / d) * force; a.vy += (dy / d) * force;
        b.vx -= (dx / d) * force; b.vy -= (dy / d) * force;
      }
      for (const node of nodes) {
        node.vx += (width / 2 - node.x) * 0.004;
        node.vy += (height / 2 - node.y) * 0.004;
        node.vx *= 0.82; node.vy *= 0.82;
        node.x = Math.max(18, Math.min(width - 18, node.x + node.vx));
        node.y = Math.max(18, Math.min(height - 18, node.y + node.vy));
      }
    }
  }

  function fitGraph() {
    graph.nodes.forEach((node, index) => {
      node.x = 320 + Math.cos(index * 2.399) * (80 + index * 4);
      node.y = 260 + Math.sin(index * 2.399) * (80 + index * 4);
      node.vx = 0; node.vy = 0;
    });
    renderGraph();
  }

  function select(id) {
    state.selectedId = id;
    renderList();
    renderDetail();
    renderGraph();
  }

  function render() {
    renderTabs();
    renderList();
    renderDetail();
    renderGraph();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function trim(value, max) {
    value = String(value || "");
    return value.length > max ? value.slice(0, max - 1) + "..." : value;
  }

  document.getElementById("search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderList();
  });
  document.getElementById("fit").onclick = fitGraph;
  document.getElementById("labels").onclick = () => {
    state.showLabels = !state.showLabels;
    document.getElementById("labels").className = state.showLabels ? "active" : "";
    renderGraph();
  };
  window.addEventListener("resize", () => renderGraph());
  render();
})();`;
}
