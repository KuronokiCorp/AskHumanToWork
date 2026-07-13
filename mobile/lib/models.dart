/// Wire models mirroring @askhumantowork/shared schemas (field names identical).
class Todo {
  final String id;
  final String? projectId;
  final String? projectName;
  final String title;
  final String? notes;
  final DateTime? dueAt;
  final String status;
  final int priority;
  final String source;
  final String? createdByAgent;
  final String? createdByToken;
  final String? originContext;
  final List<String> tags;
  /// Human display of the recurrence rule, e.g. "every monday"; null if one-off.
  final String? recurrenceDisplay;
  final DateTime? completedAt;

  Todo({
    required this.id,
    this.projectId,
    this.projectName,
    required this.title,
    this.notes,
    this.dueAt,
    required this.status,
    required this.priority,
    required this.source,
    this.createdByAgent,
    this.createdByToken,
    this.originContext,
    required this.tags,
    this.recurrenceDisplay,
    this.completedAt,
  });

  factory Todo.fromJson(Map<String, dynamic> json) => Todo(
        id: json['id'] as String,
        projectId: json['projectId'] as String?,
        projectName: json['projectName'] as String?,
        title: json['title'] as String,
        notes: json['notes'] as String?,
        dueAt: json['dueAt'] != null ? DateTime.parse(json['dueAt'] as String).toLocal() : null,
        status: json['status'] as String,
        priority: (json['priority'] as num).toInt(),
        source: json['source'] as String,
        createdByAgent: json['createdByAgent'] as String?,
        createdByToken: json['createdByToken'] as String?,
        originContext: json['originContext'] as String?,
        tags: (json['tags'] as List<dynamic>? ?? []).cast<String>(),
        recurrenceDisplay: (json['recurrence'] as Map<String, dynamic>?)?['display'] as String?,
        completedAt: json['completedAt'] != null
            ? DateTime.parse(json['completedAt'] as String).toLocal()
            : null,
      );

  bool get isOpen => status == 'open' || status == 'doing';
  bool get isOverdue => isOpen && dueAt != null && dueAt!.isBefore(DateTime.now());
  bool get isAi => source == 'ai';
}

class Project {
  final String id;
  final String name;
  final String? color;

  Project({required this.id, required this.name, this.color});

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        id: json['id'] as String,
        name: json['name'] as String,
        color: json['color'] as String?,
      );
}

class Agenda {
  final String summary;
  final List<Todo> overdue;
  final List<Todo> today;
  final List<Todo> upcoming;

  Agenda({required this.summary, required this.overdue, required this.today, required this.upcoming});

  factory Agenda.fromJson(Map<String, dynamic> json) => Agenda(
        summary: json['summary'] as String,
        overdue: (json['overdue'] as List<dynamic>).map((e) => Todo.fromJson(e as Map<String, dynamic>)).toList(),
        today: (json['today'] as List<dynamic>).map((e) => Todo.fromJson(e as Map<String, dynamic>)).toList(),
        upcoming: (json['upcoming'] as List<dynamic>).map((e) => Todo.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class PendingReminder {
  final String id;
  final String todoId;
  final DateTime fireAt;
  final String title;

  PendingReminder({required this.id, required this.todoId, required this.fireAt, required this.title});

  factory PendingReminder.fromJson(Map<String, dynamic> json) => PendingReminder(
        id: json['id'] as String,
        todoId: json['todoId'] as String,
        fireAt: DateTime.parse(json['fireAt'] as String).toLocal(),
        title: json['title'] as String,
      );
}
