# LLM Wiki Build Skill

> 一个可复用的 Agent 技能工程，用 SQLite 将任意项目的 Markdown、README、SKILL.md 和文本资料构建成 LLM Wiki 知识库与知识图谱。

<div align="center">

<img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue.svg"> <img alt="Node.js 22+" src="https://img.shields.io/badge/node.js-22+-green.svg"> <img alt="SQLite" src="https://img.shields.io/badge/storage-SQLite-blue.svg"> <img alt="better-sqlite3" src="https://img.shields.io/badge/driver-better--sqlite3-lightgrey.svg"> <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg">

**作者**: [ASunYC](https://github.com/ASunYC)

[官网首页](https://asunyc.github.io/) · [Skills Book 页面](https://asunyc.github.io/skills-book/) · [Skills Shop 页面](https://asunyc.github.io/skills-shop/)

[项目简介](#项目简介) | [快速安装](#快速安装) | [使用指南](#使用指南) | [命令表](#命令表) | [LLM 配置](#llm-配置) | [数据模型](#数据模型) | [FAQ](#faq)

</div>

---

## Agent Slash Command

安装到 Claude Code、Codex 或 OpenCode 后，可以直接使用统一命令：

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki extract
/llm-wiki query "frontend design"
/llm-wiki graph
/llm-wiki lint
/llm-wiki status
```

直接 CLI 等价命令：

```bash
node scripts/llm-wiki.mjs <command> [args]
```

命令定义已内置在 `commands/llm-wiki.md`、`.claude/commands/llm-wiki.md`、`.codex/commands/llm-wiki.md` 和 `.opencode/commands/llm-wiki.md`。

---

## 项目简介

`llm-wiki-build-skill` 从 LLM Wiki 的核心能力中提炼出一个可迁移的技能工程。它可以在任意项目中快速创建本地知识库，导入文档，按标题结构切分内容，保留证据位置，使用 SQLite FTS5 搜索，并在可选 LLM 配置下抽取实体、主题、关系、矛盾点和综合页。

这个技能面向两类场景：

- **基础 Wiki 模式**：不需要 LLM API Key，仍然可以构建 sources、pages、chunks、全文搜索、确定性关系和图谱社区。
- **LLM 增强模式**：配置 OpenAI-compatible API 后，额外生成实体、主题、语义关系、证据链和 synthesis 页面。

它也是 `skills-book` 的知识库底座：`skills-book` 可以用它把公开技能仓库、README、SKILL.md、作者、地区和 stars 信息沉淀为 `skills.db`，再导出给 Skills Shop 页面使用。

---

## 功能特性

### 核心能力

- **一键初始化 Wiki**：创建 SQLite 数据库、核心表、索引、FTS5 和默认分析配置。
- **文档导入与分块**：优先按 Markdown 标题结构切分，超长内容再按字符窗口拆分。
- **证据位置追踪**：chunk 保存文件路径、行号、字符偏移，便于 LLM 输出回溯来源。
- **全文检索**：使用 SQLite FTS5 查询 pages、chunks、entities 和 topics。
- **知识图谱导出**：输出 nodes、edges、communities、insights 和 statistics。
- **LLM 抽取增强**：支持实体、主题、关系、矛盾点和综合摘要生成。
- **质量检查**：检查空库、孤立节点、坏关系、证据覆盖率和 LLM 配置状态。
- **Agent 命令适配**：提供 Claude Code、Codex、OpenCode 可用的 `/llm-wiki` 命令定义。

### 技术亮点

- SQLite 本地存储，默认驱动为 `better-sqlite3`。
- API Key 只从环境变量读取，不写入数据库。
- 未配置 LLM 时可以优雅降级为基础知识库。
- 图谱关系同时支持 `wikilink`、`shared_tag`、`source_overlap` 和 `llm_relation`。
- 可作为其他项目的构建技能，而不是绑定某个后端平台或 UI。

---

## 快速安装

### 方法一：作为独立工程使用

```bash
git clone https://github.com/ASunYC/llm-wiki-build-skill.git
cd llm-wiki-build-skill
npm install
```

验证安装：

```bash
node scripts/llm-wiki.mjs help
```

### 方法二：在目标项目中直接调用

目标项目只需要安装运行时依赖：

```bash
npm install better-sqlite3
```

然后通过路径调用本技能：

```bash
node ../llm-wiki-build-skill/scripts/llm-wiki.mjs init
node ../llm-wiki-build-skill/scripts/llm-wiki.mjs ingest
node ../llm-wiki-build-skill/scripts/llm-wiki.mjs graph
```

---

## 使用指南

### 快速开始

```bash
# 初始化 ./data/wiki.db
node scripts/llm-wiki.mjs init

# 导入 README.md、docs、SKILL.md
node scripts/llm-wiki.mjs ingest

# 查询知识库
node scripts/llm-wiki.mjs query "frontend design"

# 导出知识图谱
node scripts/llm-wiki.mjs graph

# 检查知识库质量
node scripts/llm-wiki.mjs lint
```

默认数据库路径为 `./data/wiki.db`。默认导入 `README.md`、`docs` 和 `SKILL.md`，如果都不存在则导入当前目录。

执行 `graph` 时会在图谱 JSON 同目录额外生成一个纯 HTML + JS 可视化页面：

```text
data/
|-- wiki.db
|-- wiki-graph.json
|-- wiki-data.json
|-- wiki-viewer.html
|-- wiki-viewer.js
`-- wiki-viewer-data.js
```

直接打开 `wiki-viewer.html` 就可以浏览知识库页面、实体、主题、技能元数据和知识图谱。这个 Viewer 不依赖构建工具，也不需要后端服务。

### Agent 中使用

```bash
/llm-wiki init
/llm-wiki ingest
/llm-wiki extract
/llm-wiki query "agent memory"
/llm-wiki graph
/llm-wiki lint
```

### 指定数据库和文件

```bash
node scripts/llm-wiki.mjs init ./data/product.db --name "Product Wiki"
node scripts/llm-wiki.mjs ingest ./data/product.db ./README.md ./docs ./notes
node scripts/llm-wiki.mjs query ./data/product.db "release plan"
node scripts/llm-wiki.mjs graph ./data/product.db --out ./data/product-graph.json
```

---

## 命令表

| 命令 | 示例 | 说明 |
| --- | --- | --- |
| `init` | `node scripts/llm-wiki.mjs init` | 初始化默认 `./data/wiki.db`。 |
| `ingest` | `node scripts/llm-wiki.mjs ingest` | 导入默认文档并写入 sources、pages、chunks。 |
| `query` | `node scripts/llm-wiki.mjs query "agent"` | 查询 Wiki、chunk、实体和主题。 |
| `graph` | `node scripts/llm-wiki.mjs graph` | 导出 `./data/wiki-graph.json`，并生成纯 HTML + JS Viewer。 |
| `extract` | `node scripts/llm-wiki.mjs extract` | 使用 LLM 抽取实体、主题、关系和综合页。 |
| `lint` | `node scripts/llm-wiki.mjs lint` | 检查 Wiki 健康度和证据覆盖率。 |
| `reingest` | `node scripts/llm-wiki.mjs reingest ./docs --extract` | 重新导入文档，可选重新抽取。 |
| `status` | `node scripts/llm-wiki.mjs status` | 显示脱敏后的 LLM 配置。 |
| `test` | `node scripts/llm-wiki.mjs test` | 测试 OpenAI-compatible API 连接。 |

底层脚本仍然可以单独调用：

| 脚本 | 用途 |
| --- | --- |
| `scripts/init-wiki.mjs` | 创建数据库、表、索引和默认配置。 |
| `scripts/ingest-docs.mjs` | 导入 Markdown/TXT 文件并创建 chunks。 |
| `scripts/extract-llm.mjs` | 调用 LLM 抽取实体、主题和关系。 |
| `scripts/build-graph.mjs` | 导出知识图谱 JSON，并在同目录生成 Viewer 静态资源。 |
| `scripts/query-wiki.mjs` | 运行全文检索和结构化查询。 |
| `scripts/lint-wiki.mjs` | 检查知识库质量。 |
| `scripts/reingest.mjs` | 重新导入并可选重跑抽取。 |

---

## LLM 配置

API Key 设计保持简单且安全：

- `LLM_API_BASE`：OpenAI-compatible endpoint，例如 `https://api.openai.com/v1`。
- `LLM_API_KEY`：API Key，只从环境变量读取，不写入 SQLite。
- `LLM_MODEL`：模型名称。
- `LLM_TIMEOUT_MS`：可选超时时间，默认 `180000`。

配置示例：

```bash
export LLM_API_BASE=https://api.openai.com/v1
export LLM_API_KEY=your-key
export LLM_MODEL=gpt-4.1-mini
```

Windows PowerShell：

```powershell
$env:LLM_API_BASE="https://api.openai.com/v1"
$env:LLM_API_KEY="your-key"
$env:LLM_MODEL="gpt-4.1-mini"
```

检查配置：

```bash
node scripts/llm-wiki.mjs status
```

测试连接并执行抽取：

```bash
node scripts/llm-wiki.mjs test
node scripts/llm-wiki.mjs extract
```

抽取深度：

| 深度 | 说明 |
| --- | --- |
| `fast` | 更少请求，更粗粒度，适合快速验证。 |
| `standard` | 默认模式，平衡速度与质量。 |
| `deep` | 更细粒度，抽取更多实体和关系。 |

---

## 数据模型

### Page 类型

- `source`：导入的源文档。
- `entity`：实体页，通常来自 LLM 抽取结果。
- `topic`：主题页。
- `synthesis`：综合摘要、矛盾点或跨文档分析。
- `query`：保存的查询结果或生成式回答。

### Relation 类型

- `wikilink`：由 `[[Page Title]]` 形式的链接生成。
- `shared_tag`：页面共享标签或分类时生成。
- `source_overlap`：记录共享来源、仓库或上下文时生成。
- `mentions_entity`：页面提及实体。
- `has_topic`：页面关联主题。
- `llm_relation`：由 LLM 抽取，带 confidence 与 evidence。

### SQLite 核心表

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

关键索引：

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

完整 schema 说明见 [references/schema.md](references/schema.md)。

---

## 与 Skills Book 集成

`skills-book` 可以使用这个技能构建技能知识库：

```bash
node scripts/skills.mjs fetch --force
node scripts/skills.mjs build-wiki
node scripts/skills.mjs wiki-query "frontend design"
node scripts/skills.mjs wiki-graph --out ./skills-graph.json
node scripts/skills.mjs shop-export ../ASunYC.github.io/docs/public/data
```

在这个流程中：

- `skills.db` 是技能元信息和知识库正文的权威存储。
- README 与 SKILL.md 会进入 `sources`、`pages` 和 `chunks`。
- 技能分类、仓库、作者、地区和 stars 会成为图谱信号。
- Skills Shop 消费导出的静态 JSON，而不是在前端运行时抓取 GitHub。

---

## 项目结构

```text
llm-wiki-build-skill/
|-- README.md
|-- SKILL.md
|-- package.json
|-- commands/
|   `-- llm-wiki.md
|-- references/
|   `-- schema.md
`-- scripts/
    |-- llm-wiki.mjs
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

建议目标项目结构：

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

## 开发验证

基础烟测：

```bash
mkdir -p ./tmp
node scripts/llm-wiki.mjs init ./tmp/wiki.db --name "Smoke Test"
node scripts/llm-wiki.mjs ingest ./tmp/wiki.db README.md SKILL.md references/schema.md
node scripts/llm-wiki.mjs graph ./tmp/wiki.db --out ./tmp/wiki-graph.json
node scripts/llm-wiki.mjs query ./tmp/wiki.db sqlite
node scripts/llm-wiki.mjs lint ./tmp/wiki.db
```

LLM 烟测：

```bash
node scripts/llm-wiki.mjs status
node scripts/llm-wiki.mjs test
node scripts/llm-wiki.mjs extract ./tmp/wiki.db --depth fast --limit 1
node scripts/llm-wiki.mjs lint ./tmp/wiki.db
```

生成的 `*.db`、`*.db-wal`、`*.sqlite` 和临时图谱文件不应提交到 Git。

---

## FAQ

### Q: 没有 LLM API Key 能使用吗？

可以。未配置 LLM 时仍然可以初始化数据库、导入文档、全文搜索、构建基础图谱和运行质量检查。

### Q: API Key 会写入数据库吗？

不会。`LLM_API_KEY` 只从环境变量读取，`llm-status` 也只展示脱敏信息。

### Q: 为什么默认导入没有传文件路径？

`llm-wiki.mjs ingest` 会自动寻找当前项目中的 `README.md`、`docs` 和 `SKILL.md`。如果需要精确控制，可以显式传入路径。

### Q: 和普通 RAG 索引有什么区别？

这个技能不只做文本切块和搜索，还会维护 pages、entities、topics、relations、communities 和 evidence locations，更适合 Agent 做可追溯的项目理解与知识图谱分析。

### Q: 可以放到其他 Agent CLI 中吗？

可以。它本质是 Node.js CLI，Claude Code、Codex、OpenCode 或其他能运行 Node.js 22+ 的 Agent 都可以调用。

---

## Roadmap

- 增加 GitHub 仓库和网页导入适配器。
- 增加面向 VitePress、静态站点和 Agent 工具链的 export profile。
- 在 FTS5 之外增加可选 embedding search。
- 提供更完整的图谱可视化前端模板。

---

## License

MIT License

Copyright (c) 2026 ASunYC

---

<div align="center">

如果这个项目对你有帮助，欢迎给一个 Star。

Made by [ASunYC](https://github.com/ASunYC) | Powered by Node.js & SQLite

</div>
