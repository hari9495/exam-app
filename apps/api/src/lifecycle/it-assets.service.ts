import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { ASSET_KEYS, reachesPlace } from './offboarding.service';
import type { ContractDto, SupplierDto } from './it-assets-dto';
import { contractEndsOn, contractNoticeOn } from './asset-categories';

// IT assets part 3. Answer 2716: the IT and Admin supplier list, separate from hiring's staffing vendors and from
// contract-labour contractors (they keep their own lists and compliance checks). The list is company-wide (a supplier
// has no place): anyone holding asset.view or asset.manage at any scope reads it (to pick it on an asset); anyone holding
// asset.manage at any scope adds, edits and retires suppliers (retired, never deleted; assets keep them). Every change
// is audited.
// Answer 2717: contracts. A contract has an optional place (legal entity or location; none = company-wide, like an
// asset); asset.view over its place reads it, asset.manage over its place changes it (a place-less contract: company-wide
// asset.manage only). Its value is money: only asset.manage of its place and asset.finance.view see it (answer 2711).
// The assets it covers are listed only where the viewer sees them; the rest are counted. Helpdesk tickets to a supplier
// come later (M14).

type Contact = { name: string; email: string | null; phone: string | null };

const manages = (v: Viewer) => v.grants.has('asset.manage') && !v.actingForOther;
const seesMoney = (v: Viewer, k: { legalEntityId: string | null; locationId: string | null }) => reachesPlace(v, 'asset.manage', k) || reachesPlace(v, 'asset.finance.view', k);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

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

  // ------------------------------------------------------------------------------------------ contracts (answer 2717)

  async contracts(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('asset.view')) throw new ForbiddenException('You cannot see the asset contracts.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = (await tx.assetContract.findMany({ where: { organizationId: org }, orderBy: [{ status: 'asc' }, { endsOn: 'asc' }], take: 1000 })).filter((k) => reachesPlace(v, 'asset.view', k));
      const suppliers = new Map((await tx.itSupplier.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((k) => k.supplierId))] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      const links = await tx.assetContractAsset.findMany({ where: { organizationId: org, contractId: { in: rows.map((k) => k.id) } } });
      const assets = new Map((await tx.asset.findMany({ where: { organizationId: org, id: { in: [...new Set(links.map((l) => l.assetId))] } }, select: { id: true, tag: true, name: true, category: true, legalEntityId: true, locationId: true } })).map((a) => [a.id, a]));
      const places = await this.placeNames(tx, org);
      return {
        today: todayIst(),
        money: rows.some((k) => seesMoney(v, k)),
        canAdd: manages(v),
        rows: rows.map((k) => {
          const mine = links.flatMap((l) => (l.contractId === k.id && assets.has(l.assetId) ? [assets.get(l.assetId)!] : []));
          const seen = mine.filter((a) => reachesPlace(v, 'asset.view', a)).sort((x, y) => x.tag.localeCompare(y.tag));
          const endsOn = iso(k.endsOn);
          return {
            id: k.id,
            kind: k.kind,
            number: k.number,
            supplierId: k.supplierId,
            supplier: suppliers.get(k.supplierId) ?? 'Unknown supplier',
            legalEntityId: k.legalEntityId,
            locationId: k.locationId,
            place: (k.locationId && places.get(k.locationId)) || (k.legalEntityId && places.get(k.legalEntityId)) || null,
            startsOn: iso(k.startsOn),
            months: k.months,
            endsOn,
            noticeDays: k.noticeDays,
            noticeOn: contractNoticeOn(endsOn, k.noticeDays),
            renewal: k.renewal,
            renewals: k.renewals,
            supportHours: k.supportHours,
            // Answer 2711: no value in the answer for whoever may not see money.
            ...(seesMoney(v, k) ? { value: k.value?.toFixed(2) ?? null } : {}),
            assetCap: k.assetCap,
            assets: seen.map((a) => ({ id: a.id, tag: a.tag, name: a.name, category: a.category })),
            hiddenAssets: mine.length - seen.length,
            status: k.status,
            canManage: reachesPlace(v, 'asset.manage', k),
            version: k.version,
          };
        }),
      };
    });
  }

  /** Legal entity and location names by id (a contract's place). */
  private async placeNames(tx: Tx, org: string) {
    const [entities, locations] = await Promise.all([tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true } }), tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true } })]);
    return new Map([...entities, ...locations].map((x) => [x.id, x.name]));
  }

  async saveContract(ctx: TenantContext, user: ScopeUser, id: string | null, dto: ContractDto) {
    const v = await this.viewer(user);
    if (!manages(v)) throw new ForbiddenException('Only asset managers change contracts.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const place = { legalEntityId: dto.legalEntityId ?? null, locationId: dto.locationId ?? null };
      const cur = id ? await tx.assetContract.findFirst({ where: { organizationId: org, id } }) : null;
      if (id && (!cur || !reachesPlace(v, 'asset.view', cur))) throw new NotFoundException('No such contract.');
      if (cur && !reachesPlace(v, 'asset.manage', cur)) throw new ForbiddenException('You cannot change this contract.');
      if (!reachesPlace(v, 'asset.manage', place)) throw new ForbiddenException(place.legalEntityId || place.locationId ? 'Choose a legal entity or location you look after.' : 'Only company-wide asset managers keep a contract with no place. Choose a legal entity or location you look after.');
      if (place.locationId && place.legalEntityId) {
        const l = await tx.location.findFirst({ where: { organizationId: org, id: place.locationId }, select: { legalEntityId: true } });
        if (!l || l.legalEntityId !== place.legalEntityId) throw new BadRequestException('That location is not in that legal entity.');
      }
      const sup = await tx.itSupplier.findFirst({ where: { organizationId: org, id: dto.supplierId }, select: { retiredAt: true } });
      if (!sup || (sup.retiredAt && dto.supplierId !== cur?.supplierId)) throw new BadRequestException('Choose a supplier from the list.');
      // The covered assets: the caller picks among the assets they see; links to assets they cannot see stay as they are.
      const wanted = [...new Set(dto.assetIds)];
      const picked = await tx.asset.findMany({ where: { organizationId: org, id: { in: wanted } }, select: { id: true, legalEntityId: true, locationId: true } });
      if (picked.length !== wanted.length || picked.some((a) => !reachesPlace(v, 'asset.view', a))) throw new BadRequestException('Choose the covered assets from the register.');
      const before = id ? (await tx.assetContractAsset.findMany({ where: { organizationId: org, contractId: id }, select: { assetId: true } })).map((l) => l.assetId) : [];
      const unseen = (await tx.asset.findMany({ where: { organizationId: org, id: { in: before } }, select: { id: true, legalEntityId: true, locationId: true } })).filter((a) => !reachesPlace(v, 'asset.view', a)).map((a) => a.id);
      const after = [...new Set([...unseen, ...wanted])];
      if (dto.assetCap && after.length > dto.assetCap) throw new BadRequestException(`This contract covers at most ${dto.assetCap} ${dto.assetCap === 1 ? 'asset' : 'assets'}. Remove some, or raise the cap.`);
      const endsOn = contractEndsOn(dto.startsOn, dto.months, cur?.renewals ?? 0);
      const data = {
        kind: dto.kind,
        number: dto.number,
        supplierId: dto.supplierId,
        ...place,
        startsOn: asDate(dto.startsOn),
        months: dto.months,
        renewal: dto.renewal,
        noticeDays: dto.noticeDays,
        supportHours: dto.supportHours || null,
        value: dto.value ? new Prisma.Decimal(dto.value) : null,
        assetCap: dto.assetCap ?? null,
        endsOn: asDate(endsOn),
        // An ended contract whose new end is still ahead is active again.
        ...(cur?.status === 'ended' && endsOn >= todayIst() ? { status: 'active' } : {}),
      };
      const added = after.filter((x) => !before.includes(x));
      const removed = before.filter((x) => !after.includes(x));
      try {
        let contractId = id;
        if (!cur) {
          contractId = (await tx.assetContract.create({ data: { organizationId: org, ...data, createdBy: c.userId ?? null } })).id;
        } else {
          const n = await tx.assetContract.updateMany({ where: { organizationId: org, id: cur.id, version: dto.version }, data: { ...data, version: { increment: 1 } } });
          if (!n.count) throw new ConflictException('Someone else changed this contract. Reload it.');
        }
        if (removed.length) await tx.assetContractAsset.deleteMany({ where: { organizationId: org, contractId: contractId!, assetId: { in: removed } } });
        if (added.length) await tx.assetContractAsset.createMany({ data: added.map((assetId) => ({ organizationId: org, contractId: contractId!, assetId, addedBy: c.userId ?? null })), skipDuplicates: true });
        await audit(tx, c, cur ? 'asset.contract.updated' : 'asset.contract.added', 'asset_contract', contractId!, {
          ...(cur ? { from: { kind: cur.kind, number: cur.number, supplierId: cur.supplierId, startsOn: iso(cur.startsOn), months: cur.months, endsOn: iso(cur.endsOn), renewal: cur.renewal, noticeDays: cur.noticeDays, value: cur.value?.toFixed(2) ?? null, assetCap: cur.assetCap } } : {}),
          to: { ...data, startsOn: dto.startsOn, endsOn, value: dto.value ?? null },
          assets: { added, removed },
        });
        return { id: contractId };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This supplier already has a contract with that number.');
        throw e;
      }
    });
  }
}
