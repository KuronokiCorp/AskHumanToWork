/**
 * Digest template guard (UI-regen spec §2.4 / AC #6): server-rendered digest
 * links must not point at the retired /inbox-ai route (nor /agenda as "the
 * app"). Pure unit test on the rendered template — no DB, no network.
 */
import { describe, expect, it } from 'vitest';
import type { Agenda, Todo } from '@askhumantowork/shared';
import { templateDigest } from './digest.js';

/** Minimal Todo carrying only the fields the digest line renderer reads. */
function todo(partial: Partial<Todo>): Todo {
  return {
    title: 'Untitled',
    dueAt: null,
    source: 'human',
    createdByAgent: null,
    ...partial,
  } as Todo;
}

const agenda: Agenda = {
  date: '2026-07-25',
  summary: '2 due today, 1 overdue.',
  overdue: [todo({ title: 'File the tax form', dueAt: '2026-07-24T09:00:00.000Z' })],
  today: [
    todo({ title: 'Ship the release', dueAt: '2026-07-25T17:00:00.000Z' }),
    todo({ title: 'Review PR', source: 'ai', createdByAgent: 'heyhuman' }),
  ],
  upcoming: [todo({ title: 'Plan next sprint', dueAt: '2026-07-28T10:00:00.000Z' })],
} as unknown as Agenda;

describe('digest template', () => {
  const body = templateDigest(agenda);

  it('renders the seeded todos', () => {
    expect(body).toContain('File the tax form');
    expect(body).toContain('Ship the release');
    expect(body).toContain('added by heyhuman');
  });

  it('contains no /inbox-ai links (route retired in the UI regen)', () => {
    expect(body).not.toContain('/inbox-ai');
  });

  it('does not link /agenda as "the app"', () => {
    expect(body).not.toContain('/agenda');
  });
});
