import { buildReviewPayload, unpublishedIds } from "./payload.mjs";

export function prepareSubmission(state, schemaUrl, now = new Date()) {
  const pending = unpublishedIds(state);
  const ids = state.selectedIds.size ? pending.filter((id) => state.selectedIds.has(id)) : pending;
  if (!ids.length) return null;
  const payload = buildReviewPayload({ state, ids, schemaUrl, now });
  const filename = `submission-${now.toISOString().replace(/[^0-9]/g, "")}.json`;
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  const url = new URL("https://github.com/chcaty/garss/new/main");
  url.searchParams.set("filename", `reviews/${filename}`);
  url.searchParams.set("value", content);
  return { filename, content, count: ids.length, url: url.href.length <= 7500 ? url.href : "https://github.com/chcaty/garss/upload/main/reviews", upload: url.href.length > 7500 };
}

export function createOnlineReview({ state, byId, window, download, showToast, REVIEW_SCHEMA_ENDPOINT }) {
  function updateOnlineControls() {
    const pending = unpublishedIds(state);
    const count = state.selectedIds.size ? pending.filter((id) => state.selectedIds.has(id)).length : pending.length;
    byId("submit-online").disabled = count === 0;
    byId("online-review-count").textContent = state.selectedIds.size
      ? `已选项目中有 ${count} 条决定待提交` : `${count} 条本机决定待提交`;
  }
  function wireOnlineControls() {
    byId("submit-online").addEventListener("click", () => {
      const submission = prepareSubmission(state, new URL(REVIEW_SCHEMA_ENDPOINT, window.location.href).href);
      if (!submission) return;
      // This opens GitHub's own authenticated editing UI; no token is stored on the site.
      window.open(submission.url, "_blank", "noopener,noreferrer");
      download(submission.filename, submission.content, "application/json;charset=utf-8");
      showToast(submission.upload ? "已下载审核文件，请在 GitHub 上传并选择新分支创建 PR" : "已下载审核备份，请在 GitHub 选择新分支创建 PR；若未预填，可粘贴文件内容");
    });
  }
  return { updateOnlineControls, wireOnlineControls };
}
