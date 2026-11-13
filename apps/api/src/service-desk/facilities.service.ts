import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, audit, has, visibleTickets } from './desk-access';
import { EquipmentDto, FacilityAreaDto } from './dto-esm2';

// Helpdesk plan item 4: the company's buildings (its existing locations), their floors or areas, and equipment owned by
// a team of a facilities desk. The register is read by the facilities desks' staff (and the company's Service Desk
// owner); only a facilities desk's admins change it (equipment: the admins of the desk that owns it). Retired areas and
// equipment drop out of every picker. The equipment page lists its work orders (the tickets naming it) and the recurring
// maintenance that makes them.

export type PlaceKind = 'buildings' | 'areas' | 'equipment';

@Injectable()
export class FacilitiesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  /** The facilities desks this person has a seat on, with their role there. */
  private async facilitiesSeats(tx: Tx, a: DeskActor) {
    const desks = await tx.sdDesk.findMany({ where: { organizationId: a.ctx.organizationId, kind: 'facilities', status: 'active', id: { in: [...a.roles.keys()] } }, select: { id: true, name: true } });
    return desks.map((d) => ({ ...d, role: a.roles.get(d.id)! }));
  }

  private async requireView(tx: Tx, a: DeskActor) {
    if (has(a, 'desk.desk.create')) return;
    if (!(await this.facilitiesSeats(tx, a)).length) throw new ForbiddenException("Only the facilities desks' staff see the buildings and equipment register.");
  }

  private async requireAdminOf(tx: Tx, a: DeskActor, deskId?: string) {
    const admin = (await this.facilitiesSeats(tx, a)).filter((d) => d.role === 'admin');
    if (!admin.length || (deskId && !admin.some((d) => d.id === deskId))) throw new ForbiddenException(deskId ? "Only this facilities desk's admins change its equipment." : "Only a facilities desk's admins change the register.");
  }

  /** Buildings with their areas, and the equipment, for the register screen. */
  async register(a: DeskActor) {
    return this.tx(a, async (tx) => {
      await this.requireView(tx, a);
      const org = a.ctx.organizationId;
      const seats = await this.facilitiesSeats(tx, a);
      const [locations, areas, equipment] = await Promise.all([
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
        tx.sdFacilityArea.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } }),
        tx.sdEquipment.findMany({ where: { organizationId: org }, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
      ]);
      const groups = await tx.sdGroup.findMany({ where: { organizationId: org, id: { in: [...new Set(equipment.map((e) => e.ownerGroupId))] } }, select: { id: true, name: true } });
      const adminDesks = seats.filter((d) => d.role === 'admin');
      const deskGroups = adminDesks.length ? await tx.sdGroup.findMany({ where: { organizationId: org, deskId: { in: adminDesks.map((d) => d.id) }, active: true }, select: { id: true, name: true, deskId: true } }) : [];
      return {
        canEdit: adminDesks.length > 0,
        desks: adminDesks.map((d) => ({ id: d.id, name: d.name, groups: deskGroups.filter((g) => g.deskId === d.id).map((g) => ({ id: g.id, name: g.name })) })),
        buildings: locations.map((l) => ({ id: l.id, name: l.name, code: l.code, areas: areas.filter((x) => x.locationId === l.id).map((x) => ({ id: x.id, name: x.name, status: x.status, version: x.version })) })),
        equipment: equipment.map((e) => ({
          id: e.id,
          name: e.name,
          tag: e.tag,
          category: e.category,
          status: e.status,
          version: e.version,
          deskId: e.deskId,
          ownerGroupId: e.ownerGroupId,
          ownerTeam: groups.find((g) => g.id === e.ownerGroupId)?.name ?? '',
          locationId: e.locationId,
          building: locations.find((l) => l.id === e.locationId)?.name ?? '',
          areaId: e.areaId,
          area: areas.find((x) => x.id === e.areaId)?.name ?? null,
          canEdit: adminDesks.some((d) => d.id === e.deskId),
        })),
      };
    });
  }

  private async liveLocation(tx: Tx, org: string, id: string) {
    if (!(await tx.location.findFirst({ where: { organizationId: org, id, archivedAt: null }, select: { id: true } }))) throw new BadRequestException('Choose a building from the list.');
  }

  async saveArea(a: DeskActor, id: string | null, dto: FacilityAreaDto) {
    try {
      return await this.tx(a, async (tx) => {
        await this.requireAdminOf(tx, a);
        const org = a.ctx.organizationId;
        await this.liveLocation(tx, org, dto.locationId);
        const data = { locationId: dto.locationId, name: dto.name.trim(), status: dto.status ?? 'active' };
        if (id) {
          const cur = await tx.sdFacilityArea.findFirst({ where: { organizationId: org, id } });
          if (!cur) throw new NotFoundException('No such area.');
          if (dto.version !== undefined && dto.version !== cur.version) throw new ConflictException('Someone changed this area. Reload to see the latest.');
          await tx.sdFacilityArea.update({ where: { id }, data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
          await audit(tx, a, 'desk.facility_area.updated', 'sd_facility_area', id, data);
          return { id };
        }
        const row = await tx.sdFacilityArea.create({ data: { organizationId: org, ...data, createdBy: a.userId } });
        await audit(tx, a, 'desk.facility_area.created', 'sd_facility_area', row.id, data);
        return { id: row.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That building already has an area with this name.');
      throw e;
    }
  }

  async saveEquipment(a: DeskActor, id: string | null, dto: EquipmentDto) {
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        const cur = id ? await tx.sdEquipment.findFirst({ where: { organizationId: org, id } }) : null;
        if (id && !cur) throw new NotFoundException('No such equipment.');
        if (cur) await this.requireAdminOf(tx, a, cur.deskId);
        await this.requireAdminOf(tx, a, dto.deskId);
        if (cur && dto.version !== undefined && dto.version !== cur.version) throw new ConflictException('Someone changed this equipment. Reload to see the latest.');
        if (!(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId: dto.deskId, id: dto.ownerGroupId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a team of this facilities desk as the owner.');
        await this.liveLocation(tx, org, dto.locationId);
        if (dto.areaId && !(await tx.sdFacilityArea.findFirst({ where: { organizationId: org, id: dto.areaId, locationId: dto.locationId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an area of that building.');
        const data = { deskId: dto.deskId, ownerGroupId: dto.ownerGroupId, locationId: dto.locationId, areaId: dto.areaId ?? null, name: dto.name.trim(), tag: dto.tag.trim(), category: dto.category?.trim() || null, status: dto.status ?? 'active' };
        if (cur) {
          await tx.sdEquipment.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
          await audit(tx, a, 'desk.equipment.updated', 'sd_equipment', cur.id, { from: { status: cur.status, locationId: cur.locationId, ownerGroupId: cur.ownerGroupId }, to: data });
          return { id: cur.id };
        }
        const row = await tx.sdEquipment.create({ data: { organizationId: org, ...data, createdBy: a.userId } });
        await audit(tx, a, 'desk.equipment.created', 'sd_equipment', row.id, data);
        return { id: row.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another piece of equipment already has this tag.');
      throw e;
    }
  }

  /** The equipment page: its details, its work orders (the tickets naming it that this person may see) and its maintenance. */
  async equipmentPage(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      await this.requireView(tx, a);
      const org = a.ctx.organizationId;
      const e = await tx.sdEquipment.findFirst({ where: { organizationId: org, id } });
      if (!e) throw new NotFoundException('No such equipment.');
      const [location, area, group, tickets, schedules] = await Promise.all([
        tx.location.findFirst({ where: { organizationId: org, id: e.locationId }, select: { name: true } }),
        e.areaId ? tx.sdFacilityArea.findFirst({ where: { organizationId: org, id: e.areaId }, select: { name: true } }) : null,
        tx.sdGroup.findFirst({ where: { organizationId: org, id: e.ownerGroupId }, select: { name: true } }),
        tx.sdTicket.findMany({ where: { AND: [await visibleTickets(tx, a), { equipmentId: e.id }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: WORK_ORDER_PAGE + 1, select: WORK_ORDER_FIELDS }),
        tx.sdRecurring.findMany({ where: { organizationId: org, deskId: e.deskId, template: { path: ['equipmentId'], equals: e.id } }, select: { id: true, name: true, rrule: true, nextRunAt: true, state: true } }),
      ]);
      return {
        id: e.id,
        name: e.name,
        tag: e.tag,
        category: e.category,
        status: e.status,
        building: location?.name ?? '',
        area: area?.name ?? null,
        ownerTeam: group?.name ?? '',
        workOrders: tickets.slice(0, WORK_ORDER_PAGE).map(workOrder),
        // Answer 1914: older work orders come 25 at a time (GET …/work-orders?after=).
        moreWorkOrders: tickets.length > WORK_ORDER_PAGE,
        maintenance: schedules,
      };
    });
  }

  /** Answer 1914: the next 25 work orders of the equipment raised before `after` (the last one shown), newest first. */
  async workOrders(a: DeskActor, id: string, after: string) {
    return this.tx(a, async (tx) => {
      await this.requireView(tx, a);
      const org = a.ctx.organizationId;
      if (!(await tx.sdEquipment.findFirst({ where: { organizationId: org, id }, select: { id: true } }))) throw new NotFoundException('No such equipment.');
      const seen = await visibleTickets(tx, a);
      const last = await tx.sdTicket.findFirst({ where: { AND: [seen, { id: after, equipmentId: id }] }, select: { id: true, createdAt: true } });
      if (!last) throw new BadRequestException('Reload the equipment page and try again.');
      const rows = await tx.sdTicket.findMany({
        where: { AND: [seen, { equipmentId: id }, { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: WORK_ORDER_PAGE + 1,
        select: WORK_ORDER_FIELDS,
      });
      return { items: rows.slice(0, WORK_ORDER_PAGE).map(workOrder), more: rows.length > WORK_ORDER_PAGE };
    });
  }

  /** Pickers for a facilities ticket or a schedule: buildings, the areas of one, and equipment (never retired ones). */
  async pick(a: DeskActor, kind: PlaceKind, q: string, locationId?: string, deskId?: string) {
    return this.tx(a, async (tx) => {
      await this.requireView(tx, a);
      const org = a.ctx.organizationId;
      const term = q.trim();
      if (kind === 'buildings') {
        const rows = await tx.location.findMany({ where: { organizationId: org, archivedAt: null, ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { code: { contains: term, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' }, take: 20 });
        return rows.map((x) => ({ id: x.id, label: x.name, detail: x.code }));
      }
      if (kind === 'areas') {
        const rows = await tx.sdFacilityArea.findMany({ where: { organizationId: org, status: 'active', ...(locationId ? { locationId } : {}), ...(term ? { name: { contains: term, mode: 'insensitive' } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 20 });
        return rows.map((x) => ({ id: x.id, label: x.name, detail: null }));
      }
      const rows = await tx.sdEquipment.findMany({ where: { organizationId: org, status: 'active', ...(locationId ? { locationId } : {}), ...(deskId ? { deskId } : {}), ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { tag: { contains: term, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, tag: true, category: true }, orderBy: { name: 'asc' }, take: 20 });
      return rows.map((x) => ({ id: x.id, label: `${x.name} (${x.tag})`, detail: x.category }));
    });
  }
}

/** Answer 1914: work orders are listed 25 at a time. */
const WORK_ORDER_PAGE = 25;
const WORK_ORDER_FIELDS = { id: true, number: true, subject: true, systemState: true, createdAt: true, resolvedAt: true, tags: true } as const;
const workOrder = (t: { id: string; number: string; subject: string; systemState: string; createdAt: Date; resolvedAt: Date | null; tags: string[] }) => ({ id: t.id, number: t.number, subject: t.subject, systemState: t.systemState, createdAt: t.createdAt, resolvedAt: t.resolvedAt, recurring: t.tags.includes('recurring') });

/**
 * The building, area and equipment a facilities ticket names, checked: live and of this company; equipment brings its
 * own building and area; an area must be of the building. Shared by the ticket's agent and the recurring job.
 */
export async function checkPlace(tx: Tx, org: string, p: { locationId?: string | null; areaId?: string | null; equipmentId?: string | null }) {
  let { locationId = null, areaId = null } = p;
  const equipmentId = p.equipmentId ?? null;
  if (equipmentId) {
    const e = await tx.sdEquipment.findFirst({ where: { organizationId: org, id: equipmentId, status: 'active' }, select: { locationId: true, areaId: true } });
    if (!e) throw new BadRequestException('That equipment is retired or not on the register. Choose from the list.');
    locationId = e.locationId;
    areaId = e.areaId ?? areaId;
  }
  if (areaId) {
    const ar = await tx.sdFacilityArea.findFirst({ where: { organizationId: org, id: areaId, status: 'active' }, select: { locationId: true } });
    if (!ar || (locationId && ar.locationId !== locationId)) throw new BadRequestException('Choose an area of that building.');
    locationId = ar.locationId;
  }
  if (locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: locationId, archivedAt: null }, select: { id: true } }))) throw new BadRequestException('Choose a building from the list.');
  return { locationId, areaId, equipmentId };
}
