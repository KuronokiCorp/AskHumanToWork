import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from '../api';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function SettingsNotifications({ me }: { me: Me }) {
  const qc = useQueryClient();
  const prefs = me.notificationPrefs ?? {};
  const [pushState, setPushState] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (notificationPrefs: unknown) => api.updateMe({ notificationPrefs: notificationPrefs as Me['notificationPrefs'] }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }),
  });

  async function enableWebPush() {
    try {
      setPushState('requesting…');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const { key } = await api.vapidKey();
      if (!key) {
        setPushState('Server has no VAPID keys configured (.env)');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await api.subscribePush(sub.toJSON());
      setPushState('✓ Web push enabled on this browser');
    } catch (err) {
      setPushState(`Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  const channels = prefs.channels ?? {};
  const quiet = prefs.quietHours ?? null;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-bold">Notifications</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Reminders ladder: 1 day before, 1 hour before, at due — then daily overdue nudges until done.
      </p>

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium">Channels</div>
        {(['email', 'web_push'] as const).map((ch) => (
          <label key={ch} className="mr-6 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={channels[ch] !== false}
              onChange={(e) =>
                update.mutate({ ...prefs, channels: { ...channels, [ch]: e.target.checked } })
              }
            />
            {ch === 'email' ? 'Email' : 'Web push'}
          </label>
        ))}
        <div className="mt-3">
          <button
            onClick={enableWebPush}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Enable web push in this browser
          </button>
          {pushState && <span className="ml-3 text-xs text-zinc-500">{pushState}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium">Quiet hours ({me.timezone})</div>
        <label className="mr-4 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!quiet}
            onChange={(e) =>
              update.mutate({
                ...prefs,
                quietHours: e.target.checked ? { start: '22:00', end: '08:00' } : null,
              })
            }
          />
          Enabled
        </label>
        {quiet && (
          <span className="text-sm">
            <input
              type="time"
              value={quiet.start}
              onChange={(e) => update.mutate({ ...prefs, quietHours: { ...quiet, start: e.target.value } })}
              className="mx-1 rounded border border-zinc-300 px-2 py-1"
            />
            →
            <input
              type="time"
              value={quiet.end}
              onChange={(e) => update.mutate({ ...prefs, quietHours: { ...quiet, end: e.target.value } })}
              className="mx-1 rounded border border-zinc-300 px-2 py-1"
            />
            <span className="text-xs text-zinc-400">(reminders shift to after quiet hours)</span>
          </span>
        )}
      </div>
    </div>
  );
}
