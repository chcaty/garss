import { safeExternalUrl } from "./urls.mjs";

export function createView(document) {
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


  return { element, appendBadge, appendBadges, externalLink };
}
