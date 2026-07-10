import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers.dart';
import 'screens/home.dart';
import 'screens/login.dart';
import 'screens/todo_detail.dart';

void main() {
  runApp(const ProviderScope(child: AskHumanToWorkApp()));
}

class AskHumanToWorkApp extends ConsumerWidget {
  const AskHumanToWorkApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);

    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
        GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
        GoRoute(
            path: '/t/:id',
            builder: (_, state) =>
                TodoDetailScreen(id: state.pathParameters['id']!)),
      ],
      redirect: (_, state) {
        final loggedIn = auth.value ?? false;
        if (!loggedIn && state.matchedLocation != '/login') return '/login';
        if (loggedIn && state.matchedLocation == '/login') return '/';
        return null;
      },
    );

    return MaterialApp.router(
      title: 'AskHumanToWork',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF4F46E5)),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
