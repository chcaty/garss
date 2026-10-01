export function wireFetchControls({ byId, fetch, window }) {
  const endpoint = "https://github.com/chcaty/garss/actions/workflows/build-and-deploy.yml";
  byId("trigger-fetch").addEventListener("click", () => {
    window.open(endpoint, "_blank", "noopener,noreferrer");
    byId("fetch-status").textContent = "请在 GitHub 登录并点击 Run workflow，选择 main，保留补抓最近 30 天。完成后回到这里刷新结果。";
  });
  async function refreshStatus() {
    byId("refresh-fetch-status").disabled = true;
    try {
      const response = await fetch("./api/v1/meta.json", { cache: "no-cache", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Metadata unavailable");
      const meta = await response.json();
      if (meta.api_version !== "1.0" || !Number.isFinite(Date.parse(meta.generated_at))) throw new TypeError("Invalid metadata");
      byId("fetch-status").textContent = `最近发布：${new Date(meta.generated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）。抓取任务运行期间仍显示上一份有效快照。`;
    } catch {
      byId("fetch-status").textContent = "暂时无法读取更新时间，可以在 GitHub Actions 查看抓取任务。";
    } finally { byId("refresh-fetch-status").disabled = false; }
  }
  byId("refresh-fetch-status").addEventListener("click", refreshStatus);
  void refreshStatus();
}
