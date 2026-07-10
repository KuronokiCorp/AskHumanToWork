import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'todo_tile.dart';

class AiInboxScreen extends ConsumerWidget {
  const AiInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todos = ref.watch(aiInboxProvider);
    return todos.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load: $e')),
      data: (list) => RefreshIndicator(
        onRefresh: () async => invalidateTodoData(ref),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                'Todos your AI agents captured — each shows why it exists.',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ),
            Expanded(
              child: TodoListView(
                todos: list,
                emptyText: 'No AI-captured todos yet.\nConnect an agent via MCP.',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
