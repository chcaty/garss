import html
import re
from datetime import datetime
from urllib.parse import quote, urlsplit

from garss.models import Article, FeedResult, SourceTemplate
from garss.timezones import APP_TIMEZONE

MAIL_CONTENT_RE = re.compile(r"邮件内容区开始>([.\S\s]*)<邮件内容区结束")


def _markdown_text(value: str) -> str:
    value = value.replace("\r", " ").replace("\n", " ")
    value = html.escape(value, quote=False)
    for character in ("\\", "[", "]", "|", "(", ")"):
        value = value.replace(character, f"\\{character}")
    return value


def _markdown_url(value: str) -> str:
    return quote(value, safe=":/?#[]@!$&'*+,;=%")


def _article_date(article: Article):
    return article.published_at.astimezone(APP_TIMEZONE).date()


def _article_link(article: Article, today) -> str:
    published = _article_date(article)
    marker = " 🌈 " if published == today else " \\| "
    return (
        f"[‣ {_markdown_text(article.title)}{marker}{published.isoformat()}]"
        f"({_markdown_url(article.url)})"
    )


def _homepage(feed_url: str) -> str:
    parsed = urlsplit(feed_url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _latest_content(result: FeedResult, today, retention_days: int) -> str:
    if result.articles:
        return "<br/>".join(
            _article_link(article, today) for article in result.articles[:2]
        )
    if result.error:
        return (
            "[暂无法通过爬虫获取信息, 点击进入源网站主页]"
            f"({_markdown_url(_homepage(result.source.feed_url))})"
        )
    return f"[近{retention_days}天暂无更新]({_markdown_url(result.source.feed_url)})"


def _today_index(results: list[FeedResult], today) -> tuple[str, int]:
    articles = []
    seen_urls = set()
    for result in results:
        for article in result.articles:
            if _article_date(article) != today or article.url in seen_urls:
                continue
            seen_urls.add(article.url)
            articles.append(article)
    articles.sort(key=lambda article: article.published_at, reverse=True)

    rows = []
    for index, article in enumerate(articles, start=1):
        background = "background-color:#FAF6EA;" if index % 2 else ""
        rows.append(
            f"<div style='line-height:3;{background}'><a "
            f"href='{html.escape(article.url, quote=True)}' "
            "style='line-height:2;text-decoration:none;display:block;color:#584D49;'>"
            f"🌈 ‣ {html.escape(article.title)} | 第{index}篇</a></div>"
        )
    return "".join(rows), len(articles)


def build_readme(
    template: str,
    source_templates: list[SourceTemplate],
    results: list[FeedResult],
    generated_at: datetime,
    retention_days: int = 30,
) -> tuple[str, str]:
    local_time = generated_at.astimezone(APP_TIMEZONE)
    today = local_time.date()
    result_by_id = {result.source.id: result for result in results}

    output = template.replace("{{rss_num}}", str(len(source_templates)))
    output = output.replace(
        "{{ga_rss_datetime}}", local_time.strftime("%Y-%m-%d %H:%M:%S")
    )
    news, article_count = _today_index(results, today)
    output = output.replace("{{news}}", news)
    output = output.replace("{{new_num}}", str(article_count))

    if "{{source_table}}" in output:
        output = output.replace("{{source_table}}", render_source_table(source_templates, results, today, retention_days))

    for source_template in source_templates:
        if not source_template.row:
            continue
        result = result_by_id[source_template.source.id]
        rendered_row = source_template.row.replace(
            "{{latest_content}}", _latest_content(result, today, retention_days)
        )
        output = output.replace(source_template.row, rendered_row, 1)

    output = output.replace(
        "./_media", "https://cdn.jsdelivr.net/gh/chcaty/garss/_media"
    )
    had_trailing_newline = output.endswith(("\n", "\r"))
    output = "\n".join(line.rstrip() for line in output.splitlines())
    if had_trailing_newline:
        output += "\n"
    mail_match = MAIL_CONTENT_RE.search(output)
    email_html = mail_match.group(1) if mail_match else ""
    return output, email_html


def render_source_table(templates, results, today, retention_days):
    result_by_id = {result.source.id: result for result in results}
    rows = ["| 编号 | 名称 | 描述 | 最新内容 | RSS |", "| --- | --- | --- | --- | --- |"]
    category = None
    for item in templates:
        if category != item.category:
            category = item.category
            label = html.escape(category.replace("\r", " ").replace("\n", " "), quote=True)
            label = label.replace("|", "&#124;")
            rows.append(f'| <h2 id="{label}">{label}</h2> | | | | |')
        display_id = _markdown_text(item.display_id or item.source.id)
        if item.icon:
            display_id = (
                f'<img src="./_media/{quote(item.icon, safe="/")}" width="30" alt=""/><br>'
                f"{display_id}"
            )
        content = _latest_content(result_by_id[item.source.id], today, retention_days)
        rows.append(
            f"| {display_id} | {_markdown_text(item.source.title)} | "
            f"{_markdown_text(item.source.description)} | {content} | "
            f"[订阅地址]({_markdown_url(item.source.feed_url)}) |"
        )
    return "\n".join(rows)
