(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderOverlay = api;
})(globalThis, function () {
  "use strict";

  const STYLE = `
    :host { all: initial; --jev-font:-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Roboto, Helvetica, Arial, sans-serif; position:absolute; inset:0; display:block; z-index:2147483000; pointer-events:none; font-family:var(--jev-font); color:#1f2937; -webkit-font-smoothing:antialiased; }
    * { box-sizing:border-box; }
    .mask { display:none; position:absolute; inset:0; z-index:1; pointer-events:none; border-left:4px solid rgba(var(--tint-rgb,56,189,248),.5); border-radius:inherit; background:rgba(var(--tint-rgb,56,189,248),var(--tint-alpha,.1)); transition:background-color .18s ease,border-color .18s ease; }
    .mask[data-level="none"] { --tint-rgb:45,212,191; }
    .mask[data-level="light"] { --tint-rgb:56,189,248; }
    .mask[data-level="medium"] { --tint-rgb:251,191,36; }
    .mask[data-level="strong"] { --tint-rgb:248,113,113; }
    .mask.visible { display:block; }
    .rail { position:absolute; right:calc(100% + 12px); top:0; bottom:0; z-index:3; width:var(--jev-rail-w, 136px); margin:0; padding:10px 6px; display:flex; flex-direction:column; align-items:center; gap:8px; border:1px solid rgba(148,163,184,.55); border-left:4px solid rgb(var(--tint-rgb,148,163,184)); border-radius:10px 0 0 10px; background:rgba(255,255,255,.96); box-shadow:-2px 0 12px rgba(15,23,42,.16); pointer-events:auto; cursor:pointer; font:inherit; color:#334155; overflow:hidden; }
    .rail.inset { left:0; right:auto; border-radius:0 10px 10px 0; box-shadow:2px 0 12px rgba(15,23,42,.16); }
    .rail[data-level="none"] { --tint-rgb:45,212,191; --tint-deep:#0f766e; }
    .rail[data-level="light"] { --tint-rgb:56,189,248; --tint-deep:#0369a1; }
    .rail[data-level="medium"] { --tint-rgb:251,191,36; --tint-deep:#b45309; }
    .rail[data-level="strong"], .rail[data-level="error"] { --tint-rgb:248,113,113; --tint-deep:#dc2626; }
    .rail:hover { background:#fff; }
    .rail-score { font-size:20px; font-weight:700; color:#0f172a; }
    .rail-chart { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:6px; width:100%; }
    .mini-ring { position:relative; aspect-ratio:1; }
    .mini-ring.placeholder { grid-column:1 / -1; width:55%; margin:0 auto; }
    .mini-ring svg { display:block; width:100%; height:auto; }
    .mini-ring-value { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; color:#334155; }
    .rail-label { flex:none; width:100%; margin-top:auto; padding:6px 4px; border-radius:8px; text-align:center; font-size:13px; font-weight:600; line-height:1.2; color:var(--tint-deep,#64748b); background:rgba(var(--tint-rgb,148,163,184),.16); }
    .rail-hint { font-size:12px; color:#94a3b8; }
    /* Short posts: drop the ring grid and just show the result. The chart is
       taken out of flow but stays measurable so we know when it fits again. */
    .rail.compact .rail-chart { position:absolute; left:0; right:0; visibility:hidden; pointer-events:none; }
    .rail.compact .rail-score { font-size:26px; }
    .ring-track { fill:none; stroke:rgba(148,163,184,.22); stroke-width:5; }
    .ring-arc { fill:none; stroke-linecap:round; }
    /* Bar chart mode: each dimension is a label row over a bar row. When the
       rail is short, .tight drops the label rows first; shorter still and the
       whole chart collapses via .compact on the rail. */
    .rail-chart.bars { display:flex; flex-direction:column; gap:7px; }
    .mini-bar { display:flex; flex-direction:column; gap:3px; width:100%; }
    .mini-bar.placeholder { display:block; height:5px; border-radius:999px; background:rgba(148,163,184,.22); }
    .mini-bar-top { display:flex; align-items:baseline; justify-content:space-between; gap:6px; }
    .mini-bar-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; color:#475569; }
    .mini-bar-value { flex:none; font-size:10px; font-weight:600; color:#334155; font-variant-numeric:tabular-nums; }
    .mini-bar-track { height:5px; border-radius:999px; background:rgba(148,163,184,.22); overflow:hidden; }
    .mini-bar-fill { display:block; height:100%; border-radius:inherit; }
    .rail-chart.bars.tight .mini-bar-top { display:none; }
    .card { display:none; position:absolute; left:0; top:0; bottom:0; z-index:2; width:min(320px, calc(100% - 8px)); overflow:auto; padding:14px; border:1px solid rgba(148,163,184,.35); border-radius:0 14px 14px 0; background:rgba(255,255,255,.98); box-shadow:8px 0 28px rgba(15,23,42,.12); pointer-events:auto; font-size:12.5px; line-height:1.5; color:#334155; }
    .card.inset { left:calc(var(--jev-rail-w, 136px) + 8px); width:min(320px, calc(100% - var(--jev-rail-w, 136px) - 16px)); }
    .card.expanded { display:block; }
    .card[data-level="none"] { --tint-rgb:45,212,191; --tint-deep:#0f766e; }
    .card[data-level="light"] { --tint-rgb:56,189,248; --tint-deep:#0369a1; }
    .card[data-level="medium"] { --tint-rgb:251,191,36; --tint-deep:#b45309; }
    .card[data-level="strong"], .card[data-level="error"] { --tint-rgb:248,113,113; --tint-deep:#dc2626; }
    /* Head: a quiet, neutral number with the verdict carried by a soft chip,
       so the score reads as information instead of an alarm. */
    .card-head { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; }
    .heading { margin-bottom:5px; color:#0f172a; font-size:13px; font-weight:600; }
    .score-line { display:flex; align-items:baseline; gap:3px; margin-top:3px; }
    .score { font-size:27px; font-weight:600; line-height:1; letter-spacing:-.02em; color:#0f172a; font-variant-numeric:tabular-nums; }
    .score-unit { color:#94a3b8; font-size:12px; }
    .level-chip { flex:none; padding:3px 9px; border-radius:999px; background:rgba(var(--tint-rgb,148,163,184),.14); color:var(--tint-deep,#475569); font-size:11px; font-weight:600; }
    .score-bar { height:4px; margin:10px 0; border-radius:999px; background:rgba(148,163,184,.16); overflow:hidden; }
    .score-bar i { display:block; height:100%; border-radius:inherit; background:rgb(var(--tint-rgb,148,163,184)); transition:width .2s ease; }
    .caption { color:#94a3b8; font-size:11px; }
    .dimensions { margin:0; padding:0; list-style:none; }
    .dim-row { display:grid; grid-template-columns:minmax(0,1fr) 44px auto; align-items:center; gap:0 8px; padding:6px 0; border-top:1px solid rgba(148,163,184,.16); }
    .dim-row:first-child { border-top:0; }
    .dim-label { display:flex; align-items:center; gap:6px; min-width:0; color:#475569; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .dim-dot { flex:none; width:7px; height:7px; border-radius:50%; }
    .dim-meter { height:3px; border-radius:999px; background:rgba(148,163,184,.18); overflow:hidden; }
    .dim-meter i { display:block; height:100%; border-radius:inherit; }
    .dim-value { min-width:32px; text-align:right; color:#1f2937; font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; }
    .dim-value small { margin-left:1px; color:#94a3b8; font-size:10px; font-weight:500; }
    .dim-value.text { max-width:110px; font-size:11px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .notes { margin-top:9px; padding-top:9px; border-top:1px solid rgba(148,163,184,.16); display:flex; flex-direction:column; gap:3px; }
    .status { margin:6px 0; color:#9a3412; }
    .buttons { display:flex; flex-wrap:wrap; gap:6px; margin-top:11px; }
    button { border:1px solid rgba(148,163,184,.55); border-radius:999px; padding:5px 11px; background:#fff; color:#334155; font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; transition:background-color .15s ease,border-color .15s ease; }
    button:hover { border-color:#94a3b8; background:#f8fafc; }
    button.primary { border-color:transparent; background:#0f172a; color:#fff; }
    button.primary:hover { background:#1e293b; }
    button:disabled { opacity:.55; cursor:wait; }
    .uncertain { color:#b45309; font-weight:600; }
    .source { color:#047857; font-weight:600; }
  `;

  // Default rail width; the carved gutter is rail width plus a 12px gap.
  // Adjustable via the "左侧评分栏宽度" option (renderer.setRailWidth).
  const DEFAULT_RAIL_WIDTH_PX = 136;
  const RAIL_GAP_PX = 12;

  // Light, tech-flavored palette: ring arcs, card dots and level accents all
  // use the 400-weight hues; LEVEL_TEXT is a deeper companion for text.
  const RING_PALETTE = ["#38bdf8", "#2dd4bf", "#a78bfa", "#fb7185", "#fbbf24", "#4ade80"];
  const LEVEL_TEXT = { none: "#0f766e", light: "#0369a1", medium: "#b45309", strong: "#dc2626" };
  const SVG_NS = "http://www.w3.org/2000/svg";

  const DOCK_STYLE = `
    :host { all:initial; --jev-font:-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Roboto, Helvetica, Arial, sans-serif; position:fixed; top:72px; right:16px; bottom:16px; width:min(440px,calc(100vw - 32px)); z-index:2147483646; display:block; pointer-events:none; font-family:var(--jev-font); color:#172033; -webkit-font-smoothing:antialiased; }
    * { box-sizing:border-box; }
    .panel { height:100%; display:flex; flex-direction:column; overflow:hidden; border:1px solid #cbd5e1; border-radius:16px; background:rgba(255,255,255,.98); box-shadow:0 16px 48px rgba(15,23,42,.28); pointer-events:auto; }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:15px 16px 12px; border-bottom:1px solid #e2e8f0; background:linear-gradient(135deg,#f0fdfa,#f8fafc); }
    h2 { margin:0; color:#0f172a; font:700 16px/1.25 var(--jev-font); }
    .subtitle { margin-top:4px; color:#64748b; font:12px/1.35 var(--jev-font); }
    .close { flex:none; border:1px solid #cbd5e1; border-radius:8px; padding:5px 9px; background:white; color:#334155; cursor:pointer; font:12px/1.2 var(--jev-font); }
    .body { flex:1; overflow:auto; padding:15px 16px; }
    .markdown { margin:0; overflow-wrap:anywhere; color:#1e293b; font:13px/1.65 var(--jev-font); }
    .markdown h2,.markdown h3,.markdown h4 { margin:16px 0 7px; color:#0f172a; line-height:1.35; }
    .markdown h2 { font-size:16px; } .markdown h3 { font-size:14px; } .markdown h4 { font-size:13px; }
    .markdown p { margin:7px 0; white-space:pre-wrap; }
    .markdown ul { margin:7px 0; padding-left:20px; } .markdown li { margin:4px 0; }
    .status { color:#475569; font:13px/1.55 var(--jev-font); }
    .warning { margin:0 0 12px; padding:9px 10px; border-radius:8px; background:#fff7ed; color:#9a3412; font:12px/1.45 var(--jev-font); }
    .sources { margin-top:16px; padding-top:13px; border-top:1px solid #e2e8f0; }
    .sources h3 { margin:0 0 8px; font:700 13px/1.3 var(--jev-font); }
    .sources a { display:block; margin:7px 0; color:#0369a1; text-decoration:none; overflow-wrap:anywhere; font:12px/1.4 var(--jev-font); }
    .sources a:hover { text-decoration:underline; }
    footer { display:flex; justify-content:flex-end; gap:7px; padding:10px 16px; border-top:1px solid #e2e8f0; }
    footer button { border:1px solid #cbd5e1; border-radius:8px; padding:7px 10px; background:#fff; color:#0f172a; cursor:pointer; font:12px/1.2 var(--jev-font); }
    @media (max-width:700px) { :host { top:56px; right:8px; bottom:8px; width:calc(100vw - 16px); } }
  `;

  // The feed column is the outermost ancestor still (nearly) as wide as the
  // article; anything wider is page layout (nav / sidebar row). Padding it on
  // the left carves one continuous lane between the menu and the feed.
  function laneHostFor(article) {
    let host = null;
    let node = article.parentElement;
    let width = article.getBoundingClientRect().width;
    while (node && node !== article.ownerDocument.body && node !== article.ownerDocument.documentElement) {
      const nextWidth = node.getBoundingClientRect().width;
      if (!Number.isFinite(nextWidth) || nextWidth - width > 8) break;
      host = node;
      width = nextWidth;
      node = node.parentElement;
    }
    return host;
  }

  // A rail hanging outside the article is only visible if no element from the
  // article up to the lane host clips it horizontally. For "shift" lanes the
  // rail also hangs outside the host's own box, so the host is checked too.
  // If host is not an ancestor at all, report it as unusable.
  function clippedBetween(article, host, includeHost = false) {
    const view = article.ownerDocument?.defaultView;
    let node = article;
    while (node) {
      if (node === host && !includeHost) return false;
      const overflowX = view?.getComputedStyle(node).overflowX;
      if (overflowX && overflowX !== "visible") return true;
      if (node === host) return false;
      node = node.parentElement;
    }
    return true;
  }

  // X's article clips horizontal overflow itself. When its immediate wrapper
  // has the same box and allows overflow, put the overlay beside the article
  // in that wrapper so the rail can occupy the lane without adding article
  // padding (which would narrow the original post).
  function overlayParentFor(article) {
    const view = article.ownerDocument?.defaultView;
    const parent = article.parentElement;
    if (!view || !parent || view.getComputedStyle(article).overflowX === "visible") return article;
    const parentStyle = view.getComputedStyle(parent);
    if (parentStyle.position === "static" || parentStyle.overflowX !== "visible") return article;
    const articleRect = article.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const sameBox = Math.abs(articleRect.left - parentRect.left) <= 1
      && Math.abs(articleRect.top - parentRect.top) <= 1
      && Math.abs(articleRect.width - parentRect.width) <= 1
      && Math.abs(articleRect.height - parentRect.height) <= 1;
    const sameOrigin = [
      parentStyle.paddingTop, parentStyle.paddingRight, parentStyle.paddingBottom, parentStyle.paddingLeft,
      parentStyle.borderTopWidth, parentStyle.borderRightWidth, parentStyle.borderBottomWidth, parentStyle.borderLeftWidth
    ].every((value) => (Number.parseFloat(value) || 0) === 0);
    return sameBox && sameOrigin && articleRect.width > 0 ? parent : article;
  }

  // One ring per scoring dimension; the arc fill is the normalized score.
  // Choice dimensions take their option position as the fill fraction.
  function ringFraction(dimension, question) {
    if (Number.isFinite(dimension?.normalizedScore)) return Math.max(0, Math.min(1, dimension.normalizedScore));
    if (dimension?.type === "choice" && typeof dimension.selectedChoice === "string" && question?.criteria) {
      const keys = Object.keys(question.criteria);
      const index = keys.indexOf(dimension.selectedChoice);
      if (index >= 0) return keys.length > 1 ? index / (keys.length - 1) : 1;
    }
    return null;
  }

  // One small donut per scoring dimension, laid out two per row. Arc fill is
  // the normalized score; choice dimensions use their option position.
  function buildRingChart(document, dimensions, config, placeholderColor) {
    const R = 16;
    const CIRCUMFERENCE = 2 * Math.PI * R;
    const miniRing = (color, fraction, centerText, tipText) => {
      const box = document.createElement("div");
      box.className = "mini-ring";
      if (tipText) box.title = tipText;
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 40 40");
      const track = document.createElementNS(SVG_NS, "circle");
      track.setAttribute("cx", "20");
      track.setAttribute("cy", "20");
      track.setAttribute("r", String(R));
      track.setAttribute("class", "ring-track");
      svg.append(track);
      if (fraction !== null && fraction !== undefined) {
        const arc = document.createElementNS(SVG_NS, "circle");
        arc.setAttribute("cx", "20");
        arc.setAttribute("cy", "20");
        arc.setAttribute("r", String(R));
        arc.setAttribute("class", "ring-arc");
        arc.setAttribute("stroke", color);
        arc.setAttribute("stroke-width", "5");
        arc.setAttribute("stroke-dasharray", `${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`);
        arc.setAttribute("transform", "rotate(-90 20 20)");
        svg.append(arc);
      }
      const value = document.createElement("span");
      value.className = "mini-ring-value";
      value.textContent = centerText;
      box.append(svg, value);
      return box;
    };
    const entries = placeholderColor ? [] : (dimensions || []).slice(0, RING_PALETTE.length);
    if (!entries.length) {
      const placeholder = miniRing(null, null, "", "");
      placeholder.querySelector(".ring-track").style.stroke = placeholderColor || "#cbd5e1";
      placeholder.classList.add("placeholder");
      return [placeholder];
    }
    return entries.map((dimension, index) => {
      const color = RING_PALETTE[index % RING_PALETTE.length];
      const question = config?.questions?.find((item) => item.id === dimension.id);
      const fraction = ringFraction(dimension, question);
      const centerText = fraction === null ? "—" : String(Math.round(fraction * 100));
      const tip = dimension.type === "choice"
        ? `${dimension.label}: ${dimension.selectedChoice}`
        : `${dimension.label} ${Math.round((fraction ?? 0) * 100)}%`;
      return miniRing(color, fraction, centerText, tip);
    });
  }

  // Alternative chart style ("一行一条"): every dimension is a label row over
  // a horizontal fill bar, so the rail reads top to bottom.
  function buildBarChart(document, dimensions, config, placeholderColor) {
    const entries = placeholderColor ? [] : (dimensions || []).slice(0, RING_PALETTE.length);
    if (!entries.length) {
      const enabled = (config?.questions || []).filter((item) => item.enabled !== false).length;
      const count = Math.max(1, Math.min(8, enabled || 4));
      return Array.from({ length: count }, () => {
        const row = document.createElement("div");
        row.className = "mini-bar placeholder";
        row.style.background = placeholderColor || "#cbd5e1";
        return row;
      });
    }
    return entries.map((dimension, index) => {
      const color = RING_PALETTE[index % RING_PALETTE.length];
      const question = config?.questions?.find((item) => item.id === dimension.id);
      const fraction = ringFraction(dimension, question);
      const row = document.createElement("div");
      row.className = "mini-bar";
      row.title = dimension.type === "choice"
        ? `${dimension.label}: ${dimension.selectedChoice}`
        : `${dimension.label} ${Math.round((fraction ?? 0) * 100)}%`;
      const top = document.createElement("div");
      top.className = "mini-bar-top";
      top.append(
        makeElement(document, "span", "mini-bar-label", dimension.label),
        makeElement(document, "span", "mini-bar-value", fraction === null ? "—" : String(Math.round(fraction * 100)))
      );
      const track = document.createElement("span");
      track.className = "mini-bar-track";
      if (fraction !== null && fraction !== undefined) {
        const fill = document.createElement("i");
        fill.className = "mini-bar-fill";
        fill.style.width = `${Math.round(fraction * 100)}%`;
        fill.style.background = color;
        track.append(fill);
      }
      row.append(top, track);
      return row;
    });
  }

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
      // element -> original inline layout/position styles for feed columns
      this.lanes = new Map();
      // document -> resolved feed column element (one lane per page)
      this.laneHosts = new WeakMap();
      this.railWidth = DEFAULT_RAIL_WIDTH_PX;
      this.chartStyle = "rings";
      this.enabled = true;
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
        state.railObserver?.disconnect();
        this.applyGutter(state, false);
        state.host.remove();
        this.states.delete(article);
        state = undefined;
      }
      if (state) return state;
      const lane = this.laneHost(article);
      const overlayParent = lane?.mode === "shift" ? overlayParentFor(article) : article;
      const view = article.ownerDocument.defaultView;
      if (view?.getComputedStyle(article).position === "static") article.style.position = "relative";
      const host = article.ownerDocument.createElement("div");
      host.dataset.jevOverlay = "1";
      host.style.cssText = "position:absolute;inset:0;display:block;overflow:visible;pointer-events:none;z-index:2147483000;";
      host.style.setProperty("--jev-rail-w", `${this.railWidth}px`);
      const shadow = host.attachShadow({ mode: "open" });
      const style = article.ownerDocument.createElement("style");
      style.textContent = STYLE;
      const mask = makeElement(article.ownerDocument, "div", "mask");
      const card = makeElement(article.ownerDocument, "section", "card");
      card.setAttribute("aria-label", "Jev 帖子评分");
      const rail = makeElement(article.ownerDocument, "button", "rail");
      rail.type = "button";
      rail.setAttribute("aria-expanded", "false");
      rail.setAttribute("aria-label", "Jev 评分详情");
      rail.title = "展开评分详情";
      const railScore = makeElement(article.ownerDocument, "span", "rail-score", "…");
      const railChart = makeElement(article.ownerDocument, "div", "rail-chart");
      const railLabel = makeElement(article.ownerDocument, "span", "rail-label", "等待判断");
      const railHint = makeElement(article.ownerDocument, "span", "rail-hint", "›");
      rail.append(railScore, railChart, railLabel, railHint);
      shadow.append(style, mask, card, rail);
      overlayParent.append(host);
      state = { article, postId, host, shadow, mask, card, rail, railChart, railScore, railLabel, railHint, result: null, config: null, revealed: false, expanded: false, railMode: "lane", gutterApplied: false, originalPaddingLeft: "", deepOpen: false, compactMin: 0 };
      rail.addEventListener("click", () => {
        state.expanded = !state.expanded;
        this.updateExpansion(state);
      });
      const ResizeObserverImpl = view?.ResizeObserver;
      if (typeof ResizeObserverImpl === "function") {
        const observer = new ResizeObserverImpl(() => this.updateCompact(state));
        observer.observe(rail);
        state.railObserver = observer;
      }
      if (lane && !clippedBetween(overlayParent, lane.host, lane.mode === "shift")) {
        this.applyLane(lane);
      } else {
        // An ancestor clips content outside the article, or no feed column was
        // found: fall back to a gutter carved inside the post itself.
        state.railMode = "inset";
        rail.classList.add("inset");
        card.classList.add("inset");
        this.applyGutter(state, true);
      }
      this.states.set(article, state);
      return state;
    }

    // Short posts cannot fit the chart: collapse to score + label. Bar charts
    // get a middle tier (.tight) that drops the label rows but keeps the bars
    // before the whole chart is hidden. The hidden chart keeps its layout
    // size (absolute + visibility) so needed height stays measurable and tall
    // posts restore automatically.
    updateCompact(state) {
      const rail = state?.rail;
      if (!rail?.isConnected) return;
      const view = rail.ownerDocument?.defaultView;
      const cs = view?.getComputedStyle(rail);
      if (!cs) return;
      const chart = state.railChart;
      const bars = chart.classList.contains("bars");
      // Measure the full chart first so both directions are decided from the
      // same numbers; the decided classes are applied at the end.
      if (bars) chart.classList.remove("tight");
      const fullChart = chart.offsetHeight;
      const padding = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
      const gap = Number.parseFloat(cs.rowGap || cs.gap) || 0;
      const kids = [state.railScore, chart, state.railLabel, state.railHint];
      const needed = padding + kids.reduce((sum, el) => sum + (el?.offsetHeight || 0), 0) + gap * (kids.length - 1);
      let compact = needed > 0 && rail.clientHeight < needed - 1;
      let tight = false;
      if (bars && compact) {
        // Labels don't fit: if the bars-only height does, keep the chart and
        // drop just the label rows instead of hiding everything.
        chart.classList.add("tight");
        const neededTight = needed - fullChart + chart.offsetHeight;
        if (rail.clientHeight >= neededTight - 1) {
          tight = true;
          compact = false;
        }
      }
      chart.classList.toggle("tight", tight);
      rail.classList.toggle("compact", compact);
    }

    renderPending(article, post, message = "接近视口时开始 Jev 判断") {
      const state = this.ensureState(article, post.postId);
      state.post = post;
      state.result = null;
      state.error = null;
      state.mask.classList.remove("visible");
      state.rail.dataset.level = "pending";
      state.railScore.textContent = "…";
      state.railScore.style.color = "";
      state.railLabel.textContent = "等待判断";
      this.renderRailChart(state, null, null, "#cbd5e1");
      state.card.dataset.level = "pending";
      state.card.replaceChildren(
        makeElement(article.ownerDocument, "div", "heading", "Jev X Reader"),
        makeElement(article.ownerDocument, "div", "caption", message)
      );
      this.updateCompact(state);
    }

    renderError(article, post, error, config) {
      const state = this.ensureState(article, post.postId);
      state.post = post;
      state.result = null;
      state.error = error;
      state.config = config || state.config;
      state.mask.classList.remove("visible");
      state.rail.dataset.level = "error";
      state.railScore.textContent = "!";
      state.railScore.style.color = "#f87171";
      state.railLabel.textContent = "分析失败";
      this.renderRailChart(state, null, null, "#f87171");
      const title = makeElement(article.ownerDocument, "div", "heading", "Jev 暂不可用");
      const detail = makeElement(article.ownerDocument, "div", "status", error?.message || "分析失败。");
      const retry = createButton(article.ownerDocument, "重试", "primary", () => this.callbacks.onRetry?.(article, post));
      const settings = createButton(article.ownerDocument, "设置", "", () => this.callbacks.onSettings?.());
      const buttons = makeElement(article.ownerDocument, "div", "buttons");
      buttons.append(retry, settings);
      state.card.dataset.level = "error";
      state.card.replaceChildren(title, detail, buttons);
      this.updateCompact(state);
    }

    // Weights, thresholds and other display settings change without new Jev
    // requests, so the composite is always recomputed against the live config.
    compositeFor(result, config) {
      try {
        if (Array.isArray(result?.dimensions) && config?.questions) {
          return globalThis.JevXReaderCore.calculateComposite(result.dimensions, config.questions);
        }
      } catch {
        // Fall through to the composite stored with the result.
      }
      return result?.composite || { score: 0 };
    }

    renderResult(article, post, result, config) {
      const state = this.ensureState(article, post.postId);
      state.post = post;
      state.result = result;
      state.error = null;
      state.config = config;
      const document = article.ownerDocument;
      const composite = this.compositeFor(result, config);
      const score = Math.round((composite?.score || 0) * 100);
      const confidence = composite?.confidence;
      const isUncertain = !Number.isFinite(confidence) || confidence < config.scoring.confidenceFloor;
      state.maskLevel = globalThis.JevXReaderCore.maskLevelForScore(composite?.score || 0, confidence, config.scoring);
      const levelLabels = { none: "高价值", light: "值得关注", medium: "一般相关", strong: "低相关" };
      state.card.dataset.level = state.maskLevel;
      // Head: caption, the composite out of 100 and the verdict as a soft chip,
      // so the number reads as information rather than an alarm. The tinted bar
      // below carries the level color instead of the digits themselves.
      const head = makeElement(document, "div", "card-head");
      const scoreBox = document.createElement("div");
      const scoreLine = makeElement(document, "div", "score-line");
      const scoreElement = makeElement(document, "span", "score", String(score));
      scoreLine.append(scoreElement, makeElement(document, "span", "score-unit", "/100"));
      scoreBox.append(makeElement(document, "div", "caption", "插件综合分"), scoreLine);
      head.append(scoreBox, makeElement(document, "span", "level-chip", levelLabels[state.maskLevel] || "已评分"));
      const scoreBar = makeElement(document, "div", "score-bar");
      const scoreFill = document.createElement("i");
      scoreFill.style.width = `${Math.max(0, Math.min(100, score))}%`;
      scoreBar.append(scoreFill);
      const rows = makeElement(document, "ul", "dimensions");
      const showDimensions = config.scoring.showDimensionScores;
      if (showDimensions) {
        for (const [index, dimension] of (result.dimensions || []).entries()) {
          const question = config.questions?.find((item) => item.id === dimension.id);
          const fraction = ringFraction(dimension, question);
          const color = RING_PALETTE[index % RING_PALETTE.length];
          const dot = makeElement(document, "span", "dim-dot");
          dot.style.background = color;
          const labelElement = makeElement(document, "span", "dim-label");
          labelElement.append(dot, document.createTextNode(dimension.label));
          const meter = makeElement(document, "span", "dim-meter");
          const meterFill = document.createElement("i");
          meterFill.style.width = `${Math.round((fraction ?? 0) * 100)}%`;
          meterFill.style.background = color;
          meter.append(meterFill);
          // One percent (or the chosen option) per row; the raw score, noul,
          // confidence and probabilities stay available as a row tooltip.
          const isChoice = dimension.type === "choice" && typeof dimension.selectedChoice === "string";
          const valueElement = makeElement(document, "span", `dim-value${isChoice ? " text" : ""}`);
          if (isChoice) {
            valueElement.textContent = dimension.selectedChoice;
          } else if (fraction === null) {
            valueElement.textContent = "—";
          } else {
            valueElement.append(
              document.createTextNode(String(Math.round(fraction * 100))),
              makeElement(document, "small", "", "%")
            );
          }
          const tips = [];
          if (dimension.type === "score" && Number.isFinite(dimension.score)) {
            tips.push(`Score ${dimension.score.toFixed(2)}/${Math.max(1, (question?.criteria?.length || 2) - 1)}`);
          }
          if (dimension.type === "noul" && Number.isFinite(dimension.noul)) tips.push(`Noul ${Math.round(dimension.noul * 100)}%`);
          if (Number.isFinite(dimension.confidence)) tips.push(`置信度 ${Math.round(dimension.confidence * 100)}%`);
          if (dimension.probabilities) tips.push(`Jev probabilities: ${JSON.stringify(dimension.probabilities)}`);
          const row = makeElement(document, "li", "dim-row");
          if (tips.length) row.title = tips.join(" · ");
          row.append(labelElement, meter, valueElement);
          rows.append(row);
        }
      }
      const confidenceRow = makeElement(document, "span", `caption${isUncertain ? " uncertain" : ""}`, isUncertain
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
      // Confidence, extraction caveats and source hints share one quiet block
      // under a hairline, so they never compete with the score.
      const notes = makeElement(document, "div", "notes");
      notes.append(confidenceRow);
      const quality = post?.extractionQuality;
      const qualityHints = [];
      if (quality?.textTruncated || quality?.quoteTruncated || quality?.suspectedCollapsed) {
        qualityHints.push("正文可能不完整");
      }
      if (quality?.mediaAltOnly) qualityHints.push("未读取图片/视频内容");
      if (qualityHints.length) notes.append(makeElement(document, "span", "caption", qualityHints.join("；")));
      if (source) notes.append(makeElement(document, "span", "source", "包含一手来源线索"));
      state.card.replaceChildren(head, scoreBar, rows, notes, buttons);
      state.deepButton = deepButton;
      state.rail.dataset.level = state.maskLevel;
      const levelTextColor = LEVEL_TEXT[state.maskLevel] || "";
      state.railScore.textContent = String(score);
      state.railScore.style.color = levelTextColor;
      state.railLabel.textContent = levelLabels[state.maskLevel] || "已评分";
      this.renderRailChart(state, result.dimensions, config);
      state.mask.style.setProperty("--tint-alpha", String(Math.max(0.035, Math.min(0.2, 0.2 - (composite?.score || 0) * 0.16))));
      this.updateMask(state);
      this.updateCompact(state);
      if (state.deepMarkdown) this.showDeepAnalysis(state, state.deepMarkdown, state.deepSources, state.deepResearch);
    }

    showDeepLoading(article, state) {
      state.deepMarkdown = undefined;
      state.deepSources = [];
      state.deepResearch = {};
      state.deepButton && (state.deepButton.disabled = true);
      state.deepButton && (state.deepButton.textContent = "解析中…");
      const dock = this.openDock(state, "正在检索并调用 LLM");
      const document = article.ownerDocument;
      dock.body.replaceChildren(makeElement(document, "div", "status", "正在准备帖子上下文、检索网页证据并生成解释…"));
      const cancel = createButton(document, "取消解析", "", () => {
        state.deepCancelled = true;
        this.callbacks.onDeepCancel?.(state);
        state.deepButton && (state.deepButton.disabled = false);
        state.deepButton && (state.deepButton.textContent = "深入解析");
        state.deepOpen = false;
        this.closeDock(dock);
      });
      dock.footer.replaceChildren(cancel);
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
      this.enabled = Boolean(enabled);
      for (const article of articles) {
        const state = this.states.get(article);
        if (state) {
          state.host.hidden = !enabled;
          this.applyGutter(state, enabled);
        }
      }
      if (enabled) {
        for (const article of articles) {
          const state = this.states.get(article);
          if (state?.railMode !== "lane") continue;
          const lane = this.laneHost(article);
          if (lane) this.applyLane(lane);
        }
      } else {
        this.restoreLanes();
      }
    }

    // Resolve the feed column once per document; all articles share it so the
    // lane can never be carved twice or in two different places. A null
    // answer is not cached so later articles may retry.
    laneHost(article) {
      const doc = article.ownerDocument;
      if (this.laneHosts.has(doc)) return this.laneHosts.get(doc);
      // The site adapter may name the feed column explicitly (precise) and may
      // request "shift" mode, which visually moves the whole column without
      // changing its layout width. Otherwise fall back to the generic
      // same-width ancestor walk, padded ("pad" mode).
      const provided = this.callbacks.laneContainer?.(article);
      const host = provided?.element || provided || laneHostFor(article);
      const mode = provided?.mode === "shift" ? "shift" : "pad";
      if (host && host.getBoundingClientRect().width >= 300) {
        const lane = { host, mode };
        this.laneHosts.set(doc, lane);
        return lane;
      }
      return null;
    }

    // Carve the lane beside the feed. "pad" reserves space inside the column;
    // "shift" offsets the column visually so its grid/flex width stays intact.
    applyLane(lane) {
      const host = lane?.host;
      if (!host || this.lanes.has(host)) return;
      const view = host.ownerDocument?.defaultView;
      const record = {
        mode: lane.mode,
        paddingLeft: host.style.paddingLeft || "",
        marginLeft: host.style.marginLeft || "",
        position: host.style.position || "",
        left: host.style.left || ""
      };
      if (lane.mode === "shift") {
        const computed = view?.getComputedStyle(host);
        const position = computed?.position || "";
        if (!position || position === "static") host.style.position = "relative";
        const base = Number.parseFloat(computed?.left || "") || 0;
        host.style.left = `${base + this.railWidth + RAIL_GAP_PX}px`;
      } else {
        const base = Number.parseFloat(view?.getComputedStyle(host).paddingLeft || "") || 0;
        host.style.paddingLeft = `${base + this.railWidth + RAIL_GAP_PX}px`;
      }
      this.lanes.set(host, record);
    }

    restoreLanes() {
      for (const [element, record] of this.lanes) {
        if (element.isConnected) {
          element.style.paddingLeft = record.paddingLeft;
          element.style.marginLeft = record.marginLeft;
          element.style.position = record.position;
          element.style.left = record.left;
        }
      }
      this.lanes.clear();
    }

    // Live-update the rail/lane width: restore existing padding and re-carve
    // at the new width so posts reflow consistently.
    setRailWidth(width, articles) {
      const next = Math.round(Math.max(88, Math.min(220, Number(width) || DEFAULT_RAIL_WIDTH_PX)));
      if (next === this.railWidth) return;
      this.railWidth = next;
      for (const article of articles || []) {
        this.states.get(article)?.host.style.setProperty("--jev-rail-w", `${next}px`);
      }
      if (!this.enabled) return;   // hosts hidden; padding stays restored
      this.restoreLanes();
      for (const article of articles || []) {
        const state = this.states.get(article);
        if (!state) continue;
        if (state.railMode === "lane") {
          const lane = this.laneHost(article);
          if (lane) this.applyLane(lane);
        } else {
          this.applyGutter(state, false);
          this.applyGutter(state, true);
        }
        this.updateCompact(state);
      }
    }

    // Carve a real gutter so the rail sits in empty space instead of covering
    // post content. The original inline padding is restored when the overlay
    // is disabled or the article node is recycled for another post.
    applyGutter(state, enabled) {
      const article = state.article;
      if (enabled && !state.gutterApplied) {
        state.originalPaddingLeft = article.style.paddingLeft || "";
        const view = article.ownerDocument?.defaultView;
        const base = Number.parseFloat(view?.getComputedStyle(article).paddingLeft || "") || 0;
        article.style.paddingLeft = `${base + this.railWidth + RAIL_GAP_PX}px`;
        state.gutterApplied = true;
      } else if (!enabled && state.gutterApplied) {
        article.style.paddingLeft = state.originalPaddingLeft;
        state.gutterApplied = false;
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

    updateExpansion(state) {
      state.card.classList.toggle("expanded", state.expanded);
      state.rail.setAttribute("aria-expanded", String(state.expanded));
      state.rail.title = state.expanded ? "收起评分详情" : "展开评分详情";
      state.railHint.textContent = state.expanded ? "‹" : "›";
    }

    // Live-switch between ring and bar charts: states holding a result are
    // re-rendered by applyConfig's display refresh; pending/error placeholders
    // are redrawn here so the change applies before the next analysis.
    setChartStyle(style, articles) {
      const next = style === "bars" ? "bars" : "rings";
      if (next === this.chartStyle) return;
      this.chartStyle = next;
      for (const article of articles || []) {
        const state = this.states.get(article);
        if (!state || state.result) continue;
        if (state.config) {
          state.config = { ...state.config, scoring: { ...state.config.scoring, railChartStyle: next } };
        }
        this.renderRailChart(state, null, null, state.error ? "#f87171" : "#cbd5e1");
        this.updateCompact(state);
      }
    }

    // One ring or one bar row per scoring dimension, colored to match the dots
    // in front of each dimension row in the expanded card; composite score
    // sits above the chart.
    renderRailChart(state, dimensions, config, placeholderColor) {
      const effective = config || state.config;
      // Keep this.chartStyle in sync with the newest config seen so pending
      // placeholders rendered without a config use the current style.
      if (effective?.scoring?.railChartStyle) this.chartStyle = effective.scoring.railChartStyle;
      const bars = this.chartStyle === "bars";
      state.railChart.classList.toggle("bars", bars);
      const document = state.article.ownerDocument;
      state.railChart.replaceChildren(
        ...(bars
          ? buildBarChart(document, dimensions, effective, placeholderColor)
          : buildRingChart(document, dimensions, effective, placeholderColor))
      );
    }
  }

  return { OverlayRenderer };
});
