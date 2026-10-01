import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/models.dart';
import '../state/library.dart';
import 'article.dart';
import 'theme.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int tab = 0;
  String query = '', source = '';
  bool unread = false, balanced = true, started = false;
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void chooseTab(int index) {
    setState(() {
      tab = index;
      query = '';
      search.clear();
      source = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(libraryProvider, (previous, next) {
      if (!started && next.hasValue) {
        started = true;
        if (next.requireValue.message.contains('缓存')) {
          Future.microtask(() => ref.read(libraryProvider.notifier).refresh());
        }
      }
    });
    final library = ref.watch(libraryProvider);
    const titles = ['今日阅读', '收藏', '订阅来源', '阅读设置'];
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Image.asset('assets/logo.png', width: 32, height: 32),
            const SizedBox(width: 10),
            Text(
              titles[tab],
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          if (library.hasValue)
            IconButton(
              tooltip: '同步文章',
              onPressed: library.requireValue.syncing
                  ? null
                  : () => ref.read(libraryProvider.notifier).refresh(),
              icon: const Icon(Icons.sync),
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: chooseTab,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.view_agenda_outlined),
            selectedIcon: Icon(Icons.view_agenda),
            label: '阅读',
          ),
          NavigationDestination(
            icon: Icon(Icons.bookmark_border),
            selectedIcon: Icon(Icons.bookmark),
            label: '收藏',
          ),
          NavigationDestination(icon: Icon(Icons.rss_feed), label: '来源'),
          NavigationDestination(icon: Icon(Icons.tune), label: '设置'),
        ],
      ),
      body: library.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_outlined, size: 48, color: muted),
                const SizedBox(height: 16),
                const Text(
                  '暂时无法同步文章',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                const Text('首次使用需要联网。请检查网络后重试。', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => ref.invalidate(libraryProvider),
                  child: const Text('重新同步'),
                ),
              ],
            ),
          ),
        ),
        data: (data) => tab == 2
            ? SourcesPage(library: data)
            : tab == 3
            ? SettingsPage(library: data)
            : reading(data),
      ),
    );
  }

  Widget reading(LibraryState library) {
    final filtered = library.visible(
      query: query,
      savedOnly: tab == 1,
      unreadOnly: unread,
      source: source,
    );
    final articles = balanced && tab == 0 && source.isEmpty
        ? diversify(filtered)
        : filtered;
    final activeFeeds = library.catalog.feeds
        .where((feed) => !library.hidden.contains(feed.id))
        .toList();
    final selectedSource = activeFeeds.any((feed) => feed.id == source)
        ? source
        : '';
    final header = Column(
      children: [
        if (library.syncing) const LinearProgressIndicator(minHeight: 2),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (tab == 0) ...[
                const Text(
                  '世界很大，多读一点。',
                  style: TextStyle(
                    fontFamily: 'Editorial',
                    fontSize: 24,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              Text(
                library.message.isNotEmpty
                    ? library.message
                    : '最近同步 ${articleDate(library.catalog.generatedAt)}',
                style: const TextStyle(fontSize: 12, color: muted),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: search,
                onChanged: (value) => setState(() => query = value),
                decoration: InputDecoration(
                  hintText: tab == 1 ? '搜索收藏' : '搜索文章、摘要或来源',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: '清除搜索',
                          onPressed: () {
                            search.clear();
                            setState(() => query = '');
                          },
                          icon: const Icon(Icons.close),
                        ),
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  FilterChip(
                    label: const Text('只看未读'),
                    selected: unread,
                    onSelected: (value) => setState(() => unread = value),
                  ),
                  Text(
                    '${articles.length} 篇${tab == 1 ? '收藏' : '文章'}',
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                  if (tab == 0)
                    PopupMenuButton<bool>(
                      tooltip: '文章排序',
                      initialValue: balanced,
                      onSelected: (value) => setState(() => balanced = value),
                      itemBuilder: (context) => [
                        const PopupMenuItem(value: true, child: Text('按来源轮换')),
                        const PopupMenuItem(value: false, child: Text('最新发布')),
                      ],
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              balanced ? '来源轮换' : '最新发布',
                              style: const TextStyle(fontSize: 12),
                            ),
                            const Icon(Icons.expand_more, size: 18),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              if (tab == 0)
                DropdownButtonFormField<String>(
                  initialValue: selectedSource,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    contentPadding: EdgeInsets.symmetric(horizontal: 12),
                  ),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('全部关注来源')),
                    for (final feed in activeFeeds)
                      DropdownMenuItem(
                        value: feed.id,
                        child: Text(
                          feed.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (value) => setState(() => source = value ?? ''),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
    return RefreshIndicator(
      onRefresh: () => ref.read(libraryProvider.notifier).refresh(),
      child: CustomScrollView(
        key: PageStorageKey('articles-$tab'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: header),
          if (articles.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      tab == 1
                          ? Icons.bookmark_border
                          : Icons.auto_stories_outlined,
                      size: 44,
                      color: muted,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      tab == 1 ? '这里留给想再读的文章' : '没有匹配的文章',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      tab == 1 ? '在文章右侧点击收藏，稍后回到这里阅读。' : '调整关键词、未读筛选或到来源页选择订阅。',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: muted, height: 1.7),
                    ),
                  ],
                ),
              ),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate((context, index) {
                if (index.isOdd) {
                  return const Divider(height: 1, indent: 20, endIndent: 20);
                }
                final article = articles[index ~/ 2];
                return ArticleRow(
                  key: ValueKey(article.id),
                  article: article,
                  library: library,
                );
              }, childCount: articles.length * 2 - 1),
            ),
        ],
      ),
    );
  }
}

List<Article> diversify(List<Article> articles) {
  final groups = <String, List<Article>>{};
  for (final article in articles) {
    groups.putIfAbsent(article.sourceId, () => []).add(article);
  }
  final result = <Article>[];
  for (var round = 0; result.length < articles.length; round++) {
    final batch = [
      for (final group in groups.values)
        if (round < group.length) group[round],
    ]..sort((a, b) => b.publishedAt.compareTo(a.publishedAt));
    result.addAll(batch);
  }
  return result;
}

class ArticleRow extends ConsumerWidget {
  const ArticleRow({super.key, required this.article, required this.library});
  final Article article;
  final LibraryState library;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = library.saved.containsKey(article.id),
        read = library.read.contains(article.id);
    return InkWell(
      onTap: () {
        ref.read(libraryProvider.notifier).markRead(article.id);
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) => ArticleScreen(article: article),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (!read)
                  const Padding(
                    padding: EdgeInsets.only(right: 6),
                    child: Icon(Icons.circle, size: 7, color: olive),
                  ),
                Expanded(
                  child: Text(
                    '${article.sourceTitle} · ${articleDate(article.publishedAt)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: muted),
                  ),
                ),
                IconButton(
                  tooltip: saved ? '取消收藏' : '收藏文章',
                  onPressed: () =>
                      ref.read(libraryProvider.notifier).toggleSaved(article),
                  icon: Icon(
                    saved ? Icons.bookmark : Icons.bookmark_border,
                    color: olive,
                  ),
                ),
              ],
            ),
            Text(
              article.title,
              style: TextStyle(
                fontSize: 18 * library.fontScale,
                height: 1.55,
                fontWeight: read ? FontWeight.w500 : FontWeight.w700,
                color: read ? muted : ink,
              ),
            ),
            if (article.summary.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                article.summary,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14 * library.fontScale,
                  height: 1.7,
                  color: muted,
                ),
              ),
            ],
            if (library.showImages && article.imageUrl.isNotEmpty) ...[
              const SizedBox(height: 14),
              ArticleImage(url: article.imageUrl),
            ],
          ],
        ),
      ),
    );
  }
}

