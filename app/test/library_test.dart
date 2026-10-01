import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:garss_app/data/models.dart';
import 'package:garss_app/data/repository.dart';
import 'package:garss_app/state/library.dart';
import 'package:garss_app/ui/home.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final article = Article(
  id: 'article',
  sourceId: 'source',
  title: '阅读示例',
  url: 'https://example.com/post',
  publishedAt: DateTime.utc(2026, 10, 1),
  sourceTitle: '示例来源',
  summary: '保存在本机的摘要',
);
final catalog = Catalog(
  generatedAt: DateTime.utc(2026, 10, 1),
  feeds: [
    const Feed(id: 'source', title: '示例来源', url: 'https://example.com/feed'),
  ],
  articles: [article],
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'local preferences survive restart and bookmarks outlive catalog retention',
    () async {
      SharedPreferences.setMockInitialValues({
        'catalog-v1': jsonEncode(catalog.toJson()),
      });
      var container = ProviderContainer();
      var data = await container.read(libraryProvider.future);
      expect(data.catalog.articles.single.title, '阅读示例');
      container.read(libraryProvider.notifier).toggleSaved(article);
      container.read(libraryProvider.notifier).markRead(article.id);
      container.read(libraryProvider.notifier).follow('source', false);
      expect(container.read(libraryProvider).requireValue.visible(), isEmpty);
      expect(
        container
            .read(libraryProvider)
            .requireValue
            .visible(savedOnly: true)
            .single
            .id,
        article.id,
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
      container.dispose();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'catalog-v1',
        jsonEncode(
          Catalog(
            generatedAt: catalog.generatedAt,
            feeds: catalog.feeds,
            articles: [],
          ).toJson(),
        ),
      );
      container = ProviderContainer();
      data = await container.read(libraryProvider.future);
      expect(data.saved[article.id]?.summary, article.summary);
      expect(data.read, contains(article.id));
      expect(data.hidden, contains('source'));
      container.dispose();
    },
  );
  test('failed sync preserves catalog and user changes', () async {
    SharedPreferences.setMockInitialValues({
      'catalog-v1': jsonEncode(catalog.toJson()),
    });
    final container = ProviderContainer(
      overrides: [
        repositoryProvider.overrideWithValue(
          CatalogRepository(
            MockClient((request) async => http.Response('offline', 503)),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await container.read(libraryProvider.future);
    container.read(libraryProvider.notifier).toggleSaved(article);
    await container.read(libraryProvider.notifier).refresh();
    final data = container.read(libraryProvider).requireValue;
    expect(data.catalog.articles.single.id, article.id);
    expect(data.saved, contains(article.id));
    expect(data.message, contains('同步失败'));
  });
  test('source rotation prevents one active source monopolizing the feed', () {
    final second = Article(
      id: 'second',
      sourceId: 'source',
      title: 'Second',
      url: 'https://example.com/second',
      publishedAt: article.publishedAt.subtract(const Duration(minutes: 1)),
    );
    final third = Article(
      id: 'third',
      sourceId: 'other',
      title: 'Other',
      url: 'https://example.com/third',
      publishedAt: article.publishedAt.subtract(const Duration(hours: 1)),
    );
    expect(diversify([article, second, third]).map((value) => value.id), [
      'article',
      'third',
      'second',
    ]);
  });
}
