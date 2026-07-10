import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models.dart';
import '../providers.dart';

class TodoDetailScreen extends ConsumerWidget {
  const TodoDetailScreen({super.key, required this.id});

  final String id;

  Future<void> _showEditDialog(BuildContext context, WidgetRef ref, Todo t) async {
    final title = TextEditingController(text: t.title);
    final notes = TextEditingController(text: t.notes ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit todo'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: title,
              decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notes,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Notes', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved == true && title.text.trim().isNotEmpty) {
      await ref.read(apiProvider).updateTodo(t.id, {
        'title': title.text.trim(),
        'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
      });
      invalidateTodoData(ref);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Todo')),
      body: FutureBuilder<Todo>(
        future: api.getTodo(id),
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || !snap.hasData) {
            return const Center(child: Text('Todo not found'));
          }
          final t = snap.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(t.title,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.edit_outlined, size: 20),
                    tooltip: 'Edit',
                    onPressed: () => _showEditDialog(context, ref, t),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (t.isAi)
                Card(
                  color: Colors.deepPurple.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('🤖 Added by ${t.createdByAgent ?? "an AI agent"}',
                            style: TextStyle(
                                fontWeight: FontWeight.w600, color: Colors.deepPurple.shade800)),
                        if (t.originContext != null) ...[
                          const SizedBox(height: 4),
                          Text('"${t.originContext}"',
                              style: TextStyle(color: Colors.deepPurple.shade700)),
                        ],
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 8),
              _row('Status', t.status),
              _row('Due', t.dueAt != null ? DateFormat('EEE, MMM d HH:mm').format(t.dueAt!) : '—'),
              _row('Project', t.projectName ?? '—'),
              _row('Priority', ['None', 'Low', 'Medium', 'High'][t.priority]),
              if (t.tags.isNotEmpty) _row('Tags', t.tags.join(', ')),
              if (t.notes != null && t.notes!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(padding: const EdgeInsets.all(12), child: Text(t.notes!)),
                ),
              ],
              const SizedBox(height: 24),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (t.status != 'done')
                    FilledButton.icon(
                      icon: const Icon(Icons.check),
                      label: const Text('Complete'),
                      onPressed: () async {
                        await api.completeTodo(t.id);
                        invalidateTodoData(ref);
                        if (context.mounted) Navigator.pop(context);
                      },
                    ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.snooze),
                    label: const Text('Snooze 1h'),
                    onPressed: () async {
                      await api.snoozeTodo(t.id, 'in 1 hour');
                      if (context.mounted) {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(const SnackBar(content: Text('Snoozed 1 hour')));
                      }
                    },
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.wb_sunny_outlined),
                    label: const Text('Tomorrow'),
                    onPressed: () async {
                      await api.snoozeTodo(t.id, 'tomorrow 9am');
                      if (context.mounted) {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(const SnackBar(content: Text('Snoozed to tomorrow 9am')));
                      }
                    },
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                    label: const Text('Delete', style: TextStyle(color: Colors.red)),
                    onPressed: () async {
                      await api.deleteTodo(t.id);
                      invalidateTodoData(ref);
                      if (context.mounted) Navigator.pop(context);
                    },
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(width: 90, child: Text(label, style: TextStyle(color: Colors.grey.shade500))),
            Expanded(child: Text(value)),
          ],
        ),
      );
}
