(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderTavilyClient = api;
})(globalThis, function () {
  "use strict";

  const { ProviderError, requestWithRetry } = globalThis.JevXReaderJevClient;

  function safeResult(result) {
    if (!result || typeof result !== "object") return null;
    let url;
    try {
      const parsed = new URL(String(result.url || ""));
      if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      url = parsed.href.slice(0, 1200);
    } catch {
      return null;
    }
    const title = String(result.title || url).replace(/\u0000/g, "").trim().slice(0, 300);
    const content = String(result.content || "").replace(/\u0000/g, "").trim().slice(0, 3000);
    const score = Number(result.score);
    return { title, url, content, ...(Number.isFinite(score) ? { score: Math.max(0, Math.min(1, score)) } : {}) };
  }

  class TavilyClient {
    constructor(config) {
      this.config = config || {};
      this.timeoutMs = 20000;
    }

    async search(query) {
      if (!this.config.apiKey) throw new ProviderError("TAVILY_NO_API_KEY", "Configure a Tavily API key in extension settings.", false);
      const cleanQuery = String(query || "").replace(/\u0000/g, "").trim().slice(0, 600);
      if (!cleanQuery) throw new ProviderError("TAVILY_BAD_QUERY", "The search query is empty.", false);
      const { data } = await requestWithRetry(
        "https://api.tavily.com/search",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query: cleanQuery,
            topic: "general",
            search_depth: this.config.searchDepth || "basic",
            max_results: this.config.maxResults || 5,
            chunks_per_source: 2,
            include_answer: false,
            include_raw_content: false,
            include_images: false
          })
        },
        this.timeoutMs,
        "TAVILY"
      );
      if (!data || !Array.isArray(data.results)) {
        throw new ProviderError("TAVILY_BAD_RESPONSE", "Tavily returned an invalid search response.", false);
      }
      return {
        query: cleanQuery,
        results: data.results.map(safeResult).filter(Boolean).slice(0, this.config.maxResults || 5)
      };
    }

    async testConnection() {
      return this.search("TypeSafe Jev System One");
    }
  }

  return { TavilyClient, safeResult };
});
