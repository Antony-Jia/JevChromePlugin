const assert = require("node:assert/strict");
const test = require("node:test");
require("../src/providers/jev-client.js");
const { JevClient } = require("../src/providers/jev-client.js");
const { LlmRouter } = require("../src/providers/llm-router.js");

test("Jev client sends multiple questions in one request and keeps the key in the header", async () => {
  const previousFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ model: "jev-test", answers: { interest: { type: "noul", noul: 0.8 } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const client = new JevClient({ apiKey: "unit-test-key", model: "jev-test", timeoutMs: 1000 });
    await client.analyze({ post: "short test" }, {
      interest: { type: "noul", instructions: "Is this a test?" },
      technical: { type: "score", instructions: "How technical is this?", criteria: ["low", "high"] }
    });
    assert.equal(captured.url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(captured.options.headers.Authorization, "Bearer unit-test-key");
    assert.equal(captured.body.model, "jev-test");
    assert.equal(Object.keys(captured.body.questions).length, 2);
    assert.equal(JSON.stringify(captured.body).includes("unit-test-key"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("LLM router sends a non-streaming Chat Completions request", async () => {
  const previousFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const router = new LlmRouter({
      provider: "openai-compatible",
      baseUrl: "https://llm.example.test/v1/",
      apiKey: "unit-test-key",
      model: "model-test",
      temperature: 0.2,
      maxTokens: 128
    });
    assert.equal(await router.testConnection(), "OK");
    assert.equal(captured.url, "https://llm.example.test/v1/chat/completions");
    assert.equal(captured.options.headers.Authorization, "Bearer unit-test-key");
    assert.equal(captured.body.stream, false);
    assert.equal(captured.body.model, "model-test");
    assert.equal(captured.body.messages.length, 2);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Zod Jev response schema requires typed answer records", async () => {
  const { JevResponseSchema } = await import("../src/providers/jev-response-schema.mjs");
  assert.equal(JevResponseSchema.safeParse({ model: "jev-test", answers: { interest: { type: "score", score: 1.5 } } }).success, true);
  assert.equal(JevResponseSchema.safeParse({ model: "jev-test", answers: { interest: { type: "unsupported" } } }).success, false);
  assert.equal(JevResponseSchema.safeParse({ model: "jev-test" }).success, false);
});