class SourcesPage extends ConsumerStatefulWidget {
  const SourcesPage({super.key, required this.library});
  final LibraryState library;
  @override
  ConsumerState<SourcesPage> createState() => _SourcesPageState();
}

class _SourcesPageState extends ConsumerState<SourcesPage> {
  String query = '';
  @override
  Widget build(BuildContext context) {
    final feeds = widget.library.catalog.feeds
        .where(
          (feed) => '${feed.title} ${feed.description}'.toLowerCase().contains(
            query.toLowerCase(),
          ),
        )
        .toList();
    final counts = <String, int>{};
    for (final article in widget.library.catalog.articles) {
      counts.update(article.sourceId, (value) => value + 1, ifAbsent: () => 1);
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('选择你想阅读的来源', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                '关闭的来源会从阅读信息流隐藏，收藏仍然保留。',
                style: TextStyle(color: muted, height: 1.6),
              ),
              const SizedBox(height: 16),
              TextField(
                onChanged: (value) => setState(() => query = value),
                decoration: const InputDecoration(
                  hintText: '查找来源',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            itemCount: feeds.length,
            separatorBuilder: (context, index) =>
                const Divider(height: 1, indent: 20),
            itemBuilder: (context, index) {
              final feed = feeds[index];
              return SwitchListTile(
                title: Text(feed.title),
                subtitle: Text(
                  '${counts[feed.id] ?? 0} 篇文章${feed.status == 'error' ? ' · 最近抓取失败' : ''}',
                ),
                value: !widget.library.hidden.contains(feed.id),
                onChanged: (enabled) =>
                    ref.read(libraryProvider.notifier).follow(feed.id, enabled),
              );
            },
          ),
        ),
      ],
    );
  }
}

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key, required this.library});
  final LibraryState library;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        '让阅读舒服一点',
        style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 24),
      const Text(
        '文章字号',
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      Slider(
        value: library.fontScale,
        min: 1,
        max: 1.4,
        divisions: 4,
        label: '${(library.fontScale * 100).round()}%',
        onChanged: (value) =>
            ref.read(libraryProvider.notifier).setFontScale(value),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('显示文章图片'),
        subtitle: const Text('图片从原站加载，关闭可节省流量。'),
        value: library.showImages,
        onChanged: (value) =>
            ref.read(libraryProvider.notifier).setImages(value),
      ),
      const Divider(height: 40),
      const Text(
        '本机阅读记录',
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 12),
      Text(
        '${library.saved.length} 篇收藏 · ${library.read.length} 篇已读',
        style: const TextStyle(color: muted),
      ),
      const SizedBox(height: 12),
      const Text(
        '文章目录、摘要、收藏与已读状态保存在本机。完整原文和远程图片需要联网，记录不会上传到 GitHub。',
        style: TextStyle(color: muted, height: 1.8),
      ),
      const Divider(height: 40),
      const Text(
        '嘎!RSS · Android 预览版 0.1.0',
        style: TextStyle(fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 12),
      const Text(
        '订阅数据由 GitHub Pages 提供。下拉刷新同步最新快照，收藏会在文章离开目录后继续保留。',
        style: TextStyle(color: muted, height: 1.8),
      ),
      const SizedBox(height: 16),
      OutlinedButton.icon(
        onPressed: () => launchUrl(
          Uri.parse('https://chcaty.github.io/garss/review.html'),
          mode: LaunchMode.externalApplication,
        ),
        icon: const Icon(Icons.fact_check_outlined),
        label: const Text('打开订阅源审核台'),
      ),
    ],
  );
}
