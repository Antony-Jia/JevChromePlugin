(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderOverlay = api;
})(globalThis, function () {
  "use strict";

  const STYLE = `
    :host { all: initial; position:absolute; inset:0; display:block; z-index:2147483000; pointer-events:none; font-family:Arial, sans-serif; color:#1f2937; }
    * { box-sizing:border-box; }
    .mask { display:none; position:absolute; inset:0; z-index:1; pointer-events:none; border-left:5px solid rgba(var(--tint-rgb,14,165,233),.72); border-radius:inherit; background:rgba(var(--tint-rgb,14,165,233),var(--tint-alpha,.12)); transition:background-color .18s ease,border-color .18s ease; }
    .mask[data-level="none"] { --tint-rgb:16,185,129; }
    .mask[data-level="light"] { --tint-rgb:14,165,233; }
    .mask[data-level="medium"] { --tint-rgb:245,158,11; }
    .mask[data-level="strong"] { --tint-rgb:239,68,68; }
    .mask.visible { display:block; }
    .mask-label { position:absolute; left:9px; top:9px; padding:4px 7px; border:1px solid rgba(var(--tint-rgb,14,165,233),.55); border-radius:999px; background:rgba(255,255,255,.92); color:rgb(var(--tint-rgb,14,165,233)); box-shadow:0 2px 8px rgba(15,23,42,.10); font:700 11px/1.2 Arial,sans-serif; }
    .card { position:absolute; top:8px; right:8px; z-index:2; width:min(260px, calc(100% - 16px)); max-height:calc(100% - 16px); overflow:auto; padding:10px; border:1px solid rgba(148,163,184,.55); border-radius:12px; background:rgba(255,255,255,.97); box-shadow:0 6px 22px rgba(15,23,42,.22); pointer-events:auto; font-size:12px; line-height:1.45; }
    .heading { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
    .score { font-size:18px; font-weight:700; color:#0f766e; }
    .caption { color:#64748b; font-size:11px; }
    .dimensions { display:grid; grid-template-columns:1fr auto; gap:2px 12px; margin:6px 0; }
    .dimensions span:nth-child(odd) { color:#475569; }
    .dimensions span:nth-child(even) { text-align:right; font-variant-numeric:tabular-nums; font-weight:600; }
    .status { margin:5px 0; color:#9a3412; }
    .buttons { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
    button { border:1px solid #cbd5e1; border-radius:7px; padding:5px 8px; background:#fff; color:#0f172a; font:inherit; cursor:pointer; }
    button:hover { background:#f1f5f9; }
    button.primary { border-color:#0f766e; background:#0f766e; color:#fff; }
    button:disabled { opacity:.55; cursor:wait; }
    .uncertain { color:#b45309; font-weight:600; }
    .source { color:#047857; font-weight:600; }
  `;

  const DOCK_STYLE = `
    :host { all:initial; position:fixed; top:72px; right:16px; bottom:16px; width:min(440px,calc(100vw - 32px)); z-index:2147483646; display:block; pointer-events:none; font-family:Arial,sans-serif; color:#172033; }
    * { box-sizing:border-box; }
    .panel { height:100%; display:flex; flex-direction:column; overflow:hidden; border:1px solid #cbd5e1; border-radius:16px; background:rgba(255,255,255,.98); box-shadow:0 16px 48px rgba(15,23,42,.28); pointer-events:auto; }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:15px 16px 12px; border-bottom:1px solid #e2e8f0; background:linear-gradient(135deg,#f0fdfa,#f8fafc); }
    h2 { margin:0; color:#0f172a; font:700 16px/1.25 Arial,sans-serif; }
    .subtitle { margin-top:4px; color:#64748b; font:12px/1.35 Arial,sans-serif; }
    .close { flex:none; border:1px solid #cbd5e1; border-radius:8px; padding:5px 9px; background:white; color:#334155; cursor:pointer; font:12px/1.2 Arial,sans-serif; }
    .body { flex:1; overflow:auto; padding:15px 16px; }
    .markdown { margin:0; overflow-wrap:anywhere; color:#1e293b; font:13px/1.65 Arial,sans-serif; }
    .markdown h2,.markdown h3,.markdown h4 { margin:16px 0 7px; color:#0f172a; line-height:1.35; }
    .markdown h2 { font-size:16px; } .markdown h3 { font-size:14px; } .markdown h4 { font-size:13px; }
    .markdown p { margin:7px 0; white-space:pre-wrap; }
    .markdown ul { margin:7px 0; padding-left:20px; } .markdown li { margin:4px 0; }
    .status { color:#475569; font:13px/1.55 Arial,sans-serif; }
    .warning { margin:0 0 12px; padding:9px 10px; border-radius:8px; background:#fff7ed; color:#9a3412; font:12px/1.45 Arial,sans-serif; }
    .sources { margin-top:16px; padding-top:13px; border-top:1px solid #e2e8f0; }
    .sources h3 { margin:0 0 8px; font:700 13px/1.3 Arial,sans-serif; }
    .sources a { display:block; margin:7px 0; color:#0369a1; text-decoration:none; overflow-wrap:anywhere; font:12px/1.4 Arial,sans-serif; }
    .sources a:hover { text-decoration:underline; }
    footer { display:flex; justify-content:flex-end; gap:7px; padding:10px 16px; border-top:1px solid #e2e8f0; }
    footer button { border:1px solid #cbd5e1; border-radius:8px; padding:7px 10px; background:#fff; color:#0f172a; cursor:pointer; font:12px/1.2 Arial,sans-serif; }
    @media (max-width:700px) { :host { top:56px; right:8px; bottom:8px; width:calc(100vw - 16px); } }
  `;

  function makeElement(document, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createButton(document, label, className, onClick) {
    const button = makeElement(document, "button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function renderMarkdown(document, markdown) {
    const root = makeElement(document, "div", "markdown");
    let list;
    for (const rawLine of String(markdown || "").split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (heading) {
        list = undefined;
        const level = Math.min(4, Math.max(2, heading[1].length));
        root.append(makeElement(document, `h${level}`, "", heading[2]));
      } else if (bullet) {
        if (!list) {
          list = document.createElement("ul");
          root.append(list);
        }
        list.append(makeElement(document, "li", "", bullet[1]));
      } else if (line.trim()) {
        list = undefined;
        root.append(makeElement(document, "p", "", line));
      } else {
        list = undefined;
      }
    }
    return root;
  }

  class OverlayRenderer {
    constructor(callbacks = {}) {
      this.callbacks = callbacks;
      this.states = new WeakMap();
      this.docks = new WeakMap();
      this.globalMaskEnabled = true;
    }

    ensureDock(document) {
      let dock = this.docks.get(document);
      if (dock) return dock;
      const host = document.createElement("div");
      host.dataset.jevOverlay = "1";
      host.dataset.jevDeepDock = "1";
      host.hidden = true;
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = DOCK_STYLE;
      const panel = makeElement(document, "aside", "panel");
      panel.setAttribute("aria-label", "Jev 深入解析");
      const header = document.createElement("header");
      const titles = document.createElement("div");
      const title = makeElement(document, "h2", "", "深入解析");
      const subtitle = makeElement(document, "div", "subtitle", "LLM 综合解释");
      titles.append(title, subtitle);
      const close = createButton(document, "关闭", "close", () => this.closeDock(dock));
      header.append(titles, close);
      const body = makeElement(document, "div", "body");
      const footer = document.createElement("footer");
      panel.append(header, body, footer);
      shadow.append(style, panel);
      (document.body || document.documentElement).append(host);
      dock = { host, shadow, panel, title, subtitle, body, footer, activeState: null };
      this.docks.set(document, dock);
      return dock;
    }

    openDock(state, subtitle) {
      const dock = this.ensureDock(state.article.ownerDocument);
      if (dock.activeState && dock.activeState !== state) {
        dock.activeState.deepOpen = false;
        if (dock.activeState.deepButton) dock.activeState.deepButton.textContent = "深入解析";
      }
      dock.activeState = state;
      state.deepOpen = true;
      dock.subtitle.textContent = subtitle || "LLM 综合解释";
      dock.host.hidden = false;
      return dock;
    }

    closeDock(dock) {
      if (!dock) return;
      if (dock.activeState) {
        dock.activeState.deepOpen = false;
        if (dock.activeState.deepButton) dock.activeState.deepButton.textContent = "深入解析";
      }
      dock.activeState = null;
      dock.host.hidden = true;
      dock.body.replaceChildren();
      dock.footer.replaceChildren();
    }

    ensureState(article, postId) {
      let state = this.states.get(article);
      if (state && state.postId !== postId) {
        const dock = this.docks.get(article.ownerDocument);
        if (dock?.activeState === state) this.closeDock(dock);
        state.deepPanel?.remove();
        state.deepActions?.remove();
        state.host.remove();
        this.states.delete(article);
        state = undefined;
      }
      if (state) return state;
      const view = article.ownerDocument.defaultView;
      if (view?.getComputedStyle(article).position === "static") article.style.position = "relative";
      const host = article.ownerDocument.createElement("div");
      host.dataset.jevOverlay = "1";
      host.style.cssText = "position:absolute;inset:0;display:block;overflow:visible;pointer-events:none;z-index:2147483000;";
      const shadow = host.attachShadow({ mode: "open" });
      const style = article.ownerDocument.createElement("style");
      style.textContent = STYLE;
      const mask = makeElement(article.ownerDocument, "div", "mask");
      const maskLabel = makeElement(article.ownerDocument, "div", "mask-label");
      mask.append(maskLabel);
      const card = makeElement(article.ownerDocument, "section", "card");
      card.setAttribute("aria-label", "Jev 帖子评分");
      shadow.append(style, mask, card);
      article.append(host);
      state = { article, postId, host, shadow, mask, maskLabel, card, result: null, config: null, revealed: false, deepOpen: false };
      this.states.set(article, state);
      return state;
    }

    renderPending(article, post, message = "接近视口时开始 Jev 判断") {
      const state = this.ensureState(article, post.postId);
      state.post = post;
      state.result = null;
      state.error = null;
      state.mask.classList.remove("visible");
      state.card.replaceChildren(
        makeElement(article.ownerDocument, "div", "heading", "Jev X Reader"),
        makeElement(article.ownerDocument, "div", "caption", message)
      );
    }

    renderError(article, post, error, config) {
      const state = this.ensureState(article, post.postId);
      state.post = post;
      state.result = null;
      state.error = error;
      state.config = config || state.config;
      state.mask.classList.remove("visible");
      const title = makeElement(article.ownerDocument, "div", "heading", "Jev 暂不可用");
      const detail = makeElement(article.ownerDocument, "div", "status", error?.message || "分析失败。");
      const retry = createButton(article.ownerDocument, "重试", "primary", () => this.callbacks.onRetry?.(article, post));
      const settings = createButton(article.ownerDocument, "设置", "", () => this.callbacks.onSettings?.());
      const buttons = makeElement(article.ownerDocument, "div", "buttons");
      buttons.append(retry, settings);
      state.card.replaceChildren(title, detail, buttons);
    }

    renderResult(article, post, result, config) {
      const state = this.ensureState(article, post.postId);
      state.post = post;
      state.result = result;
      state.error = null;
      state.config = config;
      const document = article.ownerDocument;
      const score = Math.round((result.composite?.score || 0) * 100);
      const title = makeElement(document, "div", "heading");
      title.append(
        makeElement(document, "span", "score", `${score} 分`),
        makeElement(document, "span", "caption", "插件综合分")
      );
      const rows = makeElement(document, "div", "dimensions");
      const showDimensions = config.scoring.showDimensionScores;
      if (showDimensions) {
        for (const dimension of result.dimensions || []) {
          const question = config.questions?.find((item) => item.id === dimension.id);
          let value = dimension.selectedChoice ? `Choice: ${dimension.selectedChoice}` : "—";
          if (dimension.type === "score" && Number.isFinite(dimension.score)) {
            const maximum = Math.max(1, (question?.criteria?.length || 2) - 1);
            value = `Score ${dimension.score.toFixed(2)}/${maximum}`;
          } else if (dimension.type === "noul" && Number.isFinite(dimension.noul)) {
            value = `Noul ${Math.round(dimension.noul * 100)}%`;
          }
          if (Number.isFinite(dimension.confidence)) value += ` · C${Math.round(dimension.confidence * 100)}%`;
          const valueElement = makeElement(document, "span", "", value);
          if (dimension.probabilities) valueElement.title = `Jev probabilities: ${JSON.stringify(dimension.probabilities)}`;
          rows.append(makeElement(document, "span", "", dimension.label), valueElement);
        }
      }
      const confidence = result.composite?.confidence;
      const isUncertain = !Number.isFinite(confidence) || confidence < config.scoring.confidenceFloor;
      const confidenceRow = makeElement(document, "div", `caption${isUncertain ? " uncertain" : ""}`, isUncertain
        ? "判断不确定，已降低遮罩强度"
        : `最低置信度 ${Math.round(confidence * 100)}%`);
      const buttons = makeElement(document, "div", "buttons");
      const toggleMask = createButton(document, state.revealed ? "显示色层" : "隐藏色层", "", () => {
        state.revealed = !state.revealed;
        this.updateMask(state);
        toggleMask.textContent = state.revealed ? "显示色层" : "隐藏色层";
      });
      const deepButton = createButton(document, "深入解析", "primary", () => {
        if (state.deepButton?.disabled) return;
        if (state.deepMarkdown) {
          if (state.deepOpen) {
            this.closeDock(this.ensureDock(article.ownerDocument));
          } else {
            this.showDeepAnalysis(state, state.deepMarkdown, state.deepSources, state.deepResearch);
          }
          return;
        }
        if (state.deepOpen) return;
        state.deepOpen = true;
        this.callbacks.onDeepAnalyze?.(article, post, result, state);
      });
      buttons.append(toggleMask, deepButton);
      const source = result.dimensions?.find((dimension) => dimension.id === "primary_source_signal" && dimension.noul >= 0.5);
      const sourceRow = source ? makeElement(document, "div", "source", "包含一手来源线索") : null;
      const children = [title, rows, confidenceRow];
      if (sourceRow) children.push(sourceRow);
      children.push(buttons);
      state.card.replaceChildren(...children);
      state.deepButton = deepButton;
      state.maskLevel = globalThis.JevXReaderCore.maskLevelForScore(result.composite?.score || 0, confidence, config.scoring);
      const levelLabels = { none: "高价值", light: "值得关注", medium: "一般相关", strong: "低相关" };
      state.maskLabel.textContent = `${levelLabels[state.maskLevel] || "已评分"} · ${score} 分`;
      state.mask.style.setProperty("--tint-alpha", String(Math.max(0.045, Math.min(0.32, 0.32 - (result.composite?.score || 0) * 0.275))));
      this.updateMask(state);
      if (state.deepMarkdown) this.showDeepAnalysis(state, state.deepMarkdown, state.deepSources, state.deepResearch);
    }

    showDeepLoading(article, state) {
      state.deepMarkdown = undefined;
      state.deepSources = [];
      state.deepResearch = {};
      state.deepButton && (state.deepButton.disabled = true);
      state.deepButton && (state.deepButton.textContent = "解析中…");
      const dock = this.openDock(state, "正在检索并调用 LLM");
      dock.body.replaceChildren(makeElement(article.ownerDocument, "div", "status", "正在准备帖子上下文、检索网页证据并生成解释…"));
      dock.footer.replaceChildren();
    }

    showDeepAnalysis(state, markdown, sources = [], research = {}) {
      state.deepMarkdown = String(markdown || "").slice(0, 16000);
      state.deepSources = Array.isArray(sources) ? sources.slice(0, 10) : [];
      state.deepResearch = research || {};
      state.deepButton && (state.deepButton.disabled = false);
      state.deepButton && (state.deepButton.textContent = "关闭深入解析");
      const dock = this.openDock(state, state.deepResearch.used ? `Tavily 已提供 ${state.deepSources.length} 个来源` : "LLM 综合解释");
      const document = state.article.ownerDocument;
      const children = [];
      if (state.deepResearch.warning) children.push(makeElement(document, "div", "warning", `联网搜索未完成：${state.deepResearch.warning}`));
      const body = renderMarkdown(document, state.deepMarkdown);
      children.push(body);
      if (state.deepSources.length) {
        const sourceBox = makeElement(document, "section", "sources");
        sourceBox.append(makeElement(document, "h3", "", "网页来源"));
        for (const source of state.deepSources) {
          const link = document.createElement("a");
          link.textContent = `[${source.id || "S"}] ${source.title || source.url}`;
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          sourceBox.append(link);
        }
        children.push(sourceBox);
      }
      dock.body.replaceChildren(...children);
      const copy = createButton(document, "复制解析", "", async () => {
        try {
          await state.article.ownerDocument.defaultView.navigator.clipboard.writeText(state.deepMarkdown);
          copy.textContent = "已复制";
        } catch {
          copy.textContent = "复制失败";
        }
      });
      const close = createButton(document, "关闭", "", () => this.closeDock(dock));
      dock.footer.replaceChildren(copy, close);
    }

    showDeepError(state, message) {
      state.deepButton && (state.deepButton.disabled = false);
      state.deepButton && (state.deepButton.textContent = "重试深入解析");
      state.deepMarkdown = undefined;
      const dock = this.openDock(state, "解析失败");
      dock.body.replaceChildren(makeElement(state.article.ownerDocument, "div", "warning", message || "LLM 分析失败。"));
      dock.footer.replaceChildren(createButton(state.article.ownerDocument, "关闭", "", () => this.closeDock(dock)));
      state.deepOpen = false;
    }

    setGlobalMaskEnabled(enabled) {
      this.globalMaskEnabled = Boolean(enabled);
      // WeakMap is intentionally non-iterable. Call this for known article states through updateArticleMasks().
    }

    setEnabled(enabled, articles) {
      for (const article of articles) {
        const state = this.states.get(article);
        if (state) state.host.hidden = !enabled;
      }
    }

    updateArticleMasks(articles) {
      for (const article of articles) {
        const state = this.states.get(article);
        if (state) this.updateMask(state);
      }
    }

    updateMask(state) {
      const configEnabled = state.config?.scoring?.maskEnabled !== false;
      const visible = Boolean(state.result && configEnabled && this.globalMaskEnabled && !state.revealed);
      state.mask.dataset.level = state.maskLevel || "none";
      state.mask.classList.toggle("visible", visible);
    }
  }

  return { OverlayRenderer };
});
