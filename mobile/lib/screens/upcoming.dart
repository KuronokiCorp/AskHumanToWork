import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'todo_tile.dart';

class UpcomingScreen extends ConsumerWidget {
  const UpcomingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agenda = ref.watch(agendaProvider);
    return agenda.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load: $e')),
      data: (a) => RefreshIndicator(
        onRefresh: () async => invalidateTodoData(ref),
        child: TodoListView(todos: a.upcoming, emptyText: 'Nothing due in the next 7 days.'),
      ),
    );
  }
}
