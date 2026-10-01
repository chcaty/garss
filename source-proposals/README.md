# 手动新增订阅源

审核台“手动新增订阅源”表单生成提案文件。登录 GitHub 后选择新分支创建 PR；校验 RSS/Atom 链接并人工确认内容后合并，构建自动添加正式源与抓取最近 30 天的文章。

文件格式示例（示例地址需替换为真实 Feed）：

```json
{"schema_version":"1.0","title":"订阅名称","description":"说明","category":"博客","feed_url":"https://example.com/feed","submitted_at":"2026-10-02T00:00:00Z"}
```

提案文件与 `docs/api/v1/source-proposals.json` 的处理记录保留供后续构建核对；重复 URL 不会产生重复订阅，删除正式源后旧提案不会重新添加它。已处理的提案不可修改，需要重新提案时请创建新文件。稳定 ID 根据规范化 URL 自动生成。编辑已有正式源请在 GitHub 修改 `sources.json`，保持 ID 不变并创建 PR；网页和 App 均不会直接持有仓库写入令牌。
