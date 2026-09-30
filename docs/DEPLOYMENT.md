# 部署与维护

项目通过 `.github/workflows/build-and-deploy.yml` 自动抓取订阅源、运行测试、更新生成文件，并将 `docs/` 发布到 GitHub Pages。

## 首次启用 GitHub Pages

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库 **Settings → Pages**，在 **Build and deployment** 中把 **Source** 设为 **GitHub Actions**。
3. 打开 **Settings → Actions → General**，确认 Workflow permissions 允许 Actions 写入仓库内容；自动提交生成数据需要这个权限。
4. 在 **Actions** 页面手动运行一次 **Build feeds and deploy Pages**。

部署成功后，站点地址通常为 `https://<用户名>.github.io/<仓库名>/`。本仓库的静态 API 位于站点地址下的 `api/` 路径。

`review.html` 会在同一站点注册 Service Worker。GitHub Pages 默认提供 HTTPS，满足 PWA 安装和离线缓存要求；若在本地调试，应通过 `localhost` HTTP 服务访问，不要直接双击 HTML 文件。每次更新 `service-worker.js` 的缓存版本后，旧缓存会在激活阶段自动清理。

本地预览运行 `python scripts/preview.py` 或 `npm run preview`。阅读首页位于 `http://127.0.0.1:8766/`，审核台位于 `/review.html`，文档位于 `/guide.html`。脚本固定 `.mjs` 的 JavaScript MIME 类型，避免 Windows MIME 配置导致模块无法加载。

首页支持按来源和标题搜索、时间排序及分页，从 `meta.json` 指定的不可变快照读取来源与文章。更新期间不会混用不同批次的数据。审核台在宽屏使用表格、720px 以下使用条目布局；导入、导出与清空记录位于可展开的备份区域。页签支持方向键、Home 和 End。旧的 `/#/API` 等文档书签会转到新文档入口。

首页和审核台的样式与脚本均由站点本地提供；标题字体使用附带 OFL 许可证的 Noto Serif SC 字符子集。文档入口继续使用 Docsify CDN，需要网络。离线能力覆盖审核台，阅读首页需要网络获取快照。

## 定时更新与清理

工作流每天按北京时间 06:00、13:00、17:00 和 22:00 自动执行。每次只采集当天发布的文章，再与已有数据合并去重；页面和 API 只保留最近 30 天，过期信息会随定时构建自动删除。

另一个工作流会在每周日北京时间 11:30 同步 Tidings、SaveWeb、Plenary 和 RSSHub。同步采用完整快照策略：只要有一个上游失败，就不会覆盖上一次成功生成的候选目录。同步提交会在下一次日常构建时随 GitHub Pages 一起发布。

如需手动清理已有 Markdown，可运行：

```bash
pipenv run python cleanup.py README.md docs/README.md --retention-days 30
```

## 邮件通知（可选）

如果需要发送更新邮件，在仓库 **Settings → Secrets and variables → Actions** 中配置以下 Secrets：

- `USER`：SMTP 用户名
- `PASSWORD`：SMTP 密码或授权码
- `HOST`：SMTP 服务器地址

未配置时，站点构建和部署仍会正常执行，只会跳过邮件发送。

工作流的 `build` 任务用 `--no-email` 完成 RSS 构建、数据提交和文件上传。构建成功后，`deploy` 与 `notify` 两个任务独立执行；部署不等待邮件。邮件内容通过独立 artifact 传递，无需重新抓取 RSS 或从 README 提取。邮件认证、连接或配置读取失败只记录警告；发送步骤最多运行两分钟，失败或超时都不会阻断 Pages 部署。

本地可运行 `pipenv run python main.py --email-only`，使用已生成页面中的邮件内容发送通知，无需重新抓取 RSS。默认本地构建仍会尝试通知，但通知失败不会使构建失败。

也可运行 `pipenv run python main.py --email-only --email-content build/notification.html`，直接发送最近一次本地构建生成的通知文件。`build/` 不进入 Git。

## 构建与发布边界

