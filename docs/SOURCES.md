# 外部订阅源目录

项目每周同步第三方公开目录，生成可供审核、搜索及未来 App 使用的候选数据。外部记录不会直接写入正式订阅表，避免失效、重复或不适合本项目的内容自动上线。

可以在 GitHub Pages 的 [`review.html`](./review.html) 打开候选审核台。页面支持筛选、批量通过或拒绝、审核结果导入导出，以及把通过项导出为 OPML。审核状态仅保存在当前浏览器，除非主动导出，否则不会上传或修改仓库。

审核台支持安装为 PWA，并缓存最近一次成功读取的候选和 RSSHub 路由。离线审核产生的决定仍保存在本机；恢复网络后可继续读取新版目录，或导出符合 `api/v1/review-schema.json` 的版本化 JSON，交给后续 App、脚本或代码审核流程处理。

## 已接入目录

- [Tidings RSS](https://github.com/fuxiaoai/tidings-rss)：读取结构化 `feeds.json`，仅保留文章类订阅。
- [SaveWeb RSS List](https://github.com/saveweb/rss-list)：读取项目推荐的最新 Release 完整 OPML。
- [Plenary Awesome RSS Feeds](https://github.com/plenaryapp/awesome-rss-feeds)：读取推荐分类中的 OPML 文件。
- [RSSHub](https://docs.rsshub.app/)：读取官方路由注册表；路由能力与可直接使用的 `topFeeds` 分开保存。

## 生成接口

- `api/v1/feed-candidates.json`：去重后、尚未进入正式列表的候选订阅源。每条记录都带有 `review_required: true`。
- `api/v1/rsshub-routes.json`：RSSHub 路由能力、示例和配置要求，供未来网页或 App 的“网站转 RSS”搜索使用。
- `api/v1/review-schema.json`：审核结果交换格式，供网页审核台和后续 App 共享。

同步时会把 HTTP/HTTPS 变体视为同一订阅，并排除正式列表中已有的地址。四个目录必须全部下载并解析成功才会发布新快照；任何一个失败时，命令以失败状态退出，原有文件保持不变。

本地手动同步：

```bash
pipenv run sync-sources
```

目录配置保存在根目录的 `source_catalogs.json`。自动任务位于 `.github/workflows/sync-source-catalogs.yml`，默认每周日北京时间 11:30 执行。
