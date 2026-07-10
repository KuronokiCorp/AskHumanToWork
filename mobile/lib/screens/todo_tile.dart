import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models.dart';
import '../providers.dart';

class TodoTile extends ConsumerWidget {
  const TodoTile({super.key, required this.todo});

  final Todo todo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final done = todo.status == 'done';
    final dueStyle = TextStyle(
      fontSize: 12,
      color: todo.isOverdue ? Colors.red : Colors.grey.shade600,
      fontWeight: todo.isOverdue ? FontWeight.w600 : FontWeight.normal,
    );

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        leading: IconButton(
          icon: Icon(
            done ? Icons.check_circle : Icons.radio_button_unchecked,
            color: done ? Colors.green : Colors.grey,
          ),
          onPressed: () async {
            final api = ref.read(apiProvider);
            if (done) {
              await api.updateTodo(todo.id, {'status': 'open'});
            } else {
              await api.completeTodo(todo.id);
            }
            invalidateTodoData(ref);
          },
        ),
        title: Text(
          todo.title,
          style: TextStyle(
            decoration: done ? TextDecoration.lineThrough : null,
            color: done ? Colors.grey : null,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (todo.dueAt != null)
                  Text('⏰ ${DateFormat('MMM d, HH:mm').format(todo.dueAt!)}', style: dueStyle),
                if (todo.projectName != null)
                  Text('#${todo.projectName}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                if (todo.priority > 0)
                  Text('!' * todo.priority,
                      style: const TextStyle(fontSize: 12, color: Colors.orange)),
                if (todo.isAi)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: Colors.deepPurple.shade50,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text('🤖 ${todo.createdByAgent ?? 'AI'}',
                        style: TextStyle(fontSize: 11, color: Colors.deepPurple.shade700)),
                  ),
              ],
            ),
            if (todo.isAi && todo.originContext != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  '"${todo.originContext}"',
                  style: TextStyle(
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                      color: Colors.deepPurple.shade300),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
        ),
        onTap: () => context.push('/t/${todo.id}'),
      ),
    );
  }
}

class TodoListView extends StatelessWidget {
  const TodoListView({super.key, required this.todos, this.emptyText = 'Nothing here.'});

  final List<Todo> todos;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    if (todos.isEmpty) {
      return Center(
        child: Text(emptyText, style: TextStyle(color: Colors.grey.shade500)),
      );
    }
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [for (final t in todos) TodoTile(todo: t)],
    );
  }
}
