import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import type { ScopeUser } from '../access/scope';

// Batch F item 32 (answer 2577): private notes a person keeps about a colleague (PRF-08 Quick feedback). Only the
// author sees them, enforced twice: here and by the database's author_only policy. Never shown to the person, HR or
// the next manager, never used in reviews. Audit rows carry no text.

const MAX = 1000;

@Injectable()
export class PerformancePersonNotesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private self(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    if (!user.userId) throw new ForbiddenException('Not signed in.');
    return user.userId;
  }

  private text(text: string) {
    const t = text.trim().slice(0, MAX);
    if (!t) throw new BadRequestException('Write the note first.');
    return t;
  }

  /** My notes about one colleague, newest first. */
  list(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, { ...ctx, userId: me } as TenantContext, async (tx, c) => {
      if (!(await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId }, select: { id: true } }))) throw new NotFoundException('No such person.');
      const rows = await tx.perfPersonNote.findMany({ where: { organizationId: c.organizationId, authorUserId: me, employeeId }, orderBy: { createdAt: 'desc' }, take: 200 });
      return rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
    });
  }

  /** Adds a note about a colleague (never about myself). */
  add(ctx: TenantContext, user: ScopeUser, employeeId: string, text: string) {
    const me = this.self(user);
    const t = this.text(text);
    return inCompany(this.tenantPrisma, { ...ctx, userId: me } as TenantContext, async (tx, c) => {
      const e = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId }, select: { id: true, userId: true } });
      if (!e) throw new NotFoundException('No such person.');
      if (e.userId === me) throw new ForbiddenException('Notes are about colleagues, not about yourself.');
      const n = await tx.perfPersonNote.create({ data: { organizationId: c.organizationId, authorUserId: me, employeeId, text: t } });
      await audit(tx, c, 'perf.note.created', 'perf_person_note', n.id, { employeeId });
      return { id: n.id };
    });
  }

  /** Changes my own note (anyone else's is not found). */
  update(ctx: TenantContext, user: ScopeUser, id: string, text: string) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, { ...ctx, userId: me } as TenantContext, async (tx, c) => {
      const res = await tx.perfPersonNote.updateMany({ where: { organizationId: c.organizationId, id, authorUserId: me }, data: { text: this.text(text), updatedAt: new Date() } });
      if (!res.count) throw new NotFoundException('No such note.');
      await audit(tx, c, 'perf.note.updated', 'perf_person_note', id, {});
      return { id };
    });
  }

  /** Deletes my own note for good. */
  remove(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, { ...ctx, userId: me } as TenantContext, async (tx, c) => {
      const res = await tx.perfPersonNote.deleteMany({ where: { organizationId: c.organizationId, id, authorUserId: me } });
      if (!res.count) throw new NotFoundException('No such note.');
      await audit(tx, c, 'perf.note.deleted', 'perf_person_note', id, {});
      return { deleted: true };
    });
  }
}
