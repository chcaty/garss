# 外部订阅源目录

## 正式订阅源维护

根目录 `sources.json` 是正式订阅源的唯一数据来源；`EditREADME.md` 只保留展示模板，订阅表由 `{{source_table}}` 自动生成。抓取、README、OPML、静态 API 和外部候选排除均读取同一目录。

每项包含固定 `id`、展示用 `display_id`、`title`、`description`、`feed_url`、`category` 和 `icon`。`id` 在目录内必须唯一，调整顺序、分类或展示编号时不要修改它，否则会改变文章 ID 和本地收藏关联。新增源使用新的唯一 ID，不能复用已删除源的 ID。`icon` 为 `_media/` 下的相对路径，可留空。

审核通过的候选可以从审核台提交到 GitHub。登录后请选择新分支并创建 PR；合并后构建任务会自动应用审核结果并添加到 `sources.json`，浏览器不会直接修改正式目录。

## 外部候选目录

项目每周同步第三方公开目录，生成可供审核、搜索及未来 App 使用的候选数据。外部记录不会直接写入正式订阅表，避免失效、重复或不适合本项目的内容自动上线。

可以在 GitHub Pages 的 [`review.html`](./review.html) 打开候选审核台。页面支持筛选、批量通过或拒绝、审核结果导入导出，以及把通过项导出为 OPML。审核状态仅保存在当前浏览器，除非主动导出，否则不会上传或修改仓库。

审核台支持安装为 PWA，并缓存最近一次成功读取的候选、RSSHub 路由和仓库审核状态。离线产生的决定先存本机；联网后点击“提交到 GitHub”。已选条目时仅提交已选的待提交决定，没有选择条目时提交全部尚未发布的本机决定。小批次会打开预填 JSON 的 GitHub 新文件页面；大批次会下载文件并打开上传页。两种方式都要选择新分支创建 PR。

仓库审核文件位于 `reviews/*.json`。PR 的 **Validate review submissions** 工作流检查结构、候选身份、稳定 ID、重复 URL、冲突决定及新增 RSS 链接的实时可用性；不会替代人工内容判断。合并到 main 后，构建再次检测新增源，成功后应用审核、抓取和发布。通过项自动加入正式源并从候选目录排除，拒绝项保存在公共审核记录中。拒绝决定不会删除已有正式源。

`api/v1/review-decisions.json` 提供已合并的公共状态；其他浏览器可以读取。比公共状态更新的本机决定优先显示，撤销本机决定后恢复公共状态。提交并不代表已经合并，PR 合并和构建成功后才完成收录。

本地预检与应用分别运行 `npm run review:check`、`npm run review:apply`。预检不修改文件，任何无效审核都会阻止整批结果应用。

目录读取遇到网络错误、连接等待超过八秒或服务端临时错误时，会尝试使用已缓存的版本。只有曾成功缓存的目录才能离线使用，RSSHub 路由在打开该标签后缓存。导入会先检查全部记录的版本、数量、日期、候选快照和重复 ID；存在异常时整份文件不会写入，合法文件中已不在当前目录的候选会跳过。

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
## 手动新增与手动抓取

审核台提供“手动新增订阅源”表单，支持未出现在候选目录中的 RSS/Atom 地址。填写后会准备 `source-proposals/*.json` 并打开 GitHub 提交页面，备份同时下载。请选择新分支创建 PR；链接检测和人工内容审核通过后合并，构建自动生成稳定源 ID、去重、收录并首次抓取最近 30 天。提案不是已经通过的审核决定。

“手动抓取 · 前往 GitHub”打开构建工作流页面，拥有仓库 Actions 运行权限的用户登录后点击 **Run workflow**，选择 `main`，默认开启补抓最近 30 天。网页不持有写入令牌，也不会冒充已启动抓取；回到网页点击“刷新抓取结果”查看最后发布的快照时间。自动任务仍按原来的时段运行。

已有正式源可通过“维护正式源目录”打开 `sources.json` 编辑，保持 ID 不变并创建 PR。新 URL 会做实时 RSS/Atom 校验。新增源第一次没有当天文章也会读取保留期内的旧文章；首次失败会在后续任务重试补抓。App 只读取 Pages 快照，本机来源开关仅筛选阅读内容，不管理仓库目录。

## RSS 链接检测

审核台在每条候选下显示 RSS 链接检测状态和日期。检测使用 GET，跟随受限次数的重定向，并解析 RSS/Atom；HTTP 200 的普通网页不会算作有效 Feed。404、410 或非 Feed 响应标记为失效，超时、访问限制及服务器错误标记为暂无法确认。检测不自动删除订阅源，也不代替内容审核。

已有构建任务每次检测正式源和 200 个候选，按最久未检测顺序轮换；未覆盖的候选明确显示“尚未检测”，超过七天的结果显示过期。结果保存在 `api/v1/feed-health.json`。新收录源在 PR 校验和合并后的收录前均要求实时检测通过；访问限制时需修正链接或稍后重跑校验。

本地运行 `python scripts/check_feed_links.py` 可更新检测结果（需已安装 Python 依赖）。`--input` 接收 URL 数组文件，`--require-valid` 在任意目标无法验证时返回失败，并且不修改历史结果。
