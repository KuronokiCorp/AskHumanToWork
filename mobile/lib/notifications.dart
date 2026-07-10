import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'api.dart';

/// v1 mobile reminders: mirror the server's pending reminders as LOCAL
/// notifications, re-synced on every app launch/refresh. (Remote FCM/APNs
/// push is a later phase.)
class NotificationService {
  final _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    tzdata.initializeTimeZones();
    try {
      final localTz = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(localTz.identifier));
    } catch (_) {
      // fall back to tz.local default (UTC)
    }
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      ),
    );
    await _plugin.initialize(settings: settings);
    _initialized = true;
  }

  /// Replace all scheduled local notifications with the server's pending set.
  Future<void> syncFromServer(ApiClient api) async {
    await init();
    await _plugin.cancelAll();
    final reminders = await api.pendingReminders();
    final now = DateTime.now();
    final seen = <String>{};
    var scheduled = 0;
    for (final r in reminders) {
      if (r.fireAt.isBefore(now) || scheduled >= 60) continue; // iOS caps at ~64 pending
      // Server stores one row per channel (email/web_push); collapse to one
      // local notification per todo+time.
      final key = '${r.todoId}|${r.fireAt.toIso8601String()}';
      if (!seen.add(key)) continue;
      await _plugin.zonedSchedule(
        id: key.hashCode & 0x7fffffff,
        title: 'Reminder',
        body: r.title,
        scheduledDate: tz.TZDateTime.from(r.fireAt, tz.local),
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'reminders',
            'Reminders',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
      scheduled++;
    }
  }
}
