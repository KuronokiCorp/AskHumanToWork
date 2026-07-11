import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  Map<String, dynamic>? _me;
  bool _saving = false;

  Map<String, dynamic> get _prefs =>
      (_me?['notificationPrefs'] as Map<String, dynamic>?) ?? {};
  Map<String, dynamic> get _digest =>
      (_prefs['digest'] as Map<String, dynamic>?) ?? {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final me = await ref.read(apiProvider).me();
    if (mounted) setState(() => _me = me);
  }

  Future<void> _saveDigest({bool? enabled, int? hour}) async {
    final next = {
      ..._prefs,
      'digest': {
        'enabled': enabled ?? _digest['enabled'] ?? false,
        'hour': hour ?? _digest['hour'] ?? 8,
      },
    };
    setState(() => _saving = true);
    try {
      await ref.read(apiProvider).updateNotificationPrefs(next);
      await _load();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_me == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Settings')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final digestEnabled = _digest['enabled'] == true;
    final digestHour = (_digest['hour'] as num?)?.toInt() ?? 8;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(_me!['email'] as String? ?? ''),
            subtitle: Text(
                'Timezone: ${_me!['timezone']} · Plan: ${_me!['plan'] ?? 'free'}'),
          ),
          const Divider(),
          SwitchListTile(
            secondary: const Icon(Icons.wb_sunny_outlined),
            title: const Text('Morning digest'),
            subtitle: const Text('One email sizing up your day'),
            value: digestEnabled,
            onChanged: _saving ? null : (v) => _saveDigest(enabled: v),
          ),
          if (digestEnabled)
            ListTile(
              leading: const SizedBox(width: 24),
              title: const Text('Deliver at'),
              trailing: DropdownButton<int>(
                value: digestHour,
                items: [
                  for (var h = 0; h < 24; h++)
                    DropdownMenuItem(
                        value: h,
                        child: Text('${h.toString().padLeft(2, '0')}:00')),
                ],
                onChanged: _saving ? null : (v) => _saveDigest(hour: v),
              ),
            ),
        ],
      ),
    );
  }
}
