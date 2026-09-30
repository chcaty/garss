import { validateReviewPayload } from "./validation.mjs";

export function createTransfers(context) {
  const { state, document, window, byId, showToast, persistDecisions, renderMetrics, applyCandidateFilters, decisionStatus, REVIEW_SCHEMA_ENDPOINT } = context;
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


  return { exportReviews, exportApprovedOpml, importReviews };
}
