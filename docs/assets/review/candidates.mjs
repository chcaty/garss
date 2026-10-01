export function createCandidates(context) {
  const { document, state, element, appendBadge, appendBadges, externalLink, decisionStatus, setDecision, updateSelectionControls } = context;
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
      text: "撤销本机决定",
    });
    reset.type = "button";
    reset.disabled = !state.decisions[candidate.id];
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


  return { candidateRow };
}
