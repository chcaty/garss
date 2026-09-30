import { createElement, debounce, normalize } from "../shared/dom.mjs";
import { loadCatalog, filterArticles, paginate } from "./catalog.mjs";

export function createReader({ document, window, fetch }) {
  const byId = (id) => document.getElementById(id);
  const el = (tag, options) => createElement(document, tag, options);
  const number = new Intl.NumberFormat("zh-CN");
  const date = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
  const state = { sources: [], entries: [], source: "", page: 1 };

  function renderSources() {
    const list = byId("source-list");
    const query = normalize(byId("source-search").value);
    list.replaceChildren();
    const sources = [{ id: "", title: "全部来源", count: state.entries.length }, ...state.sources.filter((source) => normalize(source.title).includes(query))];
    for (const source of sources) {
      const button = el("button", { className: "source-button" });
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.source === source.id));
      button.append(el("span", { text: source.title }), el("span", { text: number.format(source.count) }));
      button.addEventListener("click", () => { state.source = source.id; state.page = 1; renderSources(); renderArticles(); });
      list.append(button);
    }
    if (sources.length === 1 && query) list.append(el("p", { text: "没有匹配的来源" }));
  }

  function renderArticles() {
    const query = byId("article-search").value;
    const filtered = filterArticles(state.entries, { query, source: state.source, order: byId("article-sort").value });
    const page = paginate(filtered, state.page);
    state.page = page.page;
    byId("stream-title").textContent = state.sources.find((source) => source.id === state.source)?.title || "全部文章";
    byId("result-count").textContent = `${number.format(filtered.length)} 篇文章`;
    byId("clear-filters").hidden = !query && !state.source;
    const list = byId("articles");
    list.replaceChildren();
    for (const article of page.items) {
      const row = el("article", { className: "article-row" });
      const content = el("div");
      const meta = el("div", { className: "article-meta" });
      const time = el("time", { text: date.format(new Date(article.timestamp)) });
      time.dateTime = article.published_at;
      meta.append(el("span", { className: "article-source", text: article.sourceTitle }), time);
      const heading = el("h3");
      const link = el("a", { text: article.title });
      link.href = article.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      heading.append(link); content.append(meta, heading);
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrow.setAttribute("viewBox", "0 0 24 24"); arrow.setAttribute("class", "article-arrow"); arrow.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M5 19 19 5M5 5h14v14"); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "1.5");
      arrow.append(path); row.append(content, arrow); list.append(row);
    }
    const message = byId("reader-message");
    message.hidden = filtered.length > 0;
    message.replaceChildren(el("strong", { text: "没有找到文章" }), el("p", { text: "换一个关键词或来源，或者清除筛选条件。" }));
    byId("page-indicator").textContent = `第 ${page.page} / ${page.pages} 页`;
    byId("previous-page").disabled = page.page <= 1;
    byId("next-page").disabled = page.page >= page.pages;
  }

  async function load() {
    byId("retry-load").hidden = true;
    byId("articles").setAttribute("aria-busy", "true");
    byId("reader-message").hidden = false;
    byId("reader-message").replaceChildren(el("strong", { text: "正在整理文章…" }));
    try {
      const catalog = await loadCatalog(fetch, window.location.href);
      Object.assign(state, catalog);
      byId("edition-date").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(catalog.generatedAt));
      byId("snapshot-info").textContent = `最近同步 ${date.format(new Date(catalog.generatedAt))} · ${number.format(state.sources.length)} 个来源`;
      byId("source-count").textContent = number.format(state.sources.length);
      renderSources(); renderArticles();
    } catch {
      byId("edition-date").textContent = "信息流暂时无法加载";
      byId("snapshot-info").textContent = "请检查网络后重试";
      byId("result-count").textContent = "目录加载失败";
      byId("reader-message").replaceChildren(el("strong", { text: "暂时无法读取文章" }), el("p", { text: "请检查网络连接，点击下方按钮重新加载。" }));
      byId("retry-load").hidden = false;
    } finally { byId("articles").setAttribute("aria-busy", "false"); }
  }

  function start() {
    byId("source-search").addEventListener("input", debounce(renderSources, window));
    byId("article-search").addEventListener("input", debounce(() => { state.page = 1; renderArticles(); }, window));
    byId("article-sort").addEventListener("change", () => { state.page = 1; renderArticles(); });
    byId("clear-filters").addEventListener("click", () => { state.source = ""; state.page = 1; byId("article-search").value = ""; byId("source-search").value = ""; renderSources(); renderArticles(); });
    for (const [id, delta] of [["previous-page", -1], ["next-page", 1]]) byId(id).addEventListener("click", () => { state.page += delta; renderArticles(); byId("stream-title").scrollIntoView({ block: "start" }); });
    byId("retry-load").addEventListener("click", load);
    return load();
  }
  return { start, state };
}

if (typeof document !== "undefined") {
  // Preserve documentation bookmarks from the former Docsify homepage.
  if (/^#\/(API|SOURCES|DEPLOYMENT|README)(?:$|[?\/])/.test(window.location.hash)) {
    window.location.replace(`./guide.html${window.location.hash}`);
  } else createReader({ document, window, fetch: window.fetch.bind(window) }).start();
}
