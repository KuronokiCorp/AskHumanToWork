import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';

final apiProvider = Provider<ApiClient>((ref) => ApiClient());

final authStateProvider = FutureProvider<bool>((ref) => ref.watch(apiProvider).hasToken());

final agendaProvider = FutureProvider<Agenda>((ref) async {
  final api = ref.watch(apiProvider);
  try {
    return await api.agenda();
  } catch (_) {
    final cached = await api.cachedAgenda();
    if (cached != null) return cached; // offline fallback
    rethrow;
  }
});

final aiInboxProvider = FutureProvider<List<Todo>>(
  (ref) => ref.watch(apiProvider).todos({'source': 'ai', 'limit': '100'}),
);

final projectsProvider = FutureProvider<List<Project>>((ref) => ref.watch(apiProvider).projects());

final projectTodosProvider = FutureProvider.family<List<Todo>, String>(
  (ref, name) => ref.watch(apiProvider).todos({'project': name, 'limit': '200'}),
);

void invalidateTodoData(WidgetRef ref) {
  ref.invalidate(agendaProvider);
  ref.invalidate(aiInboxProvider);
  ref.invalidate(projectsProvider);
}