两个写入仓库的工作流均显式检出最新 `main`，而非触发时的旧提交。因此第一次运行已提交数据但部署失败后，重跑不会再次从旧版本生成数据。提交前会重新获取远端 `main` 并验证它与构建基线一致；若构建期间分支已更新或无法验证，则停止提交及后续发布。此时重新运行即可从最新版本构建，不使用强制推送或自动合并生成文件。检查后若又有新的推送，普通 `git push` 仍会安全拒绝。

Pages 配置位于独立的 `deploy` 任务。未启用 Pages 等部署配置错误不会阻断已经成功的构建、数据提交和独立邮件通知；首次启用仍需完成上面的仓库 Pages 设置。

所有生成文件先写入临时目录，生成成功后才发布；生成阶段失败不会覆盖已发布文件。发布使用逐文件替换，并最后更新 API 快照指针，不是整个目录的事务替换。GitHub Pages 只在构建任务成功后部署上传的站点 artifact。

正式订阅目录维护方式见 [订阅源维护](./SOURCES.md)，移动端一致性读取方式见 [API 文档](./API.md)。

## 抓取性能与缓存

抓取保留 Requests + 线程池，每个工作线程单独持有 Session，复用连接，构建结束后关闭；不跨线程共享 Session。请求前清除 Cookie，避免不同订阅之间沿用会话信息。

同一次构建中，完全相同的 RSS 地址只下载和解析一次，再映射到各自的订阅源；展示顺序、订阅源 ID 和文章 ID 保持不变。不同源的结果列表相互独立，不会因一处修改影响另一处。

HTTP 缓存位于 `.cache/feed-responses/`，不会提交到 Git 或发布到 Pages。支持 ETag 和 Last-Modified 条件请求；收到 304 时重新解析缓存的原始 RSS，并按本次北京时间日期筛选，不复用上一次的文章列表。缓存缺失、损坏或写入失败不影响正常抓取；抓取失败仍由原有文章历史合并逻辑保留近期数据。只保存解析成功的响应，缓存最多 64 MiB，超过 30 天或已移除源的缓存会清理。

304 内容和校验标识未变化时只刷新缓存时间，不重新压缩或写入响应正文；标识变化时更新缓存。遇到 `Cache-Control: no-store` 或 `Vary: *` 会停止缓存并尝试清除该地址已有的 HTTP 缓存。这是原始响应缓存策略，不改变发布文章的历史保留规则。缓存规则参考 [HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)。

连接等待最多 5 秒，单次读取等待最多 8 秒，最多尝试 3 次。404 等永久错误、格式错误和超大响应不重试；408、429、服务端错误和网络错误允许重试。每源设置 45 秒重试预算，在请求、流式读取和退避之间检查。它不是可强制中断的严格墙钟时限：Requests 的超时针对连接/读取等待，底层阻塞及 DNS 等仍可能超过预算。

错误响应包含 `Retry-After` 时，支持秒数和 HTTP 日期两种格式，并至少等待服务器指定的时间；若等待会耗尽本次预算，则不再重试。缺失或无效值回退到指数退避。格式依据 [HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)，HTTP 日期使用 Python 标准库解析。

## 成熟技术方案与审核校验

现阶段保留成熟的 Requests、feedparser 和原生 ES 模块，不引入异步 HTTP 或前端框架的大规模迁移；先优化现有连接和缓存，并用测试验证行为。后续确有并发规模需求时，再基于测量评估异步方案。

审核结构校验使用 [Ajv standalone](https://ajv.js.org/standalone.html)，格式校验使用 ajv-formats，esbuild 将运行时辅助代码打包为浏览器模块。这些只属于开发依赖，版本由 `package-lock.json` 锁定；浏览器不动态编译 Schema，不加载 npm 或 CDN。公开的 `docs/api/v1/review-schema.json` 是唯一结构规则来源，业务层仅额外检查数量一致性、重复 ID、候选 ID 对应关系和安全 URL。

修改 Schema 后执行 `npm ci --ignore-scripts` 和 `npm run build:review-schema`；提交生成的 `contract.mjs`，CI 会执行 `npm run check:review-schema`，阻止 Schema 和校验器不同步。可运行 `npm test` 验证审核行为。
