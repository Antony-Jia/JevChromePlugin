const assert = require("node:assert/strict");
const test = require("node:test");

require("../src/providers/jev-client.js");
const { TavilyClient, safeResult } = require("../src/providers/tavily-client.js");

test("Tavily client sends a bounded search request and sanitizes results", async () => {
  const previousFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      results: [{ title: "Source", url: "https://example.test/article", content: "Evidence", score: 0.82 }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const client = new TavilyClient({ apiKey: "tvly-test", searchDepth: "basic", maxResults: 4 });
    const result = await client.search("technical claim");
    assert.equal(captured.url, "https://api.tavily.com/search");
    assert.equal(captured.options.headers.Authorization, "Bearer tvly-test");
    assert.equal(captured.body.search_depth, "basic");
    assert.equal(captured.body.max_results, 4);
    assert.equal(captured.body.include_raw_content, false);
    assert.equal(result.results[0].url, "https://example.test/article");
    assert.equal(JSON.stringify(captured.body).includes("tvly-test"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Tavily result sanitizer rejects unsafe URLs and bounds content", () => {
  assert.equal(safeResult({ url: "javascript:alert(1)", title: "bad" }), null);
  const result = safeResult({ url: "https://example.test", title: "Title", content: "x".repeat(4000), score: 9 });
  assert.equal(result.content.length, 3000);
  assert.equal(result.score, 1);
});
