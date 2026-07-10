import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from '../api';
import { Button, PageHeader, SectionCard } from '../components/ui';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const timeCls =
  'rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm shadow-card outline-none focus:border-violet-400';

export default function SettingsNotifications({ me }: { me: Me }) {
  const qc = useQueryClient();
  const prefs = me.notificationPrefs ?? {};
  const [pushState, setPushState] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (notificationPrefs: unknown) =>
      api.updateMe({ notificationPrefs: notificationPrefs as Me['notificationPrefs'] }),
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
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle="Reminder ladder: 1 day before, 1 hour before, at due — then daily overdue nudges until done."
      />

      <SectionCard title="Channels">
        <div className="flex items-center gap-6">
          {(['email', 'web_push'] as const).map((ch) => (
            <label key={ch} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-violet-600"
                checked={channels[ch] !== false}
                onChange={(e) =>
                  update.mutate({ ...prefs, channels: { ...channels, [ch]: e.target.checked } })
                }
              />
              {ch === 'email' ? 'Email' : 'Web push'}
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" onClick={enableWebPush}>
            Enable web push in this browser
          </Button>
          {pushState && <span className="text-xs text-zinc-500">{pushState}</span>}
        </div>
      </SectionCard>

      <SectionCard title={`Quiet hours (${me.timezone})`} description="Reminders due during quiet hours are delivered right after the window ends.">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-violet-600"
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
            <span className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="time"
                value={quiet.start}
                onChange={(e) => update.mutate({ ...prefs, quietHours: { ...quiet, start: e.target.value } })}
                className={timeCls}
              />
              →
              <input
                type="time"
                value={quiet.end}
                onChange={(e) => update.mutate({ ...prefs, quietHours: { ...quiet, end: e.target.value } })}
                className={timeCls}
              />
            </span>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
