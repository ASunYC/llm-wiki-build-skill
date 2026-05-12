const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MODEL = "glm-4-flash";
const RETRY_DELAYS = [2000, 5000, 15000];

export function loadLLMConfig(env = process.env) {
  const baseUrl = (env.LLM_API_BASE || env.OPENAI_BASE_URL || "").trim().replace(/\/+$/, "");
  const apiKey = (env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim();
  const model = (env.LLM_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { baseUrl, apiKey, model, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS };
}

export function publicLLMConfig(config = loadLLMConfig()) {
  return {
    endpoint: config.baseUrl,
    model: config.model,
    available: Boolean(config.baseUrl && config.apiKey),
    apiKey: config.apiKey ? maskKey(config.apiKey) : "",
  };
}

export function maskKey(value) {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export class LLMClient {
  constructor(config = loadLLMConfig()) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  get isAvailable() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  get endpoint() {
    return this.baseUrl;
  }

  get modelName() {
    return this.model;
  }

  async healthCheck(timeoutMs = 15000) {
    await this.chat([
      { role: "system", content: "You are a connection test assistant." },
      { role: "user", content: "ping" },
    ], { temperature: 0, maxTokens: 32, timeoutMs });
  }

  async chat(messages, options = {}) {
    const response = await this.request({
      model: this.model,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
    }, 0, options.timeoutMs || this.timeoutMs);
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty content");
    return content;
  }

  async chatJSON(messages, options = {}) {
    const response = await this.request({
      model: this.model,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
      response_format: { type: "json_object" },
    }, 0, options.timeoutMs || this.timeoutMs);
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty content for JSON request");
    try {
      return JSON.parse(content);
    } catch {
      const extracted = extractJSON(content);
      if (extracted) return extracted;
      throw new Error(`LLM returned invalid JSON: ${content.slice(0, 220)}`);
    }
  }

  async request(body, attempt, timeoutMs) {
    if (!this.isAvailable) throw new Error("LLM is not configured. Set LLM_API_BASE, LLM_API_KEY, and LLM_MODEL.");
    const url = `${this.baseUrl}/chat/completions`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`LLM API ${response.status}: ${text.slice(0, 300)}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt < RETRY_DELAYS.length && isRetryable(error)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
        return this.request(body, attempt + 1, timeoutMs);
      }
      throw error instanceof Error ? new Error(formatError(error), { cause: error }) : error;
    }
  }
}

function isRetryable(error) {
  const text = formatError(error);
  return /429|503|timeout|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR/i.test(text);
}

function formatError(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) return `${error.name}: ${error.message}; cause=${cause.name}: ${cause.message}`;
  if (cause && typeof cause === "object") {
    const detail = [cause.code, cause.message].filter(Boolean).join(" ");
    if (detail) return `${error.name}: ${error.message}; cause=${detail}`;
  }
  return `${error.name}: ${error.message}`;
}

function extractJSON(text) {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]); } catch {}
  }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  const start = text.indexOf("{");
  if (start >= 0) {
    const repaired = repairTruncatedJSON(text.slice(start));
    if (repaired) return repaired;
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }
  return null;
}

function repairTruncatedJSON(text) {
  let fixed = text.trimEnd();
  fixed = fixed.replace(/,\s*"[^"]*"?\s*:\s*"[^"]*$/, "");
  fixed = fixed.replace(/,\s*"[^"]*"?\s*:\s*\{?\s*$/, "");
  fixed = fixed.replace(/,\s*"[^"]*"?\s*$/, "");
  let braces = 0;
  let brackets = 0;
  for (const ch of fixed) {
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
  }
  for (let i = 0; i < brackets; i++) fixed += "]";
  for (let i = 0; i < braces; i++) fixed += "}";
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}
