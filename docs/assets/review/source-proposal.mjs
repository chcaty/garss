export function validateSourceProposal(value) {
  const keys = ["schema_version", "title", "description", "category", "feed_url", "submitted_at"];
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema_version !== "1.0" || Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError("Invalid source proposal");
  for (const [field, limit] of [["title", 120], ["description", 600], ["category", 80], ["feed_url", 2048]]) {
    if (typeof value[field] !== "string" || value[field].length > limit || (field !== "description" && !value[field].trim())) throw new TypeError(`Invalid ${field}`);
  }
  if (typeof value.submitted_at !== "string" || !Number.isFinite(Date.parse(value.submitted_at))) throw new TypeError("Invalid submission date");
  const url = new URL(value.feed_url);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /[\u0000-\u001f\u007f]/.test(value.feed_url)) throw new TypeError("Only HTTP(S) feed URLs without credentials are supported");
  return value;
}

export function prepareSourceProposal(fields, now = new Date()) {
  const payload = validateSourceProposal({ schema_version: "1.0", title: fields.title.trim(), description: fields.description.trim(), category: fields.category.trim(), feed_url: fields.feed_url.trim(), submitted_at: now.toISOString() });
  const filename = `source-${now.toISOString().replace(/[^0-9]/g, "")}.json`;
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  const url = new URL("https://github.com/chcaty/garss/new/main");
  url.searchParams.set("filename", `source-proposals/${filename}`);
  url.searchParams.set("value", content);
  return { filename, content, url: url.href.length <= 7500 ? url.href : "https://github.com/chcaty/garss/upload/main/source-proposals" };
}

export function wireSourceProposal({ byId, window, download, showToast }) {
  byId("manual-source-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const proposal = prepareSourceProposal({ title: byId("manual-title").value, description: byId("manual-description").value, category: byId("manual-category").value, feed_url: byId("manual-url").value });
      window.open(proposal.url, "_blank", "noopener,noreferrer");
      download(proposal.filename, proposal.content, "application/json;charset=utf-8");
      byId("manual-source-status").textContent = "提案已准备并备份。请在 GitHub 选择新分支创建 PR；在线检测通过并合并后才会收录和抓取。";
      showToast("请在 GitHub 登录，选择新分支并创建 PR");
    } catch {
      byId("manual-source-status").textContent = "请检查名称、分类和 HTTP(S) RSS 地址；该提案可能包含不支持的来源。";
    }
  });
}
