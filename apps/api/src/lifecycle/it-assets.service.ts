import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { ASSET_KEYS, reachesPlace } from './offboarding.service';
import type { SupplierDto } from './it-assets-dto';

// IT assets part 3. Answer 2716: the IT and Admin supplier list, separate from hiring's staffing vendors and from
// contract-labour contractors (they keep their own lists and compliance checks). The list is company-wide (a supplier
// has no place): anyone holding asset.view or asset.manage at any scope reads it (to pick it on an asset); anyone holding
// asset.manage at any scope adds, edits and retires suppliers (retired, never deleted; assets keep them). Every change
// is audited.

type Contact = { name: string; email: string | null; phone: string | null };

const manages = (v: Viewer) => v.grants.has('asset.manage') && !v.actingForOther;

@Injectable()
export class ItAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ASSET_KEYS);
  }

  // ------------------------------------------------------------------------------------------ suppliers (answer 2716)

  async suppliers(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('asset.view') && !v.grants.has('asset.manage')) throw new ForbiddenException('You cannot see the supplier list.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.itSupplier.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' }, take: 1000 });
      // How many of the assets this viewer sees came from each supplier.
      const assets = (await tx.asset.findMany({ where: { organizationId: org, supplierId: { in: rows.map((r) => r.id) } }, select: { supplierId: true, legalEntityId: true, locationId: true } })).filter((a) => reachesPlace(v, 'asset.view', a));
      return {
        canManage: manages(v),
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          gstin: r.gstin,
          contacts: r.contacts as Contact[],
          notes: r.notes,
          retired: Boolean(r.retiredAt),
          assets: assets.filter((a) => a.supplierId === r.id).length,
          version: r.version,
        })),
      };
    });
  }

  async saveSupplier(ctx: TenantContext, user: ScopeUser, id: string | null, dto: SupplierDto) {
    const v = await this.viewer(user);
    if (!manages(v)) throw new ForbiddenException('Only asset managers change the supplier list.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const contacts: Contact[] = dto.contacts.map((x) => ({ name: x.name, email: x.email || null, phone: x.phone || null }));
      const data = { name: dto.name, gstin: dto.gstin || null, contacts, notes: dto.notes || null };
      try {
        if (!id) {
          const x = await tx.itSupplier.create({ data: { organizationId: org, ...data, createdBy: c.userId ?? null } });
          await audit(tx, c, 'asset.supplier.added', 'it_supplier', x.id, { name: x.name, gstin: x.gstin });
          return { id: x.id };
        }
        const cur = await tx.itSupplier.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such supplier.');
        const retiredAt = dto.retired === undefined ? cur.retiredAt : dto.retired ? (cur.retiredAt ?? new Date()) : null;
        const n = await tx.itSupplier.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { ...data, retiredAt, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this supplier. Reload it.');
        await audit(tx, c, 'asset.supplier.updated', 'it_supplier', id, { from: { name: cur.name, gstin: cur.gstin, contacts: cur.contacts, notes: cur.notes }, to: data });
        if (Boolean(retiredAt) !== Boolean(cur.retiredAt)) await audit(tx, c, retiredAt ? 'asset.supplier.retired' : 'asset.supplier.restored', 'it_supplier', id, { name: data.name });
        return { id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another active supplier already has that name.');
        throw e;
      }
    });
  }
}
