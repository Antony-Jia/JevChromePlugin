(function () {
  "use strict";
  const Core = globalThis.JevXReaderCore;
  const $ = (id) => document.getElementById(id);
  let savedConfig = Core.createDefaultConfig();
  let savedJevKey = "";
  let savedLlmKey = "";
  let savedTavilyKey = "";
  let clearJevKey = false;
  let clearLlmKey = false;
  let clearTavilyKey = false;

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
    const jevApiKey = clearJevKey ? "" : ($("jev-api-key").value || savedJevKey);
    const llmApiKey = clearLlmKey ? "" : ($("llm-api-key").value || savedLlmKey);
    const tavilyApiKey = clearTavilyKey ? "" : ($("tavily-api-key").value || savedTavilyKey);
    return Core.normalizeConfig({
      enabled: $("enabled").checked,
      jev: {
        apiKey: jevApiKey,
        model: $("jev-model").value,
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
        thresholds,
        lowConfidenceProtection: $("confidence-protection").checked,
        confidenceFloor: Number($("confidence-floor").value) / 100
      },
      browsing: {
        autoScroll: $("auto-scroll").checked,
        dwellMs: Number($("dwell-ms").value),
        pauseAfterInteractionMs: Number($("pause-ms").value),
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
    savedLlmKey = config.llm.apiKey || "";
    savedTavilyKey = config.tavily.apiKey || "";
    clearJevKey = false;
    clearLlmKey = false;
    clearTavilyKey = false;
    $("enabled").checked = config.enabled;
    $("jev-api-key").value = "";
    $("jev-api-key").placeholder = savedJevKey ? "已保存；留空保留" : "输入 TypeSafe API Key";
    $("jev-key-state").textContent = savedJevKey ? "Key 已保存在本地" : "尚未设置";
    $("jev-model").value = config.jev.model;
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
    $("confidence-protection").checked = config.scoring.lowConfidenceProtection;
    $("auto-scroll").checked = config.browsing.autoScroll;
    $("dwell-ms").value = config.browsing.dwellMs;
    $("pause-ms").value = config.browsing.pauseAfterInteractionMs;
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
    savedLlmKey = settings.llm.apiKey;
    savedTavilyKey = settings.tavily.apiKey;
    clearJevKey = false;
    clearLlmKey = false;
    clearTavilyKey = false;
    $("jev-api-key").value = "";
    $("llm-api-key").value = "";
    $("tavily-api-key").value = "";
    $("jev-api-key").placeholder = savedJevKey ? "已保存；留空保留" : "输入 TypeSafe API Key";
    $("llm-api-key").placeholder = savedLlmKey ? "已保存；留空保留" : "输入 LLM API Key";
    $("jev-key-state").textContent = savedJevKey ? "Key 已保存在本地" : "尚未设置";
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
      if (!config.jev.apiKey) throw new Error("请先填写 TypeSafe API Key。");
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
    $("ollama-preset").addEventListener("click", () => {
      $("llm-provider").value = "ollama";
      $("llm-base-url").value = "http://localhost:11434/v1";
      if (!$("llm-model").value) $("llm-model").value = "llama3.2";
      setStatus("已填入本机 Ollama 预设；连接测试会申请 localhost 权限。");
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
