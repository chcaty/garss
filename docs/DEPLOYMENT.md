# 部署与维护

项目通过 `.github/workflows/build-and-deploy.yml` 自动抓取订阅源、运行测试、更新生成文件，并将 `docs/` 发布到 GitHub Pages。

## 首次启用 GitHub Pages

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库 **Settings → Pages**，在 **Build and deployment** 中把 **Source** 设为 **GitHub Actions**。
3. 打开 **Settings → Actions → General**，确认 Workflow permissions 允许 Actions 写入仓库内容；自动提交生成数据需要这个权限。
4. 在 **Actions** 页面手动运行一次 **Build feeds and deploy Pages**。

部署成功后，站点地址通常为 `https://<用户名>.github.io/<仓库名>/`。本仓库的静态 API 位于站点地址下的 `api/` 路径。

`review.html` 会在同一站点注册 Service Worker。GitHub Pages 默认提供 HTTPS，满足 PWA 安装和离线缓存要求；若在本地调试，应通过 `localhost` HTTP 服务访问，不要直接双击 HTML 文件。每次更新 `service-worker.js` 的缓存版本后，旧缓存会在激活阶段自动清理。

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
