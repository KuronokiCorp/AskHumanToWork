import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'todo_tile.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agenda = ref.watch(agendaProvider);
    return agenda.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load: $e')),
      data: (a) => RefreshIndicator(
        onRefresh: () async => invalidateTodoData(ref),
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Text(a.summary, style: TextStyle(color: Colors.grey.shade600)),
            ),
            if (a.overdue.isNotEmpty) ...[
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('🔥 ${a.overdue.length} overdue',
                    style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.w600)),
              ),
              for (final t in a.overdue) TodoTile(todo: t),
              const Divider(indent: 16, endIndent: 16),
            ],
            if (a.today.isEmpty && a.overdue.isEmpty)
              Padding(
                padding: const EdgeInsets.all(32),
                child: Center(
                    child: Text('Nothing due today. Enjoy the calm.',
                        style: TextStyle(color: Colors.grey.shade500))),
              ),
            for (final t in a.today) TodoTile(todo: t),
          ],
        ),
      ),
    );
  }
}
