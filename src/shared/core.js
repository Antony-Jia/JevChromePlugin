(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderCore = api;
})(globalThis, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_QUESTIONS = [
    {
      id: "interest",
      label: "兴趣相关度",
      enabled: true,
      type: "score",
      instructions: "How interesting and relevant is this post to the user's stated interests? Evaluate the post text and available context, not popularity alone.",
      criteria: [
        "Not relevant to the user's interests.",
        "Weakly related and unlikely to be useful.",
        "Relevant and potentially useful.",
        "Strongly relevant with concrete useful information.",
        "Highly aligned and worth immediate attention."
      ],
      weight: 0.35,
      includeInComposite: true,
      penalty: false
    },
    {
      id: "technical_innovation",
      label: "技术创新",
      enabled: true,
      type: "score",
      instructions: "How much genuine technical novelty or engineering innovation is present in the post, using only the available text and context?",
      criteria: [
        "No meaningful technical content.",
        "Mentions technology but contains little substance.",
        "Useful technical information but mostly known ideas.",
        "A meaningful new implementation, method, result, or engineering idea.",
        "Unusually novel or important innovation with concrete evidence or detail."
      ],
      weight: 0.3,
      includeInComposite: true,
      penalty: false
    },
    {
      id: "deep_read_value",
      label: "深入阅读价值",
      enabled: true,
      type: "score",
      instructions: "How worthwhile is it to spend more time reading this post, opening its sources, or analyzing it in depth?",
      criteria: [
        "Not worth further attention.",
        "Low value; a quick glance is enough.",
        "Potentially useful if time permits.",
        "Worth opening and reading carefully.",
        "High priority for deeper analysis or source verification."
      ],
      weight: 0.25,
      includeInComposite: true,
      penalty: false
    },
    {
      id: "information_density",
      label: "信息密度",
      enabled: true,
      type: "score",
      instructions: "How much concrete, specific, decision-useful information does this post contain relative to its length?",
      criteria: [
        "Almost no substantive information.",
        "Mostly generic or repetitive.",
        "Some useful specifics mixed with filler.",
        "Mostly concrete and information-rich.",
        "Exceptionally concise and dense with useful details."
      ],
      weight: 0.1,
      includeInComposite: true,
      penalty: false
    },
    {
      id: "marketing_noise",
      label: "营销噪声",
      enabled: true,
      type: "noul",
      instructions: "Is this post primarily promotional, hype-driven, engagement bait, or marketing with little substantive information?",
      criteria: undefined,
      weight: 0.35,
      includeInComposite: true,
      penalty: true
    },
    {
      id: "primary_source_signal",
      label: "一手技术来源",
      enabled: true,
      type: "noul",
      instructions: "Does this post contain or directly point to a primary technical source such as a paper, repository, benchmark, release, documentation, or first-party technical announcement?",
      criteria: undefined,
      weight: 0,
      includeInComposite: false,
      penalty: false
    }
  ];

  function createDefaultConfig() {
    return {
      enabled: true,
      jev: { apiKey: "", model: "jev-latest", timeoutMs: 20000, concurrency: 2 },
      preferences: {
        interests: [],
        notInterested: [],
        deepReadDefinition: "Posts with concrete technical information, novel methods, results, primary sources, implementation details, or ideas worth verifying."
      },
      questions: DEFAULT_QUESTIONS.map((question) => ({ ...question, criteria: question.criteria?.slice() })),
      scoring: {
        maskEnabled: true,
        showDimensionScores: true,
        thresholds: { noMask: 0.8, light: 0.6, medium: 0.4 },
        lowConfidenceProtection: true,
        confidenceFloor: 0.5
      },
      browsing: {
        autoScroll: false,
        dwellMs: 5000,
        pauseAfterInteractionMs: 15000,
        maxPostsPerSession: 100,
        maxAnalysesPerMinute: 20,
        maxRequestsPerDay: 300
      },
      llm: {
        provider: "openai-compatible",
        baseUrl: "",
        apiKey: "",
        model: "",
        temperature: 0.2,
        maxTokens: 1600
      },
      tavily: {
        enabled: false,
        apiKey: "",
        searchDepth: "basic",
        maxResults: 5
      }
    };
  }

  class ConfigValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = "ConfigValidationError";
      this.code = "INVALID_CONFIG";
    }
  }

  function boundedNumber(value, fallback, min, max, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new ConfigValidationError(`${label} must be between ${min} and ${max}.`);
    }
    return number;
  }

  function cleanString(value, fallback, maxLength, label) {
    const result = value === undefined || value === null ? fallback : String(value).trim();
    if (result.length > maxLength) throw new ConfigValidationError(`${label} is too long.`);
    return result;
  }

  function normalizeList(value, fallback, label) {
    if (value === undefined) return fallback.slice();
    if (!Array.isArray(value)) throw new ConfigValidationError(`${label} must be a list.`);
    if (value.length > 40) throw new ConfigValidationError(`${label} can contain at most 40 items.`);
    return value.map((item) => cleanString(item, "", 160, label)).filter(Boolean);
  }

  function normalizeQuestions(input, fallback) {
    const questions = input === undefined ? fallback : input;
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 12) {
      throw new ConfigValidationError("Questions must be a list containing 1 to 12 items.");
    }
    const seen = new Set();
    const normalizedQuestions = questions.map((question, index) => {
      if (!question || typeof question !== "object" || Array.isArray(question)) {
        throw new ConfigValidationError(`Question ${index + 1} must be an object.`);
      }
      const id = cleanString(question.id, "", 32, "Question ID");
      if (!/^[a-z][a-z0-9_]*$/.test(id)) {
        throw new ConfigValidationError(`Question ${index + 1} has an invalid ID.`);
      }
      if (seen.has(id)) throw new ConfigValidationError(`Question ID "${id}" is duplicated.`);
      seen.add(id);
      const type = question.type;
      if (!["score", "noul", "choice"].includes(type)) {
        throw new ConfigValidationError(`Question "${id}" has an unsupported type.`);
      }
      const label = cleanString(question.label, id, 64, "Question label");
      const instructions = cleanString(question.instructions, "", 1000, "Question instructions");
      if (!instructions) throw new ConfigValidationError(`Question "${id}" needs instructions.`);
      const normalized = {
        id,
        label,
        enabled: question.enabled !== false,
        type,
        instructions,
        weight: boundedNumber(question.weight ?? 0, 0, 0, 1, `Question "${id}" weight`),
        includeInComposite: question.includeInComposite === true,
        penalty: question.penalty === true
      };
      if (type === "score") {
        if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 8) {
          throw new ConfigValidationError(`Score question "${id}" needs 2 to 8 criteria.`);
        }
        normalized.criteria = question.criteria.map((item) => cleanString(item, "", 240, `Question "${id}" criterion`));
        if (normalized.criteria.some((item) => !item)) throw new ConfigValidationError(`Question "${id}" has an empty criterion.`);
      } else if (type === "choice") {
        const entries = Object.entries(question.criteria || {});
        if (entries.length < 2 || entries.length > 12) {
          throw new ConfigValidationError(`Choice question "${id}" needs 2 to 12 options.`);
        }
        normalized.criteria = {};
        for (const [key, description] of entries) {
          if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) throw new ConfigValidationError(`Question "${id}" has an invalid choice key.`);
          normalized.criteria[key] = cleanString(description, "", 240, `Question "${id}" choice`);
        }
      }
      if (normalized.penalty && type === "choice") {
        throw new ConfigValidationError(`Choice question "${id}" cannot be a penalty.`);
      }
      if (normalized.penalty && type !== "noul") {
        throw new ConfigValidationError(`Only Noul questions can be configured as penalties.`);
      }
      return normalized;
    });
    if (!normalizedQuestions.some((question) => question.enabled)) {
      throw new ConfigValidationError("Enable at least one Jev question.");
    }
    if (!normalizedQuestions.some((question) => question.enabled && question.type === "score" && question.includeInComposite)) {
      throw new ConfigValidationError("Enable at least one score question in the composite score.");
    }
    return normalizedQuestions;
  }

  function normalizeConfig(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new ConfigValidationError("Settings must be an object.");
    }
    const defaults = createDefaultConfig();
    const source = input;
    const jev = { ...defaults.jev, ...(source.jev || {}) };
    const preferences = { ...defaults.preferences, ...(source.preferences || {}) };
    const scoring = { ...defaults.scoring, ...(source.scoring || {}) };
    const thresholds = { ...defaults.scoring.thresholds, ...(scoring.thresholds || {}) };
    const browsing = { ...defaults.browsing, ...(source.browsing || {}) };
    const llm = { ...defaults.llm, ...(source.llm || {}) };
    const tavily = { ...defaults.tavily, ...(source.tavily || {}) };

    const cleanThresholds = {
      noMask: boundedNumber(thresholds.noMask, 0.8, 0, 1, "No-mask threshold"),
      light: boundedNumber(thresholds.light, 0.6, 0, 1, "Light-mask threshold"),
      medium: boundedNumber(thresholds.medium, 0.4, 0, 1, "Medium-mask threshold")
    };
    if (!(cleanThresholds.noMask >= cleanThresholds.light && cleanThresholds.light >= cleanThresholds.medium)) {
      throw new ConfigValidationError("Mask thresholds must satisfy no-mask >= light >= medium.");
    }
    if (!["openai-compatible", "ollama"].includes(llm.provider)) {
      throw new ConfigValidationError("LLM provider must be openai-compatible or ollama.");
    }
    if (!["basic", "advanced", "fast", "ultra-fast"].includes(tavily.searchDepth)) {
      throw new ConfigValidationError("Tavily search depth is invalid.");
    }
    const llmBaseUrl = cleanString(llm.baseUrl, "", 500, "LLM base URL");
    if (llmBaseUrl) parseLlmBaseUrl(llmBaseUrl);

    return {
      enabled: source.enabled !== false,
      jev: {
        apiKey: cleanString(jev.apiKey, "", 4096, "TypeSafe API key"),
        model: cleanString(jev.model, "jev-latest", 100, "Jev model") || "jev-latest",
        timeoutMs: boundedNumber(jev.timeoutMs, 20000, 1000, 120000, "Jev timeout"),
        concurrency: Math.round(boundedNumber(jev.concurrency, 2, 1, 4, "Jev concurrency"))
      },
      preferences: {
        interests: normalizeList(preferences.interests, [], "Interests"),
        notInterested: normalizeList(preferences.notInterested, [], "Not interested"),
        deepReadDefinition: cleanString(preferences.deepReadDefinition, "", 1000, "Deep-read definition")
      },
      questions: normalizeQuestions(source.questions, defaults.questions),
      scoring: {
        maskEnabled: scoring.maskEnabled !== false,
        showDimensionScores: scoring.showDimensionScores !== false,
        thresholds: cleanThresholds,
        lowConfidenceProtection: scoring.lowConfidenceProtection !== false,
        confidenceFloor: boundedNumber(scoring.confidenceFloor, 0.5, 0, 1, "Confidence floor")
      },
      browsing: {
        autoScroll: browsing.autoScroll === true,
        dwellMs: Math.round(boundedNumber(browsing.dwellMs, 5000, 1000, 60000, "Dwell time")),
        pauseAfterInteractionMs: Math.round(boundedNumber(browsing.pauseAfterInteractionMs, 15000, 1000, 120000, "Interaction pause")),
        maxPostsPerSession: Math.round(boundedNumber(browsing.maxPostsPerSession, 100, 1, 1000, "Session post limit")),
        maxAnalysesPerMinute: Math.round(boundedNumber(browsing.maxAnalysesPerMinute, 20, 1, 120, "Analyses per minute limit")),
        maxRequestsPerDay: Math.round(boundedNumber(browsing.maxRequestsPerDay, 300, 10, 10000, "Daily request limit"))
      },
      llm: {
        provider: llm.provider,
        baseUrl: llmBaseUrl,
        apiKey: cleanString(llm.apiKey, "", 4096, "LLM API key"),
        model: cleanString(llm.model, "", 160, "LLM model"),
        temperature: boundedNumber(llm.temperature, 0.2, 0, 2, "LLM temperature"),
        maxTokens: Math.round(boundedNumber(llm.maxTokens, 1600, 64, 8192, "LLM max tokens"))
      },
      tavily: {
        enabled: tavily.enabled === true,
        apiKey: cleanString(tavily.apiKey, "", 4096, "Tavily API key"),
        searchDepth: tavily.searchDepth,
        maxResults: Math.round(boundedNumber(tavily.maxResults, 5, 1, 10, "Tavily max results"))
      }
    };
  }

  function toPublicConfig(config) {
    return {
      enabled: config.enabled,
      jev: { model: config.jev.model, timeoutMs: config.jev.timeoutMs },
      preferences: config.preferences,
      questions: config.questions,
      scoring: config.scoring,
      browsing: config.browsing
    };
  }

  function isLoopbackHostname(hostname) {
    const normalized = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
  }

  function parseLlmBaseUrl(value) {
    let url;
    try {
      url = new URL(String(value || "").trim());
    } catch {
      throw new ConfigValidationError("LLM base URL must be a valid URL.");
    }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new ConfigValidationError("LLM base URL must use HTTP/HTTPS and cannot contain credentials.");
    }
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
      throw new ConfigValidationError("Remote LLM base URLs must use HTTPS; HTTP is allowed only for localhost.");
    }
    return url;
  }

  function llmPermissionOrigin(baseUrl) {
    const url = parseLlmBaseUrl(baseUrl);
    return `${url.protocol}//${url.hostname}/*`;
  }

  function cleanText(value, maxLength) {
    if (value === undefined || value === null) return undefined;
    const text = String(value).replace(/\u0000/g, "").trim();
    return text ? text.slice(0, maxLength) : undefined;
  }

  function normalizeMetrics(metrics) {
    if (!metrics || typeof metrics !== "object") return undefined;
    const result = {};
    for (const key of ["replies", "reposts", "likes", "views"]) {
      const number = Number(metrics[key]);
      if (Number.isFinite(number) && number >= 0) result[key] = Math.round(number);
    }
    return Object.keys(result).length ? result : undefined;
  }

  function validateExtractedPost(post) {
    if (!post || typeof post !== "object" || Array.isArray(post)) throw new ConfigValidationError("Post must be an object.");
    const postId = cleanText(post.postId, 80);
    if (!postId || !/^[A-Za-z0-9:_-]{1,80}$/.test(postId)) throw new ConfigValidationError("Post has an invalid platform ID.");
    const text = cleanText(post.text, 12000);
    if (!text) throw new ConfigValidationError("Post text is empty.");
    const result = { postId, text };
    const platform = cleanText(post.platform, 20);
    if (platform && !["x", "weibo"].includes(platform)) throw new ConfigValidationError("Post has an unsupported platform.");
    if (platform) result.platform = platform;
    for (const key of ["url", "authorName", "authorHandle", "timestamp"]) {
      const value = cleanText(post[key], key === "url" ? 500 : 200);
      if (value) result[key] = value;
    }
    if (post.quotedPost && typeof post.quotedPost === "object") {
      const quote = {};
      const authorHandle = cleanText(post.quotedPost.authorHandle, 200);
      const quoteText = cleanText(post.quotedPost.text, 6000);
      if (authorHandle) quote.authorHandle = authorHandle;
      if (quoteText) quote.text = quoteText;
      if (Object.keys(quote).length) result.quotedPost = quote;
    }
    if (Array.isArray(post.visibleThreadContext)) {
      result.visibleThreadContext = post.visibleThreadContext.slice(0, 8).map((item) => ({
        authorHandle: cleanText(item?.authorHandle, 200),
        text: cleanText(item?.text, 2000) || ""
      })).filter((item) => item.text);
    }
    if (Array.isArray(post.mediaAltTexts)) {
      result.mediaAltTexts = post.mediaAltTexts.slice(0, 20).map((item) => cleanText(item, 500)).filter(Boolean);
    }
    if (post.extractionQuality && typeof post.extractionQuality === "object" && !Array.isArray(post.extractionQuality)) {
      const quality = {};
      for (const key of ["textTruncated", "quoteTruncated", "suspectedCollapsed", "hasMedia", "mediaAltOnly", "threadContextProvided"]) {
        if (typeof post.extractionQuality[key] === "boolean") quality[key] = post.extractionQuality[key];
      }
      const adapterVersion = cleanText(post.extractionQuality.adapterVersion, 40);
      if (adapterVersion) quality.adapterVersion = adapterVersion;
      if (Object.keys(quality).length) result.extractionQuality = quality;
    }
    const metrics = normalizeMetrics(post.metrics);
    if (metrics) result.metrics = metrics;
    return result;
  }

  function buildJevState(postInput, preferences) {
    const post = validateExtractedPost(postInput);
    return {
      post: {
        id: post.postId,
        platform: post.platform,
        author_name: post.authorName,
        author_handle: post.authorHandle,
        text: post.text,
        url: post.url,
        timestamp: post.timestamp
      },
      quoted_post: post.quotedPost ? {
        author_handle: post.quotedPost.authorHandle,
        text: post.quotedPost.text
      } : undefined,
      visible_context: post.visibleThreadContext?.map((item) => ({ author_handle: item.authorHandle, text: item.text })),
      media_alt_texts: post.mediaAltTexts,
      extraction_quality: post.extractionQuality,
      engagement: post.metrics,
      user_preferences: {
        interests: preferences.interests,
        not_interested: preferences.notInterested,
        deep_read_definition: preferences.deepReadDefinition
      }
    };
  }

  function buildQuestions(questionConfigs) {
    const result = {};
    for (const question of questionConfigs.filter((item) => item.enabled)) {
      const definition = { type: question.type, instructions: question.instructions };
      if (question.criteria !== undefined) definition.criteria = question.criteria;
      result[question.id] = definition;
    }
    if (!Object.keys(result).length) throw new ConfigValidationError("Enable at least one Jev question.");
    return result;
  }

  function probabilityMap(value, questionId) {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Jev returned invalid probabilities for "${questionId}".`);
    }
    const entries = Object.entries(value);
    if (entries.length > 20) throw new Error(`Jev returned too many probabilities for "${questionId}".`);
    const result = {};
    for (const [key, probability] of entries) {
      const number = Number(probability);
      if (!Number.isFinite(number) || number < 0 || number > 1) {
        throw new Error(`Jev returned an invalid probability for "${questionId}".`);
      }
      result[key] = number;
    }
    return result;
  }

  function normalizeJevAnswers(response, questionConfigs) {
    if (!response || typeof response !== "object" || !response.answers || typeof response.answers !== "object") {
      throw new Error("Jev returned a response without answers.");
    }
    const dimensions = [];
    for (const question of questionConfigs.filter((item) => item.enabled)) {
      const answer = response.answers[question.id];
      if (!answer || answer.type !== question.type) throw new Error(`Jev returned an invalid answer for "${question.id}".`);
      const confidence = answer.confidence === undefined ? undefined : Number(answer.confidence);
      if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new Error(`Jev returned invalid confidence for "${question.id}".`);
      }
      const dimension = { id: question.id, label: question.label, type: question.type };
      if (confidence !== undefined) dimension.confidence = confidence;
      const probabilities = probabilityMap(answer.probabilities, question.id);
      if (probabilities) dimension.probabilities = probabilities;
      if (question.type === "score") {
        const score = Number(answer.score);
        if (!Number.isFinite(score) || score < 0 || score > question.criteria.length - 1) {
          throw new Error(`Jev returned an out-of-range score for "${question.id}".`);
        }
        dimension.score = score;
        dimension.normalizedScore = score / (question.criteria.length - 1);
      } else if (question.type === "noul") {
        const noul = Number(answer.noul);
        if (!Number.isFinite(noul) || noul < 0 || noul > 1) throw new Error(`Jev returned an invalid Noul value for "${question.id}".`);
        dimension.noul = noul;
        dimension.normalizedScore = noul;
      } else {
        if (typeof answer.choice !== "string" || !(answer.choice in question.criteria)) {
          throw new Error(`Jev returned an invalid choice for "${question.id}".`);
        }
        dimension.selectedChoice = answer.choice;
      }
      dimensions.push(dimension);
    }
    return dimensions;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function calculateComposite(dimensions, questionConfigs) {
    const byId = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
    const scores = questionConfigs.filter((question) => question.enabled && question.type === "score" && question.includeInComposite)
      .map((question) => ({ question, dimension: byId.get(question.id) }))
      .filter((item) => item.dimension && Number.isFinite(item.dimension.normalizedScore));
    if (!scores.length) throw new Error("No enabled score dimensions contribute to the composite score.");
    let weightTotal = scores.reduce((sum, item) => sum + item.question.weight, 0);
    const equalWeight = weightTotal <= 0;
    if (equalWeight) weightTotal = scores.length;
    const weightedScore = scores.reduce((sum, item) => {
      const weight = equalWeight ? 1 : item.question.weight;
      return sum + item.dimension.normalizedScore * weight;
    }, 0) / weightTotal;
    let marketingFactor = 1;
    for (const question of questionConfigs.filter((item) => item.enabled && item.type === "noul" && item.penalty)) {
      const dimension = byId.get(question.id);
      if (dimension && Number.isFinite(dimension.normalizedScore)) {
        marketingFactor *= 1 - question.weight * dimension.normalizedScore;
      }
    }
    const confidences = scores.map((item) => item.dimension.confidence).filter(Number.isFinite);
    return {
      score: clamp01(weightedScore * marketingFactor),
      confidence: confidences.length ? Math.min(...confidences) : undefined,
      averageConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : undefined,
      marketingFactor
    };
  }

  function maskLevelForScore(score, confidence, scoring) {
    const thresholds = scoring.thresholds;
    let level = score >= thresholds.noMask ? "none" : score >= thresholds.light ? "light" : score >= thresholds.medium ? "medium" : "strong";
    if (scoring.maskEnabled === false) return "none";
    if (scoring.lowConfidenceProtection && (!Number.isFinite(confidence) || confidence < scoring.confidenceFloor)) {
      if (level === "strong" || level === "medium") level = "light";
    }
    return level;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      const result = {};
      for (const key of Object.keys(value).sort()) {
        if (value[key] !== undefined) result[key] = stableValue(value[key]);
      }
      return result;
    }
    return value;
  }

  async function makeCacheKey(payload) {
    const serialized = JSON.stringify(stableValue(payload));
    if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(serialized);
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (let index = 0; index < serialized.length; index += 1) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fallback-${(hash >>> 0).toString(16)}`;
  }

  // Inference identity: only the fields that actually change what Jev is asked
  // about. Engagement metrics, timestamps, weights and display thresholds are
  // intentionally excluded so they never trigger a new request on their own.
  function contentHashPayload(post) {
    return {
      v: 1,
      postId: post.postId,
      platform: post.platform,
      text: post.text,
      quotedPost: post.quotedPost,
      mediaAltTexts: post.mediaAltTexts,
      visibleThreadContext: post.visibleThreadContext
    };
  }

  async function computeContentHash(postInput) {
    return makeCacheKey(contentHashPayload(validateExtractedPost(postInput)));
  }

  // Inference configuration identity: model, preferences and the parts of each
  // question that are submitted to Jev. Weights, includeInComposite and penalty
  // only affect local scoring, so they stay out of this fingerprint.
  function analysisConfigPayload(config) {
    return {
      v: 1,
      model: config?.jev?.model,
      preferences: {
        interests: config?.preferences?.interests,
        notInterested: config?.preferences?.notInterested,
        deepReadDefinition: config?.preferences?.deepReadDefinition
      },
      questions: (config?.questions || [])
        .filter((question) => question.enabled)
        .map((question) => ({
          id: question.id,
          type: question.type,
          instructions: question.instructions,
          criteria: question.criteria
        }))
    };
  }

  async function computeAnalysisConfigHash(config) {
    return makeCacheKey(analysisConfigPayload(config));
  }

  return {
    DAY_MS,
    DEFAULT_QUESTIONS,
    ConfigValidationError,
    createDefaultConfig,
    normalizeConfig,
    toPublicConfig,
    parseLlmBaseUrl,
    llmPermissionOrigin,
    validateExtractedPost,
    buildJevState,
    buildQuestions,
    normalizeJevAnswers,
    calculateComposite,
    maskLevelForScore,
    makeCacheKey,
    contentHashPayload,
    computeContentHash,
    analysisConfigPayload,
    computeAnalysisConfigHash,
    stableValue
  };
});
