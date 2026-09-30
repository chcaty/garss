"use strict";

(() => {
  const PAGE_SIZE = 50;
  const STORAGE_KEY = "garss-review-decisions-v1";
  const CANDIDATE_ENDPOINT = "./api/v1/feed-candidates.json";
  const ROUTE_ENDPOINT = "./api/v1/rsshub-routes.json";
  const REVIEW_SCHEMA_ENDPOINT = "./api/v1/review-schema.json";
  const numberFormat = new Intl.NumberFormat("zh-CN");
  const dateFormat = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const state = {
    candidates: [],
    candidateGeneratedAt: "",
    filteredCandidates: [],
    candidatePage: 1,
    selectedIds: new Set(),
    decisions: loadDecisions(),
    routes: [],
    routesLoaded: false,
    filteredRoutes: [],
    routePage: 1,
    toastTimer: null,
    deferredInstallPrompt: null,
  };

  const byId = (id) => document.getElementById(id);

  function loadDecisions() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored)
        ? stored
        : {};
    } catch {
      return {};
    }
  }

  function saveDecisions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.decisions));
    } catch {
      showToast("浏览器拒绝保存本地记录，请及时导出审核结果");
    }
  }

  function decisionStatus(id) {
    const status = state.decisions[id]?.status;
    return status === "approved" || status === "rejected" ? status : "pending";
  }

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("zh-CN");
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function element(tag, options = {}) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.title) node.title = options.title;
    return node;
  }

  function appendBadge(container, text, className = "") {
    const badge = element("span", {
      className: `badge${className ? ` ${className}` : ""}`,
      text,
    });
    container.append(badge);
  }

  function appendBadges(container, values, limit = 3) {
    const cleanValues = [...new Set((values || []).filter(Boolean))];
    cleanValues.slice(0, limit).forEach((value) => appendBadge(container, value));
    if (cleanValues.length > limit) {
      appendBadge(container, `+${cleanValues.length - limit}`);
    }
  }

  function externalLink(label, url) {
    const safeUrl = safeExternalUrl(url);
    if (!safeUrl) return null;
    const link = element("a", { text: label });
    link.href = safeUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function showToast(message) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  function populateSelect(select, values) {
    [...new Set(values.filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "zh-CN"))
      .forEach((value) => {
        const option = element("option", { text: value });
        option.value = value;
        select.append(option);
      });
  }

  function renderMetrics() {
    let approved = 0;
    let rejected = 0;
    state.candidates.forEach((candidate) => {
      const status = decisionStatus(candidate.id);
      if (status === "approved") approved += 1;
      if (status === "rejected") rejected += 1;
    });
    byId("metric-total").textContent = numberFormat.format(state.candidates.length);
    byId("metric-approved").textContent = numberFormat.format(approved);
    byId("metric-rejected").textContent = numberFormat.format(rejected);
    byId("metric-pending").textContent = numberFormat.format(
      state.candidates.length - approved - rejected,
    );
  }

  function currentCandidatePage() {
    const start = (state.candidatePage - 1) * PAGE_SIZE;
    return state.filteredCandidates.slice(start, start + PAGE_SIZE);
  }

  function updateSelectionControls() {
    const count = state.selectedIds.size;
    byId("selection-count").textContent = `已选择 ${numberFormat.format(count)} 项`;
    ["approve-selected", "reject-selected", "reset-selected"].forEach((id) => {
      byId(id).disabled = count === 0;
    });
    const pageIds = currentCandidatePage().map((candidate) => candidate.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => state.selectedIds.has(id));
    byId("select-page").textContent = allSelected ? "取消选择本页" : "选择本页";
  }

  function setDecision(ids, status) {
    const updatedAt = new Date().toISOString();
    ids.forEach((id) => {
      if (status === "pending") {
        delete state.decisions[id];
      } else {
        state.decisions[id] = { status, updated_at: updatedAt };
      }
    });
    saveDecisions();
    renderMetrics();
    applyCandidateFilters(false);
  }

  function statusNode(status) {
    const labels = { pending: "待审核", approved: "已通过", rejected: "已拒绝" };
    return element("span", {
      className: `status status-${status}`,
      text: labels[status],
    });
  }

  function candidateActions(candidate) {
    const actions = element("div", { className: "row-actions" });
    const approve = element("button", {
      className: "button button-approve",
      text: "通过",
    });
    approve.type = "button";
    approve.addEventListener("click", () => setDecision([candidate.id], "approved"));
    const reject = element("button", {
      className: "button button-reject",
      text: "拒绝",
    });
    reject.type = "button";
    reject.addEventListener("click", () => setDecision([candidate.id], "rejected"));
    const reset = element("button", {
      className: "button button-quiet",
      text: "撤销",
    });
    reset.type = "button";
    reset.disabled = decisionStatus(candidate.id) === "pending";
    reset.addEventListener("click", () => setDecision([candidate.id], "pending"));
    actions.append(approve, reject, reset);
    return actions;
  }

  function candidateRow(candidate) {
    const row = document.createElement("tr");

    const checkCell = document.createElement("td");
    const checkbox = element("input", { className: "row-checkbox" });
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedIds.has(candidate.id);
    checkbox.setAttribute("aria-label", `选择 ${candidate.title}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedIds.add(candidate.id);
      else state.selectedIds.delete(candidate.id);
      updateSelectionControls();
    });
    checkCell.append(checkbox);

    const feedCell = document.createElement("td");
    const feed = element("div", { className: "feed-cell" });
    feed.append(element("span", { className: "feed-title", text: candidate.title }));
    if (candidate.description) {
      feed.append(
        element("span", {
          className: "feed-description",
          text: candidate.description,
          title: candidate.description,
        }),
      );
    }
    const links = element("div", { className: "feed-links" });
    const siteLink = externalLink("访问网站 ↗", candidate.site_url);
    const feedLink = externalLink("打开 Feed ↗", candidate.feed_url);
    if (siteLink) links.append(siteLink);
    if (feedLink) links.append(feedLink);
    feed.append(links);
    feedCell.append(feed);

    const sourceCell = document.createElement("td");
    const sources = element("div", { className: "badges" });
    appendBadges(sources, candidate.sources, 4);
    if (candidate.generated) appendBadge(sources, "RSSHub 生成", "badge-generated");
    sourceCell.append(sources);

    const categoryCell = document.createElement("td");
    const categories = element("div", { className: "badges" });
    appendBadges(categories, candidate.categories, 3);
    if (candidate.language) appendBadge(categories, candidate.language);
    categoryCell.append(categories);

    const statusCell = document.createElement("td");
    statusCell.append(statusNode(decisionStatus(candidate.id)));
    const actionCell = document.createElement("td");
    actionCell.append(candidateActions(candidate));
    row.append(checkCell, feedCell, sourceCell, categoryCell, statusCell, actionCell);
    return row;
  }

  function renderCandidates() {
    const rowContainer = byId("candidate-rows");
    rowContainer.replaceChildren();
    const pageCount = Math.max(1, Math.ceil(state.filteredCandidates.length / PAGE_SIZE));
    state.candidatePage = Math.min(Math.max(1, state.candidatePage), pageCount);
    const pageItems = currentCandidatePage();
    pageItems.forEach((candidate) => rowContainer.append(candidateRow(candidate)));
    byId("candidate-empty").hidden = pageItems.length !== 0;
    byId("candidate-result-count").textContent = `找到 ${numberFormat.format(
      state.filteredCandidates.length,
    )} 个候选`;
    byId("page-indicator").textContent = `第 ${state.candidatePage} / ${pageCount} 页`;
    byId("previous-page").disabled = state.candidatePage <= 1;
    byId("next-page").disabled = state.candidatePage >= pageCount;
    updateSelectionControls();
  }

  function applyCandidateFilters(resetPage = true) {
    const query = normalize(byId("candidate-search").value);
    const source = byId("source-filter").value;
    const category = byId("category-filter").value;
    const language = byId("language-filter").value;
    const status = byId("status-filter").value;
    state.filteredCandidates = state.candidates.filter((candidate) => {
      if (query && !candidate._search.includes(query)) return false;
      if (source && !candidate.sources.includes(source)) return false;
      if (category && !candidate.categories.includes(category)) return false;
      if (language && candidate.language !== language) return false;
      return !status || decisionStatus(candidate.id) === status;
    });
    if (resetPage) state.candidatePage = 1;
    renderCandidates();
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportReviews() {
    const candidateById = new Map(state.candidates.map((candidate) => [candidate.id, candidate]));
    const decisions = Object.entries(state.decisions)
      .filter(([id, decision]) => candidateById.has(id) && ["approved", "rejected"].includes(decision.status))
      .map(([id, decision]) => {
        const candidate = candidateById.get(id);
        const { _search, ...candidateSnapshot } = candidate;
        return {
          id,
          status: decision.status,
          reviewed_at: decision.updated_at,
          candidate: candidateSnapshot,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    const payload = {
      schema_url: new URL(REVIEW_SCHEMA_ENDPOINT, window.location.href).href,
      schema_version: "1.0",
      catalog_generated_at: state.candidateGeneratedAt,
      exported_at: new Date().toISOString(),
      decision_count: decisions.length,
      decisions,
    };
    download(
      `garss-reviews-${new Date().toISOString().slice(0, 10)}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
      "application/json;charset=utf-8",
    );
    showToast(`已导出 ${decisions.length} 条审核决定`);
  }

  function xmlEscape(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function exportApprovedOpml() {
    const approved = state.candidates.filter(
      (candidate) => decisionStatus(candidate.id) === "approved",
    );
    const outlines = approved.map(
      (candidate) =>
        `    <outline type="rss" text="${xmlEscape(candidate.title)}" title="${xmlEscape(
          candidate.title,
        )}" xmlUrl="${xmlEscape(candidate.feed_url)}" htmlUrl="${xmlEscape(
          candidate.site_url || candidate.feed_url,
        )}" />`,
    );
    const opml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<opml version="2.0">',
      "  <head>",
      "    <title>GARSS 审核通过的订阅源</title>",
      `    <dateCreated>${xmlEscape(new Date().toUTCString())}</dateCreated>`,
      "  </head>",
      "  <body>",
      ...outlines,
      "  </body>",
      "</opml>",
      "",
    ].join("\n");
    download(
      `garss-approved-${new Date().toISOString().slice(0, 10)}.opml`,
      opml,
      "text/x-opml;charset=utf-8",
    );
    showToast(`已导出 ${approved.length} 个通过的订阅源`);
  }

  async function importReviews(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("文件超过 10 MB，已拒绝导入");
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      if (payload.schema_version !== "1.0") throw new TypeError("unsupported schema version");
      if (!Array.isArray(payload.decisions)) throw new TypeError("invalid decisions");
      if (
        payload.decision_count !== undefined &&
        payload.decision_count !== payload.decisions.length
      ) {
        throw new TypeError("invalid decision count");
      }
      const currentIds = new Set(state.candidates.map((candidate) => candidate.id));
      let imported = 0;
      payload.decisions.forEach((decision) => {
        if (
          currentIds.has(decision.id) &&
          (decision.status === "approved" || decision.status === "rejected")
        ) {
          state.decisions[decision.id] = {
            status: decision.status,
            updated_at: decision.reviewed_at || new Date().toISOString(),
          };
          imported += 1;
        }
      });
      saveDecisions();
      renderMetrics();
      applyCandidateFilters();
      showToast(`成功导入 ${imported} 条审核决定`);
    } catch {
      showToast("审核结果格式无效，未导入任何记录");
    } finally {
      byId("import-reviews").value = "";
    }
  }

  function debounce(callback, wait = 180) {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback(...args), wait);
    };
  }

  function wireCandidateControls() {
    byId("candidate-search").addEventListener("input", debounce(() => applyCandidateFilters()));
    ["source-filter", "category-filter", "language-filter", "status-filter"].forEach(
      (id) => byId(id).addEventListener("change", () => applyCandidateFilters()),
    );
    byId("previous-page").addEventListener("click", () => {
      state.candidatePage -= 1;
      renderCandidates();
      byId("candidate-panel").scrollIntoView({ behavior: "smooth" });
    });
    byId("next-page").addEventListener("click", () => {
      state.candidatePage += 1;
      renderCandidates();
      byId("candidate-panel").scrollIntoView({ behavior: "smooth" });
    });
    byId("select-page").addEventListener("click", () => {
      const ids = currentCandidatePage().map((candidate) => candidate.id);
      const allSelected = ids.length > 0 && ids.every((id) => state.selectedIds.has(id));
      ids.forEach((id) => {
        if (allSelected) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      });
      renderCandidates();
    });
    byId("approve-selected").addEventListener("click", () => {
      setDecision([...state.selectedIds], "approved");
      showToast(`已通过 ${state.selectedIds.size} 个候选`);
    });
    byId("reject-selected").addEventListener("click", () => {
      setDecision([...state.selectedIds], "rejected");
      showToast(`已拒绝 ${state.selectedIds.size} 个候选`);
    });
    byId("reset-selected").addEventListener("click", () => {
      setDecision([...state.selectedIds], "pending");
      showToast(`已撤销 ${state.selectedIds.size} 条决定`);
    });
    byId("export-reviews").addEventListener("click", exportReviews);
    byId("export-opml").addEventListener("click", exportApprovedOpml);
    byId("import-reviews").addEventListener("change", (event) => {
      importReviews(event.target.files?.[0]);
    });
    byId("clear-reviews").addEventListener("click", () => {
      if (!window.confirm("确认清空当前浏览器中的全部审核记录？此操作无法撤销。")) return;
      state.decisions = {};
      state.selectedIds.clear();
      saveDecisions();
      renderMetrics();
      applyCandidateFilters();
      showToast("本机审核记录已清空");
    });
  }

  async function loadCandidates() {
    const response = await fetch(CANDIDATE_ENDPOINT, { cache: "no-cache" });
    if (!response.ok) throw new Error(`candidate catalog returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.candidates)) throw new TypeError("invalid candidate catalog");
    state.candidateGeneratedAt = payload.generated_at || "";
    state.candidates = payload.candidates.map((candidate) => ({
      ...candidate,
      sources: Array.isArray(candidate.sources) ? candidate.sources : [],
      categories: Array.isArray(candidate.categories) ? candidate.categories : [],
      _search: normalize(
        [
          candidate.title,
          candidate.feed_url,
          candidate.site_url,
          candidate.description,
          ...(candidate.sources || []),
          ...(candidate.categories || []),
        ].join(" "),
      ),
    }));
    state.filteredCandidates = state.candidates;
    populateSelect(byId("source-filter"), state.candidates.flatMap((item) => item.sources));
    populateSelect(byId("category-filter"), state.candidates.flatMap((item) => item.categories));
    populateSelect(
      byId("language-filter"),
      state.candidates.map((item) => item.language),
    );
    byId("snapshot-status").textContent = `${numberFormat.format(
      state.candidates.length,
    )} 个候选已就绪`;
    byId("snapshot-time").textContent = state.candidateGeneratedAt
      ? `目录生成于 ${dateFormat.format(new Date(state.candidateGeneratedAt))}`
      : "目录生成时间未知";
    renderMetrics();
    renderCandidates();
  }

  function currentRoutePage() {
    const start = (state.routePage - 1) * PAGE_SIZE;
    return state.filteredRoutes.slice(start, start + PAGE_SIZE);
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast("已复制到剪贴板");
    } catch {
      showToast("无法访问剪贴板，请手动复制");
    }
  }

  function routeRow(route) {
    const row = document.createElement("tr");
    const routeCell = document.createElement("td");
    routeCell.append(
      element("strong", { text: route.name || route.path }),
      document.createElement("br"),
      element("span", { className: "route-path", text: route.path }),
    );
    const namespaceCell = document.createElement("td");
    namespaceCell.append(
      element("strong", { text: route.namespace_name || route.namespace }),
      document.createElement("br"),
      element("span", { className: "feed-description", text: route.site }),
    );
    const categoryCell = document.createElement("td");
    const categories = element("div", { className: "badges" });
    appendBadges(categories, route.categories, 4);
    categoryCell.append(categories);
    const capabilityCell = document.createElement("td");
    const capabilities = element("div", { className: "badges" });
    appendBadge(
      capabilities,
      route.requires_config ? "需要配置" : "无需配置",
      route.requires_config ? "badge-generated" : "badge-capability",
    );
    if (route.supports_radar) appendBadge(capabilities, "Radar", "badge-capability");
    capabilityCell.append(capabilities);
    const actionCell = document.createElement("td");
    const actions = element("div", { className: "row-actions" });
    const exampleLink = externalLink("打开示例 ↗", route.example_url);
    if (exampleLink) exampleLink.className = "button button-quiet";
    const copyButton = element("button", { className: "button button-quiet", text: "复制路径" });
    copyButton.type = "button";
    copyButton.addEventListener("click", () => copyText(route.example || route.path));
    if (exampleLink) actions.append(exampleLink);
    actions.append(copyButton);
    actionCell.append(actions);
    row.append(routeCell, namespaceCell, categoryCell, capabilityCell, actionCell);
    return row;
  }

  function renderRoutes() {
    const rowContainer = byId("route-rows");
    rowContainer.replaceChildren();
    const pageCount = Math.max(1, Math.ceil(state.filteredRoutes.length / PAGE_SIZE));
    state.routePage = Math.min(Math.max(1, state.routePage), pageCount);
    const pageItems = currentRoutePage();
    pageItems.forEach((route) => rowContainer.append(routeRow(route)));
    byId("route-empty").hidden = pageItems.length !== 0;
    byId("route-result-count").textContent = `找到 ${numberFormat.format(
      state.filteredRoutes.length,
    )} 条路由`;
    byId("route-page-indicator").textContent = `第 ${state.routePage} / ${pageCount} 页`;
    byId("previous-route-page").disabled = state.routePage <= 1;
    byId("next-route-page").disabled = state.routePage >= pageCount;
  }

  function applyRouteFilters(resetPage = true) {
    const query = normalize(byId("route-search").value);
    const category = byId("route-category-filter").value;
    const config = byId("route-config-filter").value;
    state.filteredRoutes = state.routes.filter((route) => {
      if (query && !route._search.includes(query)) return false;
      if (category && !route.categories.includes(category)) return false;
      if (config === "ready" && route.requires_config) return false;
      if (config === "config" && !route.requires_config) return false;
      return config !== "radar" || route.supports_radar;
    });
    if (resetPage) state.routePage = 1;
    renderRoutes();
  }

  async function loadRoutes() {
    if (state.routesLoaded) return;
    byId("route-result-count").textContent = "正在加载 RSSHub 路由…";
    try {
      const response = await fetch(ROUTE_ENDPOINT, { cache: "no-cache" });
      if (!response.ok) throw new Error(`route catalog returned ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.routes)) throw new TypeError("invalid route catalog");
      state.routes = payload.routes.map((route) => ({
        ...route,
        categories: Array.isArray(route.categories) ? route.categories : [],
        _search: normalize(
          [
            route.name,
            route.path,
            route.namespace,
            route.namespace_name,
            route.site,
            ...(route.categories || []),
          ].join(" "),
        ),
      }));
      state.filteredRoutes = state.routes;
      state.routesLoaded = true;
      populateSelect(
        byId("route-category-filter"),
        state.routes.flatMap((route) => route.categories),
      );
      renderRoutes();
    } catch {
      byId("route-result-count").textContent = "RSSHub 路由加载失败，请稍后重试";
      showToast("RSSHub 路由数据加载失败");
    }
  }

  function wireRouteControls() {
    byId("route-search").addEventListener("input", debounce(() => applyRouteFilters()));
    ["route-category-filter", "route-config-filter"].forEach((id) => {
      byId(id).addEventListener("change", () => applyRouteFilters());
    });
    byId("previous-route-page").addEventListener("click", () => {
      state.routePage -= 1;
      renderRoutes();
      byId("route-panel").scrollIntoView({ behavior: "smooth" });
    });
    byId("next-route-page").addEventListener("click", () => {
      state.routePage += 1;
      renderRoutes();
      byId("route-panel").scrollIntoView({ behavior: "smooth" });
    });
  }

  function activateTab(tabName, updateHash = true) {
    const candidateActive = tabName === "candidates";
    byId("candidate-tab").classList.toggle("is-active", candidateActive);
    byId("route-tab").classList.toggle("is-active", !candidateActive);
    byId("candidate-tab").setAttribute("aria-selected", String(candidateActive));
    byId("route-tab").setAttribute("aria-selected", String(!candidateActive));
    byId("candidate-panel").hidden = !candidateActive;
    byId("route-panel").hidden = candidateActive;
    if (!candidateActive) loadRoutes();
    if (updateHash && window.location.hash !== `#${tabName}`) {
      window.history.replaceState(null, "", `#${tabName}`);
    }
  }

  function wireTabs() {
    byId("candidate-tab").addEventListener("click", () => activateTab("candidates"));
    byId("route-tab").addEventListener("click", () => activateTab("routes"));
    window.addEventListener("hashchange", () => {
      activateTab(window.location.hash === "#routes" ? "routes" : "candidates", false);
    });
  }

  function updateConnectionStatus() {
    const offline = !navigator.onLine;
    document.body.classList.toggle("is-offline", offline);
    byId("connection-status").textContent = offline
      ? "离线模式 · 使用最近一次缓存目录"
      : "在线 · 目录会优先读取最新版本";
  }

  async function wirePwa() {
    updateConnectionStatus();
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);

    const installButton = byId("install-app");
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      installButton.hidden = false;
    });
    installButton.addEventListener("click", async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      installButton.hidden = true;
    });
    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      installButton.hidden = true;
      showToast("审核台 App 已安装");
    });

    if (
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(window.location.hostname))
    ) {
      try {
        await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
        await navigator.serviceWorker.ready;
      } catch {
        showToast("离线缓存初始化失败，在线审核仍可正常使用");
      }
    }
  }

  async function start() {
    wireTabs();
    wireCandidateControls();
    wireRouteControls();
    await wirePwa();
    activateTab(window.location.hash === "#routes" ? "routes" : "candidates", false);
    try {
      await loadCandidates();
    } catch {
      byId("snapshot-status").textContent = "候选目录加载失败";
      byId("snapshot-time").textContent = "请确认目录同步任务已成功运行";
      byId("candidate-result-count").textContent = "无法读取候选接口";
      byId("candidate-empty").hidden = false;
      showToast("候选目录加载失败，请稍后刷新页面");
    }
  }

  start();
})();
