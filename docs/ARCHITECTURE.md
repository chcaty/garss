# 代码结构与验证

## Python 构建

- `main.py`：解析命令行参数，启动构建或仅发送通知。
- `garss/runner.py`：协调源目录、抓取、历史保留、生成与原子发布。
- `garss/fetch_pool.py`：有界并发、每工作线程复用连接、相同 URL 只下载一次，并保留各源的文章身份。
- `garss/notifications.py`：读取收件人并发送可选通知；通知失败不会中断发布。
- `garss/catalog.py`、`fetch.py`、`feed_cache.py`、`history.py`、`render.py`、`output.py`：分别负责源目录、单源抓取、条件请求缓存、历史合并、内容渲染和产物发布。

## 静态页面

- `index.html` 与 `assets/reader/`：阅读页、快照加载和可独立测试的筛选分页逻辑。
- `review.html` 与 `assets/review/`：审核协调器、候选条目、RSSHub 路由、导入导出、存储、结构校验和 PWA。
- `assets/shared/`：两页共用的设计变量、基础控件和安全 DOM 构造。
- `guide.html`：保留 Docsify 文档入口。
- `reviews/*.json` 与 `scripts/lib/reviews.mjs`：版本化审核提交、候选身份校验和幂等收录计划。PR 预检后，由构建任务应用已合并结果。
- `assets/review/online.mjs`、`payload.mjs`：GitHub 提交入口、公共状态与本机决定的时间优先级，以及统一的导出契约。
- `service-worker.js`：仅处理审核台及其明确列出的资源和目录，更新依赖时同步更新缓存版本和资源清单。

阅读页先读取 `meta.json`，再读取其快照 manifest，并行加载该快照中的来源与文章；校验时间一致性。渲染使用 `textContent`，外链只接受 HTTP/HTTPS。审核记录仍保存在本机；API 契约和 OPML 导出格式保留。

## 本地验证

```sh
pipenv sync --dev
pipenv run test
npm ci --ignore-scripts
npm test
npm run check:review-schema
python scripts/preview.py
```

浏览器检查桌面与 390px 手机布局、搜索空结果和清除、分页、审核导出和刷新恢复、键盘页签、RSSHub 加载、离线审核、网络失败重试以及旧文档链接。只检查缓存后的审核台离线能力，不将阅读首页描述为离线应用。
