import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../notifications.dart';
import '../providers.dart';
import 'ai_inbox.dart';
import 'projects.dart';
import 'quick_add.dart';
import 'search.dart';
import 'settings.dart';
import 'today.dart';
import 'upcoming.dart';

final _notificationService = NotificationService();

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Mirror server reminders as local notifications on launch.
    Future.microtask(() async {
      try {
        await _notificationService.syncFromServer(ref.read(apiProvider));
      } catch (_) {/* offline or permissions denied — non-fatal */}
    });
  }

  static const _titles = ['Today', 'Upcoming', 'Projects', 'AI Inbox'];

  @override
  Widget build(BuildContext context) {
    final body = switch (_tab) {
      0 => const TodayScreen(),
      1 => const UpcomingScreen(),
      2 => const ProjectsScreen(),
      _ => const AiInboxScreen(),
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_tab]),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const SearchScreen())),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () async {
              invalidateTodoData(ref);
              try {
                await _notificationService.syncFromServer(ref.read(apiProvider));
              } catch (_) {}
            },
          ),
          PopupMenuButton<String>(
            onSelected: (value) async {
              if (value == 'settings') {
                if (context.mounted) {
                  Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const SettingsScreen()));
                }
              } else if (value == 'logout') {
                await ref.read(apiProvider).logout();
                ref.invalidate(authStateProvider);
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'settings', child: Text('Settings')),
              PopupMenuItem(value: 'logout', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: body,
      floatingActionButton: FloatingActionButton(
        onPressed: () => showQuickAddSheet(context, ref),
        child: const Icon(Icons.add),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today), label: 'Today'),
          NavigationDestination(icon: Icon(Icons.calendar_month), label: 'Upcoming'),
          NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projects'),
          NavigationDestination(icon: Icon(Icons.smart_toy_outlined), label: 'AI Inbox'),
        ],
      ),
    );
  }
}
