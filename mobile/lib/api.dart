import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// iOS simulator reaches the host Mac at localhost; Android emulator at 10.0.2.2.
String defaultBaseUrl() {
  if (Platform.isAndroid) return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

class ApiClient {
  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: defaultBaseUrl(),
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 15),
    ));
    _dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) async {
      final token = await _storage.read(key: 'device_token');
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    }));
  }

  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  Future<bool> hasToken() async => await _storage.read(key: 'device_token') != null;

  Future<void> login(String email, String password) async {
    final res = await _dio.post('/api/auth/login', data: {
      'email': email,
      'password': password,
      'mode': 'token',
      'deviceName': 'flutter-${Platform.operatingSystem}',
    });
    await _storage.write(key: 'device_token', value: res.data['token'] as String);
  }

  Future<void> signup(String email, String password) async {
    await _dio.post('/api/auth/signup', data: {
      'email': email,
      'password': password,
      'timezone': DateTime.now().timeZoneName,
    });
    // signup sets a session cookie only; log in for a device token
    await login(email, password);
  }

  Future<void> logout() async => _storage.delete(key: 'device_token');

  Future<Map<String, dynamic>> me() async {
    final res = await _dio.get('/api/auth/me');
    return res.data as Map<String, dynamic>;
  }

  Future<void> updateNotificationPrefs(Map<String, dynamic> prefs) async {
    await _dio.patch('/api/auth/me', data: {'notificationPrefs': prefs});
  }

  // --- Todos ---

  Future<Agenda> agenda() async {
    final res = await _dio.get('/api/agenda');
    final agenda = Agenda.fromJson(res.data as Map<String, dynamic>);
    // offline snapshot
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('agenda_cache', jsonEncode(res.data));
    return agenda;
  }

  Future<Agenda?> cachedAgenda() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('agenda_cache');
    if (raw == null) return null;
    return Agenda.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<List<Todo>> todos(Map<String, String> params) async {
    final res = await _dio.get('/api/todos', queryParameters: params);
    return (res.data['todos'] as List<dynamic>)
        .map((e) => Todo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Todo> getTodo(String id) async {
    final res = await _dio.get('/api/todos/$id');
    return Todo.fromJson(res.data['todo'] as Map<String, dynamic>);
  }

  Future<Todo> createTodo(Map<String, dynamic> input) async {
    final res = await _dio.post('/api/todos', data: input);
    return Todo.fromJson(res.data['todo'] as Map<String, dynamic>);
  }

  Future<Todo> updateTodo(String id, Map<String, dynamic> patch) async {
    final res = await _dio.patch('/api/todos/$id', data: patch);
    return Todo.fromJson(res.data['todo'] as Map<String, dynamic>);
  }

  Future<Todo> completeTodo(String id) async {
    final res = await _dio.post('/api/todos/$id/complete');
    return Todo.fromJson(res.data['todo'] as Map<String, dynamic>);
  }

  Future<void> snoozeTodo(String id, String until) async {
    await _dio.post('/api/todos/$id/snooze', data: {'until': until});
  }

  Future<void> deleteTodo(String id) async => _dio.delete('/api/todos/$id');

  Future<List<Project>> projects() async {
    final res = await _dio.get('/api/projects');
    return (res.data['projects'] as List<dynamic>)
        .map((e) => Project.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<PendingReminder>> pendingReminders() async {
    final res = await _dio.get('/api/reminders/pending');
    return (res.data['reminders'] as List<dynamic>)
        .map((e) => PendingReminder.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
