(function () {
  "use strict";

  const xHosts = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"];
  const weiboHosts = ["weibo.com", "www.weibo.com"];
  if (!/^https:$/.test(location.protocol) || ![...xHosts, ...weiboHosts].includes(location.hostname)) return;
  if (window.__jevXReaderStarted) return;
  window.__jevXReaderStarted = true;

  const Core = globalThis.JevXReaderCore;
  const isWeibo = weiboHosts.includes(location.hostname);
  const adapter = isWeibo
    ? new globalThis.JevXReaderWeiboDomAdapter.WeiboDomAdapter()
    : new globalThis.JevXReaderXDomAdapter.XDomAdapter();
  const postsById = new Map();
  // postId -> { contentHash, result }; only rendered when the hash still matches
  // the newest extracted content, so stale scores never attach to new text.
  const resultById = new Map();
  // postId -> { contentHash, promise }
  const inFlightById = new Map();
  // postId -> contentHash of the most recent extraction
  const latestHashById = new Map();
  // postId -> contentHash already requested, so the preload window does not
  // re-queue posts that failed or were triggered by the auto-scroller.
  const requestedById = new Map();
  const articleData = new WeakMap();
  const pendingArticles = new Set();
  const MAX_RESULT_ENTRIES = 300;
  let config;
  let renderer;
  let intersectionObserver;
  let mutationObserver;
  let configSignature = "";
  let inferenceSignature = "";
  let maskEnabled = true;
  let discoveredCount = 0;
  let inspectScheduled = false;
  let pruneNeeded = false;
  const toolbar = createToolbar();

  const scroller = new globalThis.JevXReaderAutoScroller.AutoScroller({
    getPosts: () => allCurrentPosts(),
    ensureAnalysis: (item) => requestAnalysis(item.article, item.post),
    onState: (state) => {
      toolbar.setAutoState(state.enabled);
      toolbar.setStatus(state.message);
    }
  });

  renderer = new globalThis.JevXReaderOverlay.OverlayRenderer({
    onDeepAnalyze: (article, post, result, state) => deepAnalyze(article, post, result, state),
    onDeepCancel: (state) => { void sendMessage({ type: "CANCEL_DEEP", postId: state.postId }); },
    onRetry: (article, post) => requestAnalysis(article, post),
    onSettings: () => sendMessage({ type: "OPEN_OPTIONS" }),
    laneContainer: (article) => adapter.laneContainer?.(article)
  });

  function createToolbar() {
    const host = document.createElement("div");
    host.dataset.jevOverlay = "1";
    host.dataset.jevToolbar = "1";
    host.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483647;pointer-events:auto;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial;font-family:Arial,sans-serif;color:#0f172a}*{box-sizing:border-box}
      section{width:260px;padding:10px;border:1px solid #cbd5e1;border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 6px 24px rgba(15,23,42,.22);font:12px/1.4 Arial,sans-serif}
      header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-weight:700}
      .status{min-height:18px;color:#64748b;overflow-wrap:anywhere}
      .buttons{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
      button{border:1px solid #cbd5e1;border-radius:7px;background:#fff;padding:6px 8px;font:inherit;cursor:pointer;color:#0f172a}
      button:hover{background:#f1f5f9}button[aria-pressed=true]{background:#0f766e;color:white;border-color:#0f766e}
      button:focus-visible{outline:2px solid #0f766e;outline-offset:2px}
    `;
    const section = document.createElement("section");
    const header = document.createElement("header");
    header.append(document.createTextNode(isWeibo ? "Jev 微博 Reader" : "Jev X Reader"));
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = "正在连接扩展后台…";
    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const auto = document.createElement("button");
    auto.type = "button";
    auto.textContent = "开启自动浏览";
    auto.setAttribute("aria-pressed", "false");
    auto.addEventListener("click", () => {
      if (!config?.enabled) {
        void sendMessage({ type: "OPEN_OPTIONS" });
        return;
      }
      if (scroller.enabled) scroller.stop();
      else scroller.start();
    });
    const mask = document.createElement("button");
    mask.type = "button";
    mask.textContent = "关闭色层";
    mask.setAttribute("aria-pressed", "true");
    mask.addEventListener("click", () => {
      maskEnabled = !maskEnabled;
      renderer?.setGlobalMaskEnabled(maskEnabled);
      renderer?.updateArticleMasks(currentArticles());
      mask.setAttribute("aria-pressed", String(maskEnabled));
      mask.textContent = maskEnabled ? "关闭色层" : "开启色层";
      pauseForToolbarAction();
    });
    const settings = document.createElement("button");
    settings.type = "button";
    settings.textContent = "设置";
    settings.addEventListener("click", () => {
      pauseForToolbarAction();
      void sendMessage({ type: "OPEN_OPTIONS" });
    });
    buttons.append(auto, mask, settings);
    section.append(header, status, buttons);
    shadow.append(style, section);
    (document.body || document.documentElement).append(host);
    return {
      host,
      status,
      auto,
      mask,
      setStatus(text) { status.textContent = String(text || ""); },
      setAutoState(enabled) {
        auto.setAttribute("aria-pressed", String(Boolean(enabled)));
        auto.textContent = enabled ? "停止自动浏览" : "开启自动浏览";
      }
    };
  }

  function pauseForToolbarAction() {
    // Clicking our own controls should not count as a page interaction pause.
  }

  async function sendMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return { ok: false, error: { code: "UNKNOWN", message: "扩展后台暂不可用，请重新加载扩展。", retryable: true } };
    }
  }

  function currentArticles() {
    const result = [];
    for (const entries of postsById.values()) {
      for (const entry of entries) if (entry.article.isConnected) result.push(entry.article);
    }
    return result;
  }

  function allCurrentPosts() {
    const grouped = new Map();
    for (const entries of postsById.values()) {
      for (const entry of entries) {
        if (!entry.article.isConnected) continue;
        const current = grouped.get(entry.post.postId);
        if (!current) {
          grouped.set(entry.post.postId, entry);
          continue;
        }
        const currentRect = current.article.getBoundingClientRect();
        const candidateRect = entry.article.getBoundingClientRect();
        const currentVisible = currentRect.bottom > 0 && currentRect.top < window.innerHeight;
        const candidateVisible = candidateRect.bottom > 0 && candidateRect.top < window.innerHeight;
        if (candidateVisible && !currentVisible) grouped.set(entry.post.postId, entry);
      }
    }
    return [...grouped.values()];
  }

  function allPostEntries() {
    const entries = [];
    for (const set of postsById.values()) {
      for (const entry of set) if (entry.article.isConnected) entries.push(entry);
    }
    return entries;
  }

  function safeContentHash(post) {
    return Core.computeContentHash(post).catch(() => null);
  }

  function rememberResult(postId, value) {
    if (!resultById.has(postId) && resultById.size >= MAX_RESULT_ENTRIES) {
      const oldest = resultById.keys().next().value;
      if (oldest !== undefined) resultById.delete(oldest);
    }
    resultById.set(postId, value);
  }

  async function registerArticle(article) {
    if (article.parentElement?.closest("article")) return;
    if (adapter.isReply?.(article)) return;   // X 评论/回复不参与评分
    const post = adapter.extract(article);
    if (!post) return;
    const contentHash = await safeContentHash(post);
    if (!contentHash) return;
    const signature = `${post.postId}:${contentHash}`;
    const previous = articleData.get(article);
    if (previous?.signature === signature) return;
    if (previous?.post?.postId && previous.post.postId !== post.postId) {
      const oldEntries = postsById.get(previous.post.postId);
      if (oldEntries) {
        for (const entry of oldEntries) if (entry.article === article) oldEntries.delete(entry);
        if (!oldEntries.size) postsById.delete(previous.post.postId);
      }
    }
    articleData.set(article, { signature, post, contentHash });
    latestHashById.set(post.postId, contentHash);
    let entries = postsById.get(post.postId);
    if (!entries) {
      entries = new Set();
      postsById.set(post.postId, entries);
      discoveredCount += 1;
    }
    const existing = [...entries].find((entry) => entry.article === article);
    if (existing) {
      existing.post = post;
    } else {
      entries.add({ article, post });
    }
    const stored = resultById.get(post.postId);
    if (stored?.contentHash === contentHash && stored.result && config) {
      renderer.renderResult(article, post, stored.result, config);
    } else if (config?.enabled) {
      renderer.renderPending(article, post);
      if (intersectionObserver) intersectionObserver.observe(article);
    }
    toolbar.setStatus(config?.enabled ? `已发现 ${discoveredCount} 条帖子；接近视口时分析` : "扩展已关闭，请到设置中重新启用");
  }

  function scheduleArticles(articles) {
    for (const article of articles) if (article?.matches?.("article")) pendingArticles.add(article);
    if (inspectScheduled || (!pendingArticles.size && !pruneNeeded)) return;
    inspectScheduled = true;
    requestAnimationFrame(() => {
      inspectScheduled = false;
      const batch = [...pendingArticles].filter((article) => article.isConnected);
      pendingArticles.clear();
      pruneNeeded = false;
      pruneDisconnectedArticles();
      // Registration is async (content hashing); evaluate the preload window
      // only after this batch has been indexed.
      void Promise.all(batch.map((article) => registerArticle(article))).then(() => ensureAhead());
    });
  }

  function pruneDisconnectedArticles() {
    for (const [postId, entries] of postsById) {
      for (const entry of entries) {
        if (entry.article.isConnected) continue;
        // Articles stay observed so scroll crossings re-evaluate the preload
        // window; release nodes once they leave the DOM.
        intersectionObserver?.unobserve(entry.article);
        entries.delete(entry);
      }
      if (!entries.size) {
        postsById.delete(postId);
        latestHashById.delete(postId);
        requestedById.delete(postId);
      }
    }
  }

  async function analyzeForPost(post) {
    const contentHash = await safeContentHash(post);
    const stored = resultById.get(post.postId);
    if (stored?.contentHash === contentHash && stored.result) {
      return { ok: true, postId: post.postId, result: stored.result, cached: true };
    }
    const inFlight = inFlightById.get(post.postId);
    if (inFlight?.contentHash === contentHash) return inFlight.promise;
    const requestInference = inferenceSignature;
    let promise;
    promise = sendMessage({ type: "ANALYZE_POST", requestId: crypto.randomUUID(), post }).then((response) => {
      // Only inference-affecting changes invalidate in-flight results; display
      // setting changes (thresholds, dwell time) must not drop them.
      if (requestInference !== inferenceSignature) return { ok: true, postId: post.postId, stale: true };
      scroller.noteAnalysisResult(response);
      const stillCurrent = latestHashById.get(post.postId) === contentHash;
      if (response?.ok && response.result) {
        const existingResult = resultById.get(post.postId);
        if (stillCurrent || !existingResult || existingResult.contentHash !== latestHashById.get(post.postId)) {
          rememberResult(post.postId, { contentHash, result: response.result });
        }
        if (stillCurrent) {
          for (const entry of postsById.get(post.postId) || []) {
            if (entry.article.isConnected) renderer.renderResult(entry.article, entry.post, response.result, config);
          }
        }
        toolbar.setStatus(`Jev 分析完成：${post.postId}`);
      } else {
        if (stillCurrent) {
          for (const entry of postsById.get(post.postId) || []) {
            if (entry.article.isConnected) renderer.renderError(entry.article, entry.post, response?.error, config);
          }
        }
        toolbar.setStatus(response?.error?.message || "Jev 分析失败");
      }
      return response;
    }).catch(() => {
      if (requestInference !== inferenceSignature) return { ok: true, postId: post.postId, stale: true };
      const response = { ok: false, error: { code: "UNKNOWN", message: "扩展后台暂不可用。", retryable: true } };
      scroller.noteAnalysisResult(response);
      if (latestHashById.get(post.postId) === contentHash) {
        for (const entry of postsById.get(post.postId) || []) {
          if (entry.article.isConnected) renderer.renderError(entry.article, entry.post, response.error, config);
        }
      }
      return response;
    }).finally(() => {
      if (inFlightById.get(post.postId)?.promise === promise) inFlightById.delete(post.postId);
    });
    inFlightById.set(post.postId, { contentHash, promise });
    return promise;
  }

  function requestAnalysis(article, post) {
    const data = articleData.get(article);
    const latest = data?.post || post;
    if (latest?.postId && data?.contentHash) requestedById.set(latest.postId, data.contentHash);
    return analyzeForPost(latest);
  }

  function entryNeedsAnalysis(entry) {
    const data = articleData.get(entry.article);
    const post = data?.post || entry.post;
    if (!post?.postId || !data?.contentHash) return false;
    const stored = resultById.get(post.postId);
    if (stored?.contentHash === data.contentHash && stored.result) return false;
    if (inFlightById.get(post.postId)?.contentHash === data.contentHash) return false;
    return requestedById.get(post.postId) !== data.contentHash;
  }

  // Posts in or above the viewport are analyzed immediately; below the fold
  // only the first `preloadAhead` posts are requested, so scrolling moves the
  // window instead of draining the whole feed.
  function ensureAhead() {
    if (!config?.enabled) return;
    const preloadAhead = Math.max(0, Math.round(Number(config.browsing?.preloadAhead ?? 3)));
    const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
    const entries = allPostEntries()
      .map((entry) => ({ entry, rect: entry.article.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top);
    let belowIndex = 0;
    for (const { entry, rect } of entries) {
      if (rect.top >= viewportBottom) {
        belowIndex += 1;
        if (belowIndex > preloadAhead) break;
      }
      if (entryNeedsAnalysis(entry)) void requestAnalysis(entry.article, entry.post);
    }
  }

  async function deepAnalyze(article, post, result, state) {
    if (state.deepButton?.disabled) return;
    scroller.pauseForInteraction();
    state.deepCancelled = false;
    renderer.showDeepLoading(article, state);
    const requestPostId = post.postId;
    // Always send the freshest snapshot so the background can rebuild session
    // context without forcing a full page reload.
    const latest = articleData.get(article)?.post || post;
    const response = await sendMessage({ type: "DEEP_ANALYZE", requestId: crypto.randomUUID(), postId: post.postId, post: latest });
    if (renderer.states.get(article) !== state || state.postId !== requestPostId) return;
    if (state.deepCancelled) return;
    if (response?.ok && typeof response.markdown === "string") {
      renderer.showDeepAnalysis(state, response.markdown, response.sources, response.research);
    } else {
      renderer.showDeepError(state, response?.error?.message || "LLM 分析失败，请检查设置。");
    }
  }

  function getArticlesFromMutation(node, target) {
    const found = [];
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.closest?.("[data-jev-overlay]")) return found;
      if (node.matches?.("article")) found.push(node);
      found.push(...Array.from(node.querySelectorAll?.("article") || []));
    }
    const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const containingArticle = parent?.closest?.("article") || target?.closest?.("article");
    if (containingArticle && !containingArticle.closest("[data-jev-overlay]")) found.push(containingArticle);
    return found;
  }

  function observeDocument() {
    // Boundary crossings are the scroll signal; ensureAhead recomputes which
    // posts fall inside the viewport and the preload window from geometry.
    intersectionObserver = new IntersectionObserver(() => ensureAhead(), { threshold: 0.01 });

    mutationObserver = new MutationObserver((records) => {
      const articles = new Set();
      for (const record of records) {
        if (record.type === "characterData") {
          // Text-only edits (e.g. expanded long posts) must re-run extraction.
          if (record.target?.parentElement?.closest?.("[data-jev-overlay]")) continue;
          const article = record.target?.parentElement?.closest?.("article");
          if (article) articles.add(article);
          continue;
        }
        if (record.removedNodes?.length) pruneNeeded = true;
        for (const node of record.addedNodes) {
          for (const article of getArticlesFromMutation(node, record.target)) articles.add(article);
        }
      }
      scheduleArticles(articles);
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scheduleArticles(adapter.scan(document));
  }

  function applyConfig(nextConfig) {
    const nextSignature = JSON.stringify(nextConfig);
    if (nextSignature === configSignature) return;
    const hadConfig = Boolean(config);
    const previousConfig = config;
    const nextInferenceSignature = JSON.stringify(Core.analysisConfigPayload(nextConfig));
    const inferenceChanged = hadConfig && nextInferenceSignature !== inferenceSignature;
    config = nextConfig;
    configSignature = nextSignature;
    inferenceSignature = nextInferenceSignature;
    scroller.configure(config);
    maskEnabled = config.scoring.maskEnabled;
    toolbar.mask.setAttribute("aria-pressed", String(maskEnabled));
    toolbar.mask.textContent = maskEnabled ? "关闭色层" : "开启色层";
    renderer.setGlobalMaskEnabled(maskEnabled && config.enabled);
    renderer.setEnabled(config.enabled, currentArticles());
    renderer.setRailWidth(config.browsing.railWidth, currentArticles());
    renderer.setChartStyle(config.scoring.railChartStyle, currentArticles());
    if (hadConfig) {
      if (inferenceChanged) {
        // Model, preferences or question prompts changed: cached scores no
        // longer describe this inference setup, so re-analyze from scratch.
        resultById.clear();
        inFlightById.clear();
        requestedById.clear();
        for (const entry of allPostEntries()) {
          if (config.enabled) {
            renderer.renderPending(entry.article, entry.post, "偏好或模型已更改，等待重新判断");
            intersectionObserver?.observe(entry.article);
          }
        }
      } else {
        // Display/scoring-only changes (weights, thresholds, dwell time):
        // recompute composites and masks locally without new requests.
        for (const entry of allPostEntries()) {
          const stored = resultById.get(entry.post.postId);
          const entryHash = articleData.get(entry.article)?.contentHash;
          if (stored?.result && stored.contentHash === entryHash) {
            renderer.renderResult(entry.article, entry.post, stored.result, config);
          }
        }
      }
      renderer.updateArticleMasks(currentArticles());
      renderer.setEnabled(config.enabled, currentArticles());
      if (!config.enabled) scroller.stop("扩展已关闭");
      else if (!previousConfig.enabled && config.browsing.autoScroll) scroller.start();
      else if (previousConfig.browsing.autoScroll !== config.browsing.autoScroll) {
        if (config.browsing.autoScroll) scroller.start();
        else scroller.stop("设置已关闭自动浏览");
      }
    }
    if (config.enabled) {
      toolbar.setStatus("扩展已就绪；自动识别接近视口的帖子");
      if (config.browsing.autoScroll && !hadConfig) scroller.start();
    } else {
      toolbar.setStatus("扩展已关闭，请到设置中重新启用");
      scroller.stop("扩展已关闭");
    }
    if (!hadConfig && config.enabled) {
      for (const entry of allPostEntries()) {
        renderer.renderPending(entry.article, entry.post);
        intersectionObserver?.observe(entry.article);
      }
    }
    if (config.enabled) {
      // Re-observe in case posts were registered while the extension was off,
      // then (re)evaluate the preload window for the new config.
      for (const entry of allPostEntries()) intersectionObserver?.observe(entry.article);
      ensureAhead();
    }
  }

  async function refreshConfig() {
    const response = await sendMessage({ type: "GET_PUBLIC_CONFIG" });
    if (!response?.ok || !response.config) {
      toolbar.setStatus(response?.error?.message || "扩展后台暂不可用，请重新加载扩展");
      return;
    }
    applyConfig(response.config);
  }

  function handleUserInteraction(event) {
    if (event?.composedPath?.().includes(toolbar.host)) return;
    if (event?.target?.closest?.("[data-jev-overlay]")) return;
    scroller.pauseForInteraction();
  }

  function start() {
    document.addEventListener("wheel", handleUserInteraction, { passive: true, capture: true });
    document.addEventListener("keydown", handleUserInteraction, true);
    document.addEventListener("click", handleUserInteraction, true);
    document.addEventListener("touchstart", handleUserInteraction, { passive: true, capture: true });
    document.addEventListener("selectionchange", handleUserInteraction, true);
    observeDocument();
    void refreshConfig();
    setInterval(() => void refreshConfig(), 15000);
  }

  start();
})();
