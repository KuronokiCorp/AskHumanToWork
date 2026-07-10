import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

/// Bottom sheet quick-add: title + natural-language due date (server-resolved).
void showQuickAddSheet(BuildContext context, WidgetRef ref) {
  final title = TextEditingController();
  final due = TextEditingController();
  final project = TextEditingController();

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('New todo', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(
            controller: title,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: due,
            decoration: const InputDecoration(
              labelText: 'Due (natural language)',
              hintText: 'e.g. friday 5pm, in 3 days',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: project,
            decoration: const InputDecoration(
              labelText: 'Project (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              if (title.text.trim().isEmpty) return;
              final messenger = ScaffoldMessenger.of(context);
              try {
                await ref.read(apiProvider).createTodo({
                  'title': title.text.trim(),
                  if (due.text.trim().isNotEmpty) 'dueNatural': due.text.trim(),
                  if (project.text.trim().isNotEmpty) 'project': project.text.trim(),
                });
                invalidateTodoData(ref);
                if (sheetContext.mounted) Navigator.pop(sheetContext);
              } catch (e) {
                messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
              }
            },
            child: const Text('Add'),
          ),
        ],
      ),
    ),
  );
}
