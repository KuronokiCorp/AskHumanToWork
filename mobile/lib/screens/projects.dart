import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'todo_tile.dart';

class ProjectsScreen extends ConsumerWidget {
  const ProjectsScreen({super.key});

  Color _parseColor(String? hex) {
    if (hex == null || !hex.startsWith('#') || hex.length != 7) return Colors.grey;
    return Color(int.parse('FF${hex.substring(1)}', radix: 16));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    return projects.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load: $e')),
      data: (list) => ListView(
        children: [
          for (final p in list)
            ListTile(
              leading: Icon(Icons.circle, size: 12, color: _parseColor(p.color)),
              title: Text(p.name),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ProjectTodosScreen(name: p.name)),
              ),
            ),
        ],
      ),
    );
  }
}

class ProjectTodosScreen extends ConsumerWidget {
  const ProjectTodosScreen({super.key, required this.name});

  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todos = ref.watch(projectTodosProvider(name));
    return Scaffold(
      appBar: AppBar(title: Text('#$name')),
      body: todos.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load: $e')),
        data: (list) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(projectTodosProvider(name)),
          child: TodoListView(todos: list),
        ),
      ),
    );
  }
}
