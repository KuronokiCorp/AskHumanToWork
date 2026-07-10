/**
 * Seed a demo user, projects, mixed human/AI todos, and a PAT for MCP testing.
 * Run: pnpm db:seed  (idempotent — skips if demo user exists)
 */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createDb, users, projects, todos, agentTokens } from './index.js';

const db = createDb();

const DEMO_EMAIL = 'demo@askhumantowork.local';
const DEMO_PASSWORD = 'demo1234';

async function main() {
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, DEMO_EMAIL),
  });
  if (existing) {
    console.log(`Demo user already exists (${DEMO_EMAIL}) — skipping seed.`);
    process.exit(0);
  }

  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      isAdmin: true,
      plan: 'pro', // integrations (a pro feature) testable out of the box
    })
    .returning();
  if (!user) throw new Error('failed to insert user');

  const [work, personal] = await db
    .insert(projects)
    .values([
      { ownerId: user.id, name: 'Work', color: '#4f46e5' },
      { ownerId: user.id, name: 'Personal', color: '#059669' },
    ])
    .returning();

  const now = Date.now();
  const hours = (n: number) => new Date(now + n * 3_600_000);

  await db.insert(todos).values([
    {
      ownerId: user.id,
      projectId: work!.id,
      title: 'Review the auth PR',
      dueAt: hours(4),
      priority: 2,
      source: 'human',
      tags: ['code-review'],
    },
    {
      ownerId: user.id,
      projectId: work!.id,
      title: 'Follow up on the flaky CI test in payments-service',
      dueAt: hours(28),
      priority: 3,
      source: 'ai',
      createdByAgent: 'claude-code',
      originContext: 'Claude noticed the payments test failed 3 times while you were debugging auth.',
      tags: ['ci'],
    },
    {
      ownerId: user.id,
      projectId: personal!.id,
      title: 'Renew passport',
      dueAt: hours(24 * 14),
      priority: 1,
      source: 'human',
    },
    {
      ownerId: user.id,
      projectId: work!.id,
      title: 'Send the Q3 architecture doc to the team',
      dueAt: hours(-20), // overdue
      priority: 2,
      source: 'ai',
      createdByAgent: 'claude-desktop',
      originContext: 'You told Claude you would share the doc "by yesterday" during planning.',
    },
  ]);

  // PAT for MCP testing
  const rawToken = `tfa_${randomBytes(24).toString('base64url')}`;
  await db.insert(agentTokens).values({
    userId: user.id,
    name: 'seeded-mcp-token',
    tokenHash: createHash('sha256').update(rawToken).digest('hex'),
    scopes: ['todos:read', 'todos:write', 'projects:read', 'integrations:read'],
    kind: 'pat',
  });

  console.log('Seeded demo data.');
  console.log(`  Login:     ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  MCP token: ${rawToken}`);
  console.log('  (save the token — it is stored only as a hash)');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
