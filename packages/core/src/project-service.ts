import { and, eq, ilike, sql } from 'drizzle-orm';
import { projects } from '@askhumantowork/db';
import type { AppContext } from './context.js';

export class ProjectService {
  constructor(private ctx: AppContext) {}

  async list(ownerId: string) {
    return this.ctx.db.query.projects.findMany({
      where: (p, { eq: e, and: a }) => a(e(p.ownerId, ownerId), e(p.archived, false)),
      orderBy: (p, { asc }) => asc(p.name),
    });
  }

  /**
   * Fuzzy-match a project by name; create it if nothing matches.
   * Match order: case-insensitive exact → contains (either direction).
   */
  async resolveByName(ownerId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const exact = await this.ctx.db.query.projects.findFirst({
      where: and(
        eq(projects.ownerId, ownerId),
        sql`lower(${projects.name}) = ${trimmed.toLowerCase()}`,
      ),
    });
    if (exact) return exact;

    const contains = await this.ctx.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.ownerId, ownerId),
          eq(projects.archived, false),
          sql`(${ilike(projects.name, `%${trimmed}%`)} OR ${sql`${trimmed.toLowerCase()}`} LIKE '%' || lower(${projects.name}) || '%')`,
        ),
      )
      .limit(1);
    if (contains[0]) return contains[0];

    const [created] = await this.ctx.db
      .insert(projects)
      .values({ ownerId, name: trimmed })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    // conflict race: fetch the winner
    return this.ctx.db.query.projects.findFirst({
      where: and(eq(projects.ownerId, ownerId), eq(projects.name, trimmed)),
    });
  }

  async create(ownerId: string, name: string, color?: string) {
    const trimmed = name.trim();
    const [row] = await this.ctx.db
      .insert(projects)
      .values({ ownerId, name: trimmed, color })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    // (ownerId, name) is unique — reuse the existing project, reviving it if archived
    const [existing] = await this.ctx.db
      .update(projects)
      .set({ archived: false })
      .where(and(eq(projects.ownerId, ownerId), eq(projects.name, trimmed)))
      .returning();
    return existing;
  }

  async archive(ownerId: string, id: string) {
    await this.ctx.db
      .update(projects)
      .set({ archived: true })
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
  }
}
