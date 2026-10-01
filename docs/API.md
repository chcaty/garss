# GARSS 静态 API

GitHub Pages 会随 RSS 页面一起发布版本化 JSON 数据，供网页、移动端或桌面 App 直接读取。

## 入口

- `api/index.json`：API 版本发现
- `api/v1/meta.json`：生成时间、保留期和端点信息
- `api/v1/feeds.json`：订阅源目录及最近一次抓取状态
- `api/v1/articles.json`：最近 30 天文章，按发布时间倒序排列

文章向后兼容增加可选 `summary`（最多 600 字符的纯文本摘要）和 `image_url`（RSS 图片字段或正文首图的 HTTP(S) URL）。旧快照或未提供内容的订阅源可能没有这些字段或返回空字符串。客户端应显示占位阅读提示，图片失败不能阻断文章；图片来自原站，不保证离线可用，不在 Pages 镜像图片。完整文章仍通过 `url` 访问。
- `api/v1/feed-candidates.json`：Tidings、SaveWeb、Plenary 和 RSSHub 汇总的待审核订阅候选
- `api/v1/rsshub-routes.json`：RSSHub 路由能力、示例及配置要求
- `api/v1/review-schema.json`：网页与后续 App 共用的审核结果 JSON Schema

定时任务对已成功抓取过的源只接收当天文章；新增或上次抓取失败的源补抓整个保留期，再与已有历史合并、按稳定 ID 去重，并删除保留期以前的数据。手动工作流开启 `refresh_recent` 时补抓所有正式源的保留期。

保留期按北京时间的日期计算，包含今天；30 天即今天及之前 29 天。例如 2026 年 9 月 30 日构建时保留 9 月 1 日至 9 月 30 日。

所有响应均使用 UTF-8。`v1` 字段只做向后兼容扩展；如果未来需要破坏性调整，会新增 `v2`，不会直接修改旧版本语义。

## App 接入建议

客户端先读取 `api/index.json`，再按其中的 `current_version` 访问对应 API。文章的 `id` 由订阅源 ID 和文章 URL 稳定生成，可用于本地收藏、去重和增量更新。

新客户端应读取 `meta.json` 的 `snapshot_endpoint`，获取该快照的 `manifest.json`，再相对于 manifest 的 URL 读取 `feeds_endpoint` 与 `articles_endpoint`。同一快照内文件内容不会变化，manifest 还提供每个文件的 SHA-256 和字节数，避免混用两次构建的数据。兼容旧客户端的顶层 `feeds.json`、`articles.json` 保留，但不保证跨文件读取时处于同一版本。

最多保留最近 8 个构建快照，且始终保留当前指针指向的快照；快照保留数量和文章的 30 天保留期是两种不同规则。若客户端离线后恢复时遇到旧快照 404，应重新读取 `meta.json` 并重试，不要混入旧快照数据。元数据读取宜禁用本地缓存或进行重新验证。

这是静态只读接口，不包含用户账号、同步、推送或写入能力。后续 App 如果需要这些功能，可以在保持当前读取接口兼容的前提下增加独立后端。

候选接口中的记录不代表项目背书，客户端应尊重 `review_required` 字段。RSSHub 路由中包含需要参数或实例配置的能力，因此与可直接订阅的 URL 分开提供。

仓库附带的 [`review.html`](./review.html) 会读取上述两个接口，提供纯静态审核和检索界面。审核决定使用浏览器本地存储，并可导出为 JSON 或 OPML。JSON 导出带有 `schema_version` 和 `schema_url`，移动端或后端应先校验版本，再读取 `decisions`。

审核台也是一个渐进式 Web App（PWA）。通过 GitHub Pages 的 HTTPS 地址打开后，可从支持 PWA 的浏览器安装到桌面或手机；首次成功加载目录后，页面外壳及最近一次候选、路由数据可在离线时继续使用。

## 公共审核状态与提交

`api/v1/review-decisions.json` 返回 `schema_version: "1.0"` 和按候选 ID 索引的 `decisions`。每项包含 `status`、`updated_at`、`feed_url`、`submission`、`source_id`，表示已经合并到仓库并由构建应用的决定。它属于独立审核目录，不属于文章快照。

读取 API 仍为静态只读。写入通过审核台跳转到 GitHub，由用户登录、新分支提交 `reviews/*.json` 并创建 PR；PR 校验后，合并触发构建完成收录。参见 [提交说明](SOURCES.md) 和 [GitHub 创建文件说明](https://docs.github.com/en/repositories/working-with-files/managing-files/creating-new-files)。
