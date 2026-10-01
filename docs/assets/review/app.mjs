import { createCandidates } from "./candidates.mjs";
import { createOnlineReview } from "./online.mjs";
import { wireSourceProposal } from "./source-proposal.mjs";
import { wireFetchControls } from "./fetch-controls.mjs";
import { effectiveDecision } from "./payload.mjs";
import { createTransfers } from "./transfers.mjs";
import { normalize, debounce as createDebounce } from "../shared/dom.mjs";
import { validTimestamp } from "./validation.mjs";
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
    timeZone: "Asia/Shanghai",
  });

  const state = {
    candidates: [],
    candidateGeneratedAt: "",
    filteredCandidates: [],
    candidatePage: 1,
    selectedIds: new Set(),
    decisions: loadDecisions(localStorage),
    publishedDecisions: {},
    linkHealth: {},
    routes: [],
    routesLoaded: false,
    routesLoading: false,
    filteredRoutes: [],
    routePage: 1,
    toastTimer: null,
    deferredInstallPrompt: null,
  };

  const debounce = (callback, wait) => createDebounce(callback, window, wait);
  const byId = (id) => document.getElementById(id);
  const { element, appendBadge, appendBadges, externalLink } = createView(document);
  const { loadRoutes, wireRouteControls } = createRoutes({
    document, state, byId, navigator, window, fetch, showToast, populateSelect, debounce, normalize,
    element, appendBadge, appendBadges, externalLink, numberFormat,
    PAGE_SIZE, ROUTE_ENDPOINT,
  });
  const { wirePwa } = createPwa({
    state, byId, navigator, window, document, fetch, showToast,
    CANDIDATE_ENDPOINT, ROUTE_ENDPOINT,
  });
  const { exportReviews, exportApprovedOpml, importReviews, download } = createTransfers({
    state, document, window, byId, showToast, persistDecisions, renderMetrics, applyCandidateFilters, decisionStatus, REVIEW_SCHEMA_ENDPOINT,
  });
  const { updateOnlineControls, wireOnlineControls } = createOnlineReview({
    state, byId, window, download, showToast, REVIEW_SCHEMA_ENDPOINT,
  });

  const { candidateRow } = createCandidates({
    document, state, element, appendBadge, appendBadges, externalLink, decisionStatus, setDecision, updateSelectionControls,
  });

  function persistDecisions() {
    if (!saveDecisions(localStorage, state.decisions)) {
      showToast("浏览器拒绝保存本地记录，请及时导出审核结果");
    }
  }

  function decisionStatus(id) {
    const status = effectiveDecision(state, id)?.status;
    return status === "approved" || status === "rejected" ? status : "pending";
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
    updateOnlineControls();
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
    const linkStatus = byId("link-filter").value;
    state.filteredCandidates = state.candidates.filter((candidate) => {
      if (query && !candidate._search.includes(query)) return false;
      if (source && !candidate.sources.includes(source)) return false;
      if (category && !candidate.categories.includes(category)) return false;
      if (language && candidate.language !== language) return false;
      const observation = state.linkHealth[candidate.feed_url];
      const checked = observation && Number.isFinite(Date.parse(observation.checked_at));
      const expired = checked && Date.now() - Date.parse(observation.checked_at) > 7 * 86400000;
      const observedStatus = !checked ? "untested" : expired ? "expired" : observation.status;
      if (linkStatus && observedStatus !== linkStatus) return false;
      return !status || decisionStatus(candidate.id) === status;
    });
    if (resetPage) state.candidatePage = 1;
    renderCandidates();
  }

  function wireCandidateControls() {
    byId("candidate-search").addEventListener("input", debounce(() => applyCandidateFilters()));
    ["source-filter", "category-filter", "language-filter", "status-filter", "link-filter"].forEach(
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

  async function loadPublishedDecisions() {
    try {
      const response = await fetch("./api/v1/review-decisions.json", { cache: "no-cache", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Review status unavailable");
      const payload = await response.json();
      if (payload.schema_version !== "1.0" || !payload.decisions || typeof payload.decisions !== "object" || Array.isArray(payload.decisions)) throw new TypeError("Invalid review status");
      state.publishedDecisions = Object.fromEntries(Object.entries(payload.decisions).filter(([id, decision]) =>
        /^[0-9a-f]{20}$/.test(id) && decision && ["approved", "rejected"].includes(decision.status) && validTimestamp(decision.updated_at)));
      byId("published-review-status").textContent = `仓库已保存 ${numberFormat.format(Object.keys(state.publishedDecisions).length)} 条审核决定`;
      renderMetrics(); applyCandidateFilters(false);
    } catch {
      byId("published-review-status").textContent = "暂未读取仓库审核状态；本机审核仍可使用";
    }
  }

  function activateTab(tabName, updateHash = true) {
    const candidateActive = tabName === "candidates";
    byId("candidate-tab").classList.toggle("is-active", candidateActive);
    byId("route-tab").classList.toggle("is-active", !candidateActive);
    byId("candidate-tab").setAttribute("aria-selected", String(candidateActive));
    byId("route-tab").setAttribute("aria-selected", String(!candidateActive));
    byId("candidate-tab").setAttribute("tabindex", candidateActive ? "0" : "-1");
    byId("route-tab").setAttribute("tabindex", candidateActive ? "-1" : "0");
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
    const tabs = ["candidate-tab", "route-tab"];
    tabs.forEach((id, index) => byId(id).addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = 1 - index;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = 1;
      else return;
      event.preventDefault();
      activateTab(next === 0 ? "candidates" : "routes");
      byId(tabs[next]).focus();
    }));
    window.addEventListener("hashchange", () => {
      activateTab(window.location.hash === "#routes" ? "routes" : "candidates", false);
    });
  }

  async function start() {
    wireSourceProposal({ byId, window, download, showToast });
    wireFetchControls({ byId, fetch, window });
    wireTabs();
    wireCandidateControls();
    wireOnlineControls();
    wireRouteControls();
    wirePwa();
    activateTab(window.location.hash === "#routes" ? "routes" : "candidates", false);
    try {
      await loadCandidates();
      await loadPublishedDecisions();
      try {
        const response = await fetch("./api/v1/feed-health.json", { cache: "no-cache", signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const health = await response.json();
          if (health.schema_version === "1.0" && health.checks && typeof health.checks === "object") {
            state.linkHealth = health.checks;
            applyCandidateFilters(false);
          }
        }
      } catch { /* Link observations are optional; reviewing remains available offline. */ }
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
