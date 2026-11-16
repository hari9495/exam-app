import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { PLATFORM, platformRead, staffActor } from '../../platform/platform.service';

export const FEATURE_STATUSES = ['new', 'planned', 'not_now', 'done'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

/**
 * Answer 2105: the staff Feature requests list. Requests sent from Ask YukthiX; staff group duplicates under one
 * request (with how many companies asked), and mark Planned, Not now or Done. When a request is Done, everyone who asked
 * for it (it and its duplicates) is told in the app, once. Every decision is audited.
 */
@Injectable()
export class FeatureRequestsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(actorUserId: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'feature requests', async (tx) => {
      const rows = await tx.featureRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
      const orgs = new Map((await tx.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
      const dupes = (id: string) => rows.filter((r) => r.duplicateOf === id);
      return rows
        .filter((r) => !r.duplicateOf)
        .map((r) => {
          const all = [r, ...dupes(r.id)];
          return {
            id: r.id,
            number: r.number,
            title: r.title,
            details: r.details,
            status: r.status as FeatureStatus,
            company: orgs.get(r.organizationId) ?? '',
            requestedBy: r.requestedByName,
            createdAt: r.createdAt.toISOString(),
            companies: new Set(all.map((x) => x.organizationId)).size,
            duplicates: dupes(r.id).map((d) => ({ id: d.id, number: d.number, title: d.title, company: orgs.get(d.organizationId) ?? '' })),
            staffNote: r.staffNote,
            version: r.version,
          };
        });
    });
  }

  /** Planned, Not now or Done (a note optional), or file it under another request as a duplicate. */
  async decide(actorUserId: string, id: string, dto: { status?: FeatureStatus; note?: string; duplicateOf?: string | null; version: number }) {
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const r = await tx.featureRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('No such feature request.');
      if (r.version !== dto.version) throw new ConflictException('Someone changed this request; reload it.');
      if (dto.duplicateOf) {
        const main = await tx.featureRequest.findUnique({ where: { id: dto.duplicateOf } });
        if (!main || main.id === r.id) throw new BadRequestException('Choose another request to file this under.');
        if (main.duplicateOf) throw new BadRequestException('That request is itself filed under another; choose the main one.');
        if (await tx.featureRequest.count({ where: { duplicateOf: r.id } })) throw new BadRequestException('Other requests are filed under this one; file them elsewhere first.');
      }
      const status = dto.status ?? (r.status as FeatureStatus);
      await tx.featureRequest.update({
        where: { id },
        data: { status, ...(dto.note !== undefined ? { staffNote: dto.note || null } : {}), ...(dto.duplicateOf !== undefined ? { duplicateOf: dto.duplicateOf } : {}), decidedBy: actorUserId, decidedAt: new Date(), version: { increment: 1 } },
      });
      let told = 0;
      if (status === 'done' && r.status !== 'done') {
        // "The company is told when it ships": everyone who asked, once.
        const asked = await tx.featureRequest.findMany({ where: { OR: [{ id }, { duplicateOf: id }], notifiedAt: null, requestedBy: { not: null } } });
        for (const a of asked) {
          await tx.userNotification.create({ data: { organizationId: a.organizationId, recipientUserId: a.requestedBy!, actorUserId: null, type: 'help.feature_request.done', entityType: 'feature_request', entityId: a.id, contextText: `Your feature request is done: ${r.title}`.slice(0, 500), linkPath: '/yx/home' } });
          await tx.featureRequest.update({ where: { id: a.id }, data: { notifiedAt: new Date() } });
          told++;
        }
      }
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, actor, action: 'platform.feature_request.decided', entityType: 'feature_request', entityId: id, metadata: { number: r.number, from: r.status, to: status, duplicateOf: dto.duplicateOf ?? null, told } });
      return { status, told };
    });
  }
}
