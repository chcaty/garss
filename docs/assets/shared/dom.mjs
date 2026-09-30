/** Safe DOM helpers shared by reading and curation. */
export function createElement(document, tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  return node;
}
export function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}
export function debounce(callback, window, wait = 180) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}
