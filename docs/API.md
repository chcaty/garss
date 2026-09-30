# GARSS 静态 API

GitHub Pages 会随 RSS 页面一起发布版本化 JSON 数据，供网页、移动端或桌面 App 直接读取。

## 入口

- `api/index.json`：API 版本发现
- `api/v1/meta.json`：生成时间、保留期和端点信息
- `api/v1/feeds.json`：订阅源目录及最近一次抓取状态
- `api/v1/articles.json`：最近 30 天文章，按发布时间倒序排列
- `api/v1/feed-candidates.json`：Tidings、SaveWeb、Plenary 和 RSSHub 汇总的待审核订阅候选
- `api/v1/rsshub-routes.json`：RSSHub 路由能力、示例及配置要求
- `api/v1/review-schema.json`：网页与后续 App 共用的审核结果 JSON Schema

定时任务每次只接收当天发布的新文章，再与已有历史合并、按稳定 ID 去重，并删除保留期以前的数据。

所有响应均使用 UTF-8。`v1` 字段只做向后兼容扩展；如果未来需要破坏性调整，会新增 `v2`，不会直接修改旧版本语义。

## App 接入建议

客户端先读取 `api/index.json`，再按其中的 `current_version` 访问对应 API。文章的 `id` 由订阅源 ID 和文章 URL 稳定生成，可用于本地收藏、去重和增量更新。

这是静态只读接口，不包含用户账号、同步、推送或写入能力。后续 App 如果需要这些功能，可以在保持当前读取接口兼容的前提下增加独立后端。

候选接口中的记录不代表项目背书，客户端应尊重 `review_required` 字段。RSSHub 路由中包含需要参数或实例配置的能力，因此与可直接订阅的 URL 分开提供。

仓库附带的 [`review.html`](./review.html) 会读取上述两个接口，提供纯静态审核和检索界面。审核决定使用浏览器本地存储，并可导出为 JSON 或 OPML。JSON 导出带有 `schema_version` 和 `schema_url`，移动端或后端应先校验版本，再读取 `decisions`。

审核台也是一个渐进式 Web App（PWA）。通过 GitHub Pages 的 HTTPS 地址打开后，可从支持 PWA 的浏览器安装到桌面或手机；首次成功加载目录后，页面外壳及最近一次候选、路由数据可在离线时继续使用。
