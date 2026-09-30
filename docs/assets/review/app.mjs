import { validTimestamp, validateReviewPayload } from "./validation.mjs";
import { loadDecisions, saveDecisions } from "./storage.mjs";
import { createView } from "./view.mjs";
import { createRoutes } from "./routes.mjs";
import { createPwa } from "./pwa.mjs";

export function createReviewer(environment = globalThis) {
  const { document, window, navigator, localStorage, fetch } = environment;
  const PAGE_SIZE = 50;
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
    decisions: loadDecisions(localStorage),
    routes: [],
    routesLoaded: false,
    routesLoading: false,
    filteredRoutes: [],
    routePage: 1,
    toastTimer: null,
    deferredInstallPrompt: null,
  };

  const byId = (id) => document.getElementById(id);
  const { element, appendBadge, appendBadges, externalLink } = createView(document);
  const { loadRoutes, wireRouteControls } = createRoutes({
    state, byId, navigator, window, fetch, showToast, populateSelect, debounce, normalize,
    element, appendBadge, appendBadges, externalLink, numberFormat,
    PAGE_SIZE, ROUTE_ENDPOINT,
  });
  const { wirePwa } = createPwa({
    state, byId, navigator, window, document, fetch, showToast,
    CANDIDATE_ENDPOINT, ROUTE_ENDPOINT,
  });
  function persistDecisions() {
    if (!saveDecisions(localStorage, state.decisions)) {
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
    persistDecisions();
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
    row.setAttribute("role", "row");
    row.setAttribute("data-status", decisionStatus(candidate.id));
    row.setAttribute("data-selected", String(state.selectedIds.has(candidate.id)));

    const checkCell = document.createElement("td");
    const checkbox = element("input", { className: "row-checkbox" });
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedIds.has(candidate.id);
    checkbox.setAttribute("aria-label", `选择 ${candidate.title}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedIds.add(candidate.id);
      else state.selectedIds.delete(candidate.id);
      row.setAttribute("data-selected", String(checkbox.checked));
      updateSelectionControls();
    });
    const checkboxTarget = element("label", { className: "checkbox-target" });
    checkboxTarget.append(checkbox);
    checkCell.append(checkboxTarget);

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
    [checkCell, feedCell, sourceCell, categoryCell, statusCell, actionCell].forEach((cell, index) => {
      cell.className = ["cell-check", "cell-feed", "cell-source", "cell-category", "cell-status", "cell-actions"][index];
      cell.setAttribute("role", "cell");
      cell.setAttribute("data-label", ["选择", "订阅源", "目录来源", "分类 / 语言", "审核状态", "操作"][index]);
    });
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
    let decisions;
    try {
      const payload = JSON.parse(await file.text());
      decisions = validateReviewPayload(payload);
    } catch {
      showToast("审核结果格式无效，未导入任何记录");
      return;
    } finally {
      byId("import-reviews").value = "";
    }
    const currentIds = new Set(state.candidates.map((candidate) => candidate.id));
    const nextDecisions = { ...state.decisions };
    let imported = 0;
    decisions.forEach((decision) => {
      if (!currentIds.has(decision.id)) return;
      nextDecisions[decision.id] = {
        status: decision.status,
        updated_at: decision.reviewed_at,
      };
      imported += 1;
    });
    state.decisions = nextDecisions;
    persistDecisions();
    renderMetrics();
    applyCandidateFilters();
    showToast(`成功导入 ${imported} 条审核决定`);
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
      persistDecisions();
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
    if (!validTimestamp(payload.generated_at)) throw new TypeError("invalid catalog timestamp");
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
    ["export-reviews", "export-opml", "import-reviews"].forEach((id) => {
      byId(id).disabled = false;
    });
    byId("import-label").setAttribute("aria-disabled", "false");
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

  async function start() {
    wireTabs();
    wireCandidateControls();
    wireRouteControls();
    wirePwa();
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


  return { start, importReviews, state };
}
