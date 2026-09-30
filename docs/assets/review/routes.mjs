export function createRoutes(context) {
  const { document, state, byId, navigator, window, fetch, showToast, populateSelect, debounce, normalize, element, appendBadge, appendBadges, externalLink, numberFormat, PAGE_SIZE, ROUTE_ENDPOINT } = context;
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
    row.setAttribute("role", "row");
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
    [routeCell, namespaceCell, categoryCell, capabilityCell, actionCell].forEach((cell, index) => {
      cell.className = ["cell-feed", "cell-source", "cell-category", "cell-status", "cell-actions"][index];
      cell.setAttribute("role", "cell");
      cell.setAttribute("data-label", ["路由", "命名空间", "分类", "能力", "示例"][index]);
    });
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
    if (state.routesLoaded || state.routesLoading) return;
    state.routesLoading = true;
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
    } finally {
      state.routesLoading = false;
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


  return { loadRoutes, wireRouteControls };
}
