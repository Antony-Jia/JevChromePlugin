(function () {
  "use strict";
  const Core = globalThis.JevXReaderCore;
  const $ = (id) => document.getElementById(id);
  let savedConfig = Core.createDefaultConfig();
  let savedJevKey = "";
  let savedOpenRouterJevKey = "";
  let savedLlmKey = "";
  let savedTavilyKey = "";
  let clearJevKey = false;
  let clearOpenRouterJevKey = false;
  let clearLlmKey = false;
  let clearTavilyKey = false;
  let previousJevProvider = "typesafe";

  const LLM_PRESETS = {
    ollama: { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.2", message: "已填入本机 Ollama 预设；Key 可留空，连接测试会申请 localhost 权限。" },
    openai: { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", message: "已填入 OpenAI 预设；请填写 API Key 后测试连接。" },
    deepseek: { provider: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", message: "已填入 DeepSeek 预设；请填写 API Key 后测试连接。" },
    kimi: { provider: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-latest", message: "已填入 Kimi（Moonshot）预设；请填写 API Key 后测试连接。" },
    zhipu: { provider: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", message: "已填入智谱 GLM 预设；请填写 API Key 后测试连接。" },
    openrouter: { provider: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", message: "已填入 OpenRouter 预设；请填写 API Key 后测试连接。" }
  };

  function setStatus(message, kind = "muted") {
    const element = $("save-status");
    element.textContent = message;
    element.dataset.kind = kind;
    element.style.color = kind === "error" ? "#b91c1c" : kind === "success" ? "#047857" : "";
  }

  function setGlobalStatus(message) {
    $("global-status").textContent = message;
  }

  async function send(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return { ok: false, error: { message: "扩展后台暂不可用。请到扩展管理页重新加载 Jev Reader。" } };
    }
  }

  function lines(value) {
    return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }

  function defaultJevModel(provider) {
    return provider === "openrouter" ? "~typesafe/jev-latest" : "jev-latest";
  }

  function updateJevProviderUi(updateDefaultModel = false) {
    const provider = $("jev-provider").value === "openrouter" ? "openrouter" : "typesafe";
    if (updateDefaultModel) {
      const model = $("jev-model").value.trim();
      if (!model || model === defaultJevModel(previousJevProvider)) {
        $("jev-model").value = defaultJevModel(provider);
      }
    }
    const isOpenRouter = provider === "openrouter";
    $("typesafe-jev-key-field").hidden = isOpenRouter;
    $("openrouter-jev-key-field").hidden = !isOpenRouter;
    $("clear-jev-key").hidden = isOpenRouter;
    $("clear-openrouter-jev-key").hidden = !isOpenRouter;
    $("jev-provider-help").textContent = isOpenRouter
      ? "通过 OpenRouter Decisions API 调用 Jev。"
      : "通过 TypeSafe 官方 API 调用 Jev。";
    $("jev-model-label").textContent = isOpenRouter ? "OpenRouter 模型 ID" : "TypeSafe Jev model";
    $("jev-model-help").textContent = isOpenRouter
      ? "默认 ~typesafe/jev-latest；可填写其他 Jev 模型 ID。"
      : "例如 jev-latest。";
    $("jev-model").placeholder = defaultJevModel(provider);
    previousJevProvider = provider;
  }

  function collectConfig() {
    const thresholds = {
      noMask: Number($("threshold-no-mask").value) / 100,
      light: Number($("threshold-light").value) / 100,
      medium: Number($("threshold-medium").value) / 100
    };
    let questions;
    try {
      questions = JSON.parse($("questions").value);
    } catch {
      throw new Core.ConfigValidationError("Questions JSON 格式无效，请修正后保存。");
    }
    const jevProvider = $("jev-provider").value;
    const jevApiKey = clearJevKey ? "" : ($("jev-api-key").value || savedJevKey);
    const openRouterJevApiKey = clearOpenRouterJevKey
      ? ""
      : ($("openrouter-jev-api-key").value || savedOpenRouterJevKey);
    const llmApiKey = clearLlmKey ? "" : ($("llm-api-key").value || savedLlmKey);
    const tavilyApiKey = clearTavilyKey ? "" : ($("tavily-api-key").value || savedTavilyKey);
    return Core.normalizeConfig({
      enabled: $("enabled").checked,
      jev: {
        provider: jevProvider,
        apiKey: jevApiKey,
        openRouterApiKey: openRouterJevApiKey,
        model: $("jev-model").value.trim() || defaultJevModel(jevProvider),
        timeoutMs: Number($("jev-timeout").value),
        concurrency: Number($("jev-concurrency").value)
      },
      preferences: {
        interests: lines($("interests").value),
        notInterested: lines($("not-interested").value),
        deepReadDefinition: $("deep-read-definition").value
      },
      questions,
      scoring: {
        maskEnabled: $("mask-enabled").checked,
        showDimensionScores: $("show-dimensions").checked,
        railChartStyle: $("rail-chart-style").value,
        thresholds,
        lowConfidenceProtection: $("confidence-protection").checked,
        confidenceFloor: Number($("confidence-floor").value) / 100
      },
      browsing: {
        autoScroll: $("auto-scroll").checked,
        dwellMs: Number($("dwell-ms").value),
        pauseAfterInteractionMs: Number($("pause-ms").value),
        preloadAhead: Number($("preload-ahead").value),
        railWidth: Number($("rail-width").value),
        maxPostsPerSession: Number($("max-posts").value),
        maxAnalysesPerMinute: Number($("max-per-minute").value),
        maxRequestsPerDay: Number($("max-requests-per-day").value)
      },
      llm: {
        provider: $("llm-provider").value,
        baseUrl: $("llm-base-url").value,
        apiKey: llmApiKey,
        model: $("llm-model").value,
        temperature: Number($("llm-temperature").value),
        maxTokens: Number($("llm-max-tokens").value)
      },
      tavily: {
        enabled: $("tavily-enabled").checked,
        apiKey: tavilyApiKey,
        searchDepth: $("tavily-search-depth").value,
        maxResults: Number($("tavily-max-results").value)
      }
    });
  }

  function populate(config) {
    savedConfig = config;
    savedJevKey = config.jev.apiKey || "";
    savedOpenRouterJevKey = config.jev.openRouterApiKey || "";
    savedLlmKey = config.llm.apiKey || "";
    savedTavilyKey = config.tavily.apiKey || "";
    clearJevKey = false;
    clearOpenRouterJevKey = false;
    clearLlmKey = false;
    clearTavilyKey = false;
    $("enabled").checked = config.enabled;
    $("jev-provider").value = config.jev.provider || "typesafe";
    previousJevProvider = $("jev-provider").value;
    $("jev-api-key").value = "";
    $("jev-api-key").placeholder = savedJevKey ? "已保存；留空保留" : "输入 TypeSafe API Key";
    $("jev-key-state").textContent = savedJevKey ? "Key 已保存在本地" : "尚未设置";
    $("openrouter-jev-api-key").value = "";
    $("openrouter-jev-api-key").placeholder = savedOpenRouterJevKey ? "已保存；留空保留" : "输入 OpenRouter API Key";
    $("openrouter-jev-key-state").textContent = savedOpenRouterJevKey ? "Key 已保存在本地" : "尚未设置";
    const jevModel = config.jev.model === "jev-latest" && previousJevProvider === "openrouter"
      ? defaultJevModel("openrouter")
      : config.jev.model;
    $("jev-model").value = jevModel;
    updateJevProviderUi();
    $("jev-timeout").value = config.jev.timeoutMs;
    $("jev-concurrency").value = config.jev.concurrency;
    $("interests").value = config.preferences.interests.join("\n");
    $("not-interested").value = config.preferences.notInterested.join("\n");
    $("deep-read-definition").value = config.preferences.deepReadDefinition;
    $("questions").value = JSON.stringify(config.questions, null, 2);
    $("threshold-no-mask").value = Math.round(config.scoring.thresholds.noMask * 100);
    $("threshold-light").value = Math.round(config.scoring.thresholds.light * 100);
    $("threshold-medium").value = Math.round(config.scoring.thresholds.medium * 100);
    $("confidence-floor").value = Math.round(config.scoring.confidenceFloor * 100);
    $("mask-enabled").checked = config.scoring.maskEnabled;
    $("show-dimensions").checked = config.scoring.showDimensionScores;
    $("rail-chart-style").value = config.scoring.railChartStyle || "rings";
    $("confidence-protection").checked = config.scoring.lowConfidenceProtection;
    $("auto-scroll").checked = config.browsing.autoScroll;
    $("dwell-ms").value = config.browsing.dwellMs;
    $("pause-ms").value = config.browsing.pauseAfterInteractionMs;
    $("preload-ahead").value = config.browsing.preloadAhead;
    $("rail-width").value = config.browsing.railWidth;
    $("max-posts").value = config.browsing.maxPostsPerSession;
    $("max-per-minute").value = config.browsing.maxAnalysesPerMinute;
    $("max-requests-per-day").value = config.browsing.maxRequestsPerDay;
    $("llm-provider").value = config.llm.provider;
    $("llm-base-url").value = config.llm.baseUrl;
    $("llm-api-key").value = "";
    $("llm-api-key").placeholder = savedLlmKey ? "已保存；留空保留" : "输入 LLM API Key";
    $("llm-key-state").textContent = savedLlmKey ? "Key 已保存在本地" : "尚未设置";
    $("llm-model").value = config.llm.model;
    $("llm-temperature").value = config.llm.temperature;
    $("llm-max-tokens").value = config.llm.maxTokens;
    $("tavily-enabled").checked = config.tavily.enabled;
    $("tavily-api-key").value = "";
    $("tavily-api-key").placeholder = savedTavilyKey ? "已保存；留空保留" : "输入 Tavily API Key";
    $("tavily-key-state").textContent = savedTavilyKey ? "Key 已保存在本地" : "尚未设置";
    $("tavily-search-depth").value = config.tavily.searchDepth;
    $("tavily-max-results").value = config.tavily.maxResults;
  }

  async function save(config) {
    const settings = config || collectConfig();
    const response = await send({ type: "SAVE_SETTINGS", config: settings });
    if (!response?.ok) throw new Error(response?.error?.message || "保存失败。");
    savedConfig = settings;
    savedJevKey = settings.jev.apiKey;
    savedOpenRouterJevKey = settings.jev.openRouterApiKey;
    savedLlmKey = settings.llm.apiKey;
    savedTavilyKey = settings.tavily.apiKey;
    clearJevKey = false;
    clearOpenRouterJevKey = false;
    clearLlmKey = false;
    clearTavilyKey = false;
    $("jev-api-key").value = "";
    $("openrouter-jev-api-key").value = "";
    $("llm-api-key").value = "";
    $("tavily-api-key").value = "";
    $("jev-api-key").placeholder = savedJevKey ? "已保存；留空保留" : "输入 TypeSafe API Key";
    $("openrouter-jev-api-key").placeholder = savedOpenRouterJevKey ? "已保存；留空保留" : "输入 OpenRouter API Key";
    $("llm-api-key").placeholder = savedLlmKey ? "已保存；留空保留" : "输入 LLM API Key";
    $("jev-key-state").textContent = savedJevKey ? "Key 已保存在本地" : "尚未设置";
    $("openrouter-jev-key-state").textContent = savedOpenRouterJevKey ? "Key 已保存在本地" : "尚未设置";
    $("llm-key-state").textContent = savedLlmKey ? "Key 已保存在本地" : "尚未设置";
    $("tavily-api-key").placeholder = savedTavilyKey ? "已保存；留空保留" : "输入 Tavily API Key";
    $("tavily-key-state").textContent = savedTavilyKey ? "Key 已保存在本地" : "尚未设置";
    setGlobalStatus("设置已保存。已打开的 X 标签页会在约 15 秒内应用新设置。");
    return settings;
  }

  async function onSave() {
    try {
      await save();
      setStatus("设置已保存。", "success");
    } catch (error) {
      setStatus(error.message || "设置无效，请检查输入。", "error");
    }
  }

  async function onTestJev() {
    let config;
    try {
      config = collectConfig();
      const activeJevKey = config.jev.provider === "openrouter"
        ? config.jev.openRouterApiKey
        : config.jev.apiKey;
      if (!activeJevKey) {
        throw new Error(config.jev.provider === "openrouter" ? "请先填写 OpenRouter API Key。" : "请先填写 TypeSafe API Key。");
      }
      $("test-jev").disabled = true;
      setStatus("正在测试 Jev 连接…");
      await save(config);
      const response = await send({ type: "TEST_JEV" });
      if (!response?.ok) throw new Error(response?.error?.message || "Jev 连接失败。");
      setStatus(`Jev 连接成功（${response.model || config.jev.model}）。`, "success");
    } catch (error) {
      setStatus(error.message || "Jev 连接失败。", "error");
    } finally {
      $("test-jev").disabled = false;
    }
  }

  function hostPattern(baseUrl) {
    try {
      return Core.llmPermissionOrigin(baseUrl);
    } catch (error) {
      throw new Error(error?.message || "请填写有效的 LLM Base URL。");
    }
  }

  async function onTestLlm() {
    let config;
    let permissionRequest;
    try {
      config = collectConfig();
      if (!config.llm.model) throw new Error("请先填写 LLM Model。");
      const pattern = hostPattern(config.llm.baseUrl);
      // Runtime host permissions must be requested directly from this button click.
      permissionRequest = chrome.permissions.request({ origins: [pattern] });
      $("test-llm").disabled = true;
      setStatus("正在申请 LLM 主机访问权限…");
      const granted = await permissionRequest;
      if (!granted) throw new Error("未授予 LLM 主机权限，连接测试未执行。");
      await save(config);
      setStatus("正在测试 LLM 连接…");
      const response = await send({ type: "TEST_LLM" });
      if (!response?.ok) throw new Error(response?.error?.message || "LLM 连接失败。");
      setStatus(`LLM 连接成功（${response.provider} · ${response.model}）。`, "success");
    } catch (error) {
      setStatus(error.message || "LLM 连接失败。", "error");
    } finally {
      $("test-llm").disabled = false;
    }
  }

  async function onTestTavily() {
    let config;
    try {
      config = collectConfig();
      if (!config.tavily.apiKey) throw new Error("请先填写 Tavily API Key。");
      $("test-tavily").disabled = true;
      setStatus("正在保存并测试 Tavily 搜索…");
      await save(config);
      const response = await send({ type: "TEST_TAVILY" });
      if (!response?.ok) throw new Error(response?.error?.message || "Tavily 连接失败。");
      setStatus(`Tavily 搜索成功，返回 ${response.resultCount} 个结果。`, "success");
    } catch (error) {
      setStatus(error.message || "Tavily 连接失败。", "error");
    } finally {
      $("test-tavily").disabled = false;
    }
  }

  function bind() {
    $("save-settings").addEventListener("click", onSave);
    $("jev-provider").addEventListener("change", () => updateJevProviderUi(true));
    $("test-jev").addEventListener("click", onTestJev);
    $("test-llm").addEventListener("click", onTestLlm);
    $("test-tavily").addEventListener("click", onTestTavily);
    $("clear-jev-key").addEventListener("click", () => {
      clearJevKey = true;
      savedJevKey = "";
      $("jev-api-key").value = "";
      $("jev-api-key").placeholder = "保存设置后移除 Key";
      $("jev-key-state").textContent = "保存后将清除";
      setStatus("保存设置后会清除 Jev Key。");
    });
    $("clear-openrouter-jev-key").addEventListener("click", () => {
      clearOpenRouterJevKey = true;
      savedOpenRouterJevKey = "";
      $("openrouter-jev-api-key").value = "";
      $("openrouter-jev-api-key").placeholder = "保存设置后移除 Key";
      $("openrouter-jev-key-state").textContent = "保存后将清除";
      setStatus("保存设置后会清除 OpenRouter Key。");
    });
    $("clear-llm-key").addEventListener("click", () => {
      clearLlmKey = true;
      savedLlmKey = "";
      $("llm-api-key").value = "";
      $("llm-api-key").placeholder = "保存设置后移除 Key";
      $("llm-key-state").textContent = "保存后将清除";
      setStatus("保存设置后会清除 LLM Key。");
    });
    $("clear-tavily-key").addEventListener("click", () => {
      clearTavilyKey = true;
      savedTavilyKey = "";
      $("tavily-api-key").value = "";
      $("tavily-api-key").placeholder = "保存设置后移除 Key";
      $("tavily-key-state").textContent = "保存后将清除";
      setStatus("保存设置后会清除 Tavily Key。");
    });
    document.querySelectorAll("[data-llm-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const preset = LLM_PRESETS[button.dataset.llmPreset];
        if (!preset) return;
        $("llm-provider").value = preset.provider;
        $("llm-base-url").value = preset.baseUrl;
        $("llm-model").value = preset.model;
        setStatus(preset.message);
      });
    });
  }

  async function refreshUsage() {
    const response = await send({ type: "GET_USAGE" });
    if (!response?.ok || !response.usage) return;
    const attempts = Object.values(response.usage.attempts || {}).reduce((sum, value) => sum + value, 0);
    const jevTasks = response.usage.tasks?.jev || 0;
    const deepTasks = response.usage.tasks?.deep || 0;
    $("usage-status").textContent = `今日外部请求 ${attempts} 次（Jev 任务 ${jevTasks}、深入解析 ${deepTasks}）/ 每日上限 ${savedConfig.browsing?.maxRequestsPerDay ?? "—"}`;
  }

  async function init() {
    bind();
    const response = await send({ type: "GET_SETTINGS" });
    if (!response?.ok) {
      setGlobalStatus(response?.error?.message || "读取设置失败。");
      return;
    }
    populate(response);
    setGlobalStatus("设置已读取。保存后，打开的 X 标签页会自动刷新配置。");
    setStatus("设置已加载。");
    void refreshUsage();
  }

  void init();
})();
