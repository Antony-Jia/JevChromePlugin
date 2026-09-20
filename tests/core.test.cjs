const assert = require("node:assert/strict");
const test = require("node:test");
const Core = require("../src/shared/core.js");

function sampleResponse(config) {
  const answers = {};
  for (const question of config.questions.filter((item) => item.enabled)) {
    if (question.type === "score") {
      const score = ({ interest: 3, technical_innovation: 4, deep_read_value: 2, information_density: 3 })[question.id] ?? 2;
      answers[question.id] = { type: "score", score, confidence: 0.85, probabilities: { "0": 0, "1": 0.1, "2": 0.1, "3": 0.4, "4": 0.4 } };
    } else if (question.type === "noul") {
      answers[question.id] = { type: "noul", noul: question.id === "marketing_noise" ? 0.8 : 0.9, confidence: 0.9 };
    }
  }
  return { model: "jev-test", answers };
}

test("builds structured Jev state and a single multi-question request", () => {
  const config = Core.createDefaultConfig();
  const post = {
    postId: "123456789",
    authorHandle: "@alice",
    text: "A new inference engine is available.",
    quotedPost: { authorHandle: "@bob", text: "Benchmark details" },
    mediaAltTexts: ["Latency chart"],
    metrics: { likes: 40, replies: 3 }
  };
  const state = Core.buildJevState(post, config.preferences);
  const questions = Core.buildQuestions(config.questions);
  assert.equal(state.post.id, post.postId);
  assert.equal(state.quoted_post.author_handle, "@bob");
  assert.deepEqual(state.engagement, { likes: 40, replies: 3 });
  assert.equal(Object.keys(questions).length, 6);
  assert.equal(questions.interest.type, "score");
  assert.equal(questions.marketing_noise.type, "noul");
});

test("normalizes Jev score and Noul answers and computes a deterministic composite", () => {
  const config = Core.createDefaultConfig();
  const dimensions = Core.normalizeJevAnswers(sampleResponse(config), config.questions);
  assert.equal(dimensions.find((item) => item.id === "interest").normalizedScore, 0.75);
  assert.equal(dimensions.find((item) => item.id === "marketing_noise").normalizedScore, 0.8);
  const result = Core.calculateComposite(dimensions, config.questions);
  assert.ok(Math.abs(result.score - 0.549) < 1e-9);
  assert.equal(result.confidence, 0.85);
  assert.equal(Core.maskLevelForScore(result.score, result.confidence, config.scoring), "medium");
});

test("low confidence prevents a strong mask and thresholds stay deterministic", () => {
  const config = Core.createDefaultConfig();
  assert.equal(Core.maskLevelForScore(0.2, 0.2, config.scoring), "light");
  assert.equal(Core.maskLevelForScore(0.35, undefined, config.scoring), "light");
  assert.equal(Core.maskLevelForScore(0.4, 0.9, config.scoring), "medium");
  assert.equal(Core.maskLevelForScore(0.8, 0.9, config.scoring), "none");
  assert.equal(Core.maskLevelForScore(0.1, 0.9, { ...config.scoring, maskEnabled: false }), "none");
});

test("validates scores, thresholds, and question IDs", () => {
  const config = Core.createDefaultConfig();
  const invalid = sampleResponse(config);
  invalid.answers.interest.score = 8;
  assert.throws(() => Core.normalizeJevAnswers(invalid, config.questions), /out-of-range/);
  assert.throws(() => Core.normalizeConfig({ scoring: { thresholds: { noMask: 0.5, light: 0.7, medium: 0.4 } } }), /no-mask >= light/);
  const duplicateQuestions = Core.createDefaultConfig().questions;
  duplicateQuestions[1].id = duplicateQuestions[0].id;
  assert.throws(() => Core.normalizeConfig({ questions: duplicateQuestions }), /duplicated/);
});

test("content-facing configuration contains no provider secrets", () => {
  const config = Core.createDefaultConfig();
  config.jev.timeoutMs = 47000;
  config.jev.apiKey = "private-jev-key";
  config.llm.apiKey = "private-llm-key";
  config.tavily.apiKey = "private-tavily-key";
  const publicConfig = Core.toPublicConfig(config);
  assert.equal("apiKey" in publicConfig.jev, false);
  assert.equal(publicConfig.jev.timeoutMs, 47000);
  assert.equal("llm" in publicConfig, false);
  assert.doesNotMatch(JSON.stringify(publicConfig), /private-/);
});

test("validates Tavily research settings", () => {
  const config = Core.normalizeConfig({ tavily: { enabled: true, apiKey: "test", searchDepth: "advanced", maxResults: 7 } });
  assert.deepEqual(config.tavily, { enabled: true, apiKey: "test", searchDepth: "advanced", maxResults: 7 });
  assert.throws(() => Core.normalizeConfig({ tavily: { searchDepth: "deep" } }), /search depth/);
  assert.throws(() => Core.normalizeConfig({ tavily: { maxResults: 20 } }), /max results/);
});

test("requires HTTPS for remote LLM endpoints but permits local Ollama HTTP", () => {
  assert.equal(Core.llmPermissionOrigin("https://llm.example.test/v1"), "https://llm.example.test/*");
  assert.equal(Core.llmPermissionOrigin("http://localhost:11434/v1"), "http://localhost/*");
  assert.equal(Core.llmPermissionOrigin("http://127.0.0.1:11434/v1"), "http://127.0.0.1/*");
  assert.throws(() => Core.normalizeConfig({ llm: { baseUrl: "http://llm.example.test/v1" } }), /must use HTTPS/);
});

test("cache keys are stable for object key order and change with state", async () => {
  const left = await Core.makeCacheKey({ postId: "1", state: { b: 2, a: 1 } });
  const reordered = await Core.makeCacheKey({ state: { a: 1, b: 2 }, postId: "1" });
  const changed = await Core.makeCacheKey({ postId: "1", state: { a: 2, b: 2 } });
  assert.equal(left, reordered);
  assert.notEqual(left, changed);
});
