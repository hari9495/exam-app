import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { TenantContext } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { asDate, isoDate } from '../org-structure/org-validation';
import { ChangeRequestDto } from '../employee-history/dto';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { CHANGE_TYPES, FoldError } from '../employee-history/history-rules';
import { CsvProblem, parseBulkCsv, RawRow } from './bulk-csv';

// M01 §3.3 bulk job changes (annual increment, reorg, "reassign 6 reports to …", §3.2): many P06 changes raised
// together, each validated and previewed row by row (dry run), stored all or nothing as one batch, and
// approved once (all or nothing again) by someone other than the requester and the people in it (YX-SEC-11).
// Each row goes through the same change path as a single change (YX-HIS-01), so every rule applies to it.

/** Change types a file may carry: joins come from hiring, corrections and confirmations one by one. */
const BULK_TYPES = CHANGE_TYPES.filter((t) => !['join', 'correction', 'confirmation', 'notice', 'notice_withdrawal'].includes(t));

interface Item {
  line: number;
  employeeId?: string;
  employeeCode?: string;
  dto?: ChangeRequestDto;
  error?: string;
}

const message = (e: unknown) => {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    return typeof r === 'string' ? r : Array.isArray((r as { message?: unknown }).message) ? ((r as { message: string[] }).message).join('; ') : String((r as { message?: unknown }).message ?? e.message);
  }
  if (e instanceof FoldError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError || (e instanceof Error && /exclusion constraint|23P01/.test(e.message))) return 'The dates clash with another change for this person.';
  throw e;
};

@Injectable()
export class BulkChangesService {
  constructor(private readonly history: EmployeeHistoryService) {}

  // ---- turning file rows into change requests ----

  /** Every code in the file, resolved inside the company. Unknown or ambiguous codes are row errors. */
  /** The people with an open employment that the viewer's change grant reaches (P02 §4.3): nobody else can be a row. */
  private async reachable(tx: Tx, c: CompanyContext, v: Viewer) {
    const open = await tx.employment.findMany({ where: { organizationId: c.organizationId, exitedOn: null }, select: { employeeId: true } });
    return this.history.reachedIds(tx, c, v, 'employee.change.manage', open.map((e) => e.employeeId));
  }

  private async resolve(tx: Tx, c: CompanyContext, v: Viewer, rows: RawRow[], batchReason: string, reach: ReadonlySet<string>): Promise<Item[]> {
    const org = c.organizationId;
    const open = await tx.employment.findMany({ where: { organizationId: org, exitedOn: null }, select: { employeeId: true, employeeCode: true, legalEntityId: true } });
    // A row names only people in scope: a code outside it reads as unknown, so a file cannot probe other entities' codes.
    const subjects = open.filter((e) => reach.has(e.employeeId));
    // Employee codes are Internal (P02 §4.4): a manager or dotted-line column resolves only among the people the
    // uploader's HR keys reach today, with one answer for "unknown" and "outside your scope" (YX-SEC-05).
    const visible = await this.history.reachedIds(tx, c, v, 'employee.profile.view', open.map((e) => e.employeeId));
    const pickable = open.filter((e) => reach.has(e.employeeId) || visible.has(e.employeeId));
    const entities = await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, shortName: true } });
    const byCode = (code: string, entityId?: string) => pickable.filter((e) => e.employeeCode.toLowerCase() === code.toLowerCase() && (!entityId || e.legalEntityId === entityId));
    const master = async (model: 'location' | 'department' | 'designation' | 'grade' | 'employmentType', code: string) =>
      (await (tx[model] as unknown as { findFirst(a: unknown): Promise<{ id: string } | null> }).findFirst({ where: { organizationId: org, code: { equals: code, mode: 'insensitive' } }, select: { id: true } }))?.id;

    const items: Item[] = [];
    for (const r of rows) {
      const fail = (error: string) => items.push({ line: r.line, employeeCode: r.employee_code, error });
      let entityId: string | undefined;
      if (r.legal_entity) {
        entityId = entities.find((x) => x.shortName.toLowerCase() === r.legal_entity!.toLowerCase())?.id;
        if (!entityId) {
          fail(`No legal entity with the short name ${r.legal_entity}.`);
          continue;
        }
      }
      const subject = subjects.filter((e) => e.employeeCode.toLowerCase() === (r.employee_code ?? '').toLowerCase() && (!entityId || e.legalEntityId === entityId));
      if (subject.length !== 1) {
        fail(subject.length ? `Employee code ${r.employee_code} is used in more than one legal entity: add legal_entity.` : `No current employee with the code ${r.employee_code}.`);
        continue;
      }
      const employer = subject[0].legalEntityId;
      const assignment: Record<string, unknown> = {};
      const problems: string[] = [];
      const lookup = async (column: keyof RawRow, model: Parameters<typeof master>[0], field: string) => {
        const code = r[column] as string | undefined;
        if (!code) return;
        const id = await master(model, code);
        if (id) assignment[field] = id;
        else problems.push(`No ${String(column).replace('_', ' ')} with the code ${code}.`);
      };
      await lookup('location', 'location', 'locationId');
      await lookup('department', 'department', 'departmentId');
      await lookup('designation', 'designation', 'designationId');
      await lookup('grade', 'grade', 'gradeId');
      await lookup('employment_type', 'employmentType', 'employmentTypeId');
      // A person code: unique in the employer's series first, then in the company.
      const personByCode = (code: string) => {
        const same = byCode(code, employer);
        const any = byCode(code);
        const hit = same.length === 1 ? same : any;
        if (hit.length !== 1) problems.push(hit.length ? `Employee code ${code} is used in more than one legal entity you manage.` : `No current employee you manage has the code ${code}.`);
        return hit[0]?.employeeId;
      };
      if (r.manager) assignment.managerEmployeeId = r.manager.toLowerCase() === 'none' ? null : personByCode(r.manager);
      if (r.dotted_line_managers) {
        assignment.dottedLineManagerIds =
          r.dotted_line_managers.toLowerCase() === 'none'
            ? []
            : r.dotted_line_managers
                .split(';')
                .map((x) => x.trim())
                .filter(Boolean)
                .map(personByCode);
      }
      if (r.cost_centre) {
        const cc = await tx.costCentre.findFirst({ where: { organizationId: org, legalEntityId: employer, code: { equals: r.cost_centre, mode: 'insensitive' } }, select: { id: true } });
        if (cc) assignment.costCentres = [{ costCentreId: cc.id, percent: '100' }];
        else problems.push(`No cost centre ${r.cost_centre} in the employee's legal entity.`);
      }
      if (problems.length) {
        fail(problems.join(' '));
        continue;
      }
      const type = (r.change_type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (!(BULK_TYPES as readonly string[]).includes(type)) {
        fail(`change_type is one of: ${BULK_TYPES.join(', ')}.`);
        continue;
      }
      const compensation = r.annual_ctc || r.increase_percent ? { ...(r.annual_ctc ? { annualCtc: r.annual_ctc } : {}), ...(r.increase_percent ? { increasePercent: r.increase_percent } : {}) } : undefined;
      const plain = {
        employeeId: subject[0].employeeId,
        changeType: type,
        effectiveDate: r.effective_date,
        payload: { ...(Object.keys(assignment).length ? { assignment } : {}), ...(compensation ? { compensation } : {}) },
        reason: r.reason ?? batchReason,
      };
      // The same validation as a single change request (class-validator, whitelist).
      const dto = plainToInstance(ChangeRequestDto, plain);
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      if (errors.length) {
        const flat = (es: typeof errors): string[] => es.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flat(e.children ?? [])]);
        fail(flat(errors).join('; '));
        continue;
      }
      items.push({ line: r.line, employeeId: subject[0].employeeId, employeeCode: r.employee_code, dto });
    }
    return items;
  }

  /**
   * Dry run of every item in order, as if each were approved in turn (so a row sees the rows above it), inside
   * one transaction that is always rolled back. A failing row is undone on its own (savepoint) and reported.
   */
  private async evaluate(tx: Tx, c: CompanyContext, v: Viewer, items: Item[]) {
    const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: items.flatMap((i) => (i.employeeId ? [i.employeeId] : [])) } } });
    const out = [];
    for (const item of items) {
      const person = people.find((p) => p.id === item.employeeId);
      const base = { line: item.line, employeeId: item.employeeId ?? null, employeeCode: item.employeeCode ?? null, name: person ? displayName(person) : null, changeType: item.dto?.changeType ?? null, effectiveDate: item.dto?.effectiveDate ?? null };
      if (!item.dto) {
        out.push({ ...base, ok: false, error: item.error!, impact: null });
        continue;
      }
      await tx.$executeRaw`SAVEPOINT bulk_row`;
      try {
        const { ch, e } = await this.history.createChange(tx, c, v, item.dto);
        const { impact } = await this.history.approveIn(tx, c, v, ch, e, { confirmRebase: true, simulate: true });
        await tx.$executeRaw`RELEASE SAVEPOINT bulk_row`;
        out.push({ ...base, ok: true, error: null, impact: await this.history.viewImpact(tx, c, v, e.employeeId, impact) });
      } catch (err) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT bulk_row`;
        out.push({ ...base, ok: false, error: message(err), impact: null });
      }
    }
    return { rows: out, errors: out.filter((r) => !r.ok).length };
  }

  /** Dry run, then (unless only a dry run was asked for) the batch: stored all or nothing, pending approval. */
  private async submit(ctx: TenantContext, v: Viewer, build: (tx: Tx, c: CompanyContext) => Promise<Item[]>, meta: { source: 'csv' | 'reassign'; fileName?: string; reason: string; dryRun: boolean }) {
    const preview = await this.history.preview(ctx, async (tx, c) => this.evaluate(tx, c, v, await build(tx, c)));
    if (!preview.rows.length) throw new BadRequestException('There is nothing to change.');
    if (meta.dryRun) return { batch: null, ...preview };
    if (preview.errors) throw new BadRequestException({ statusCode: 400, code: 'BULK_ROWS_INVALID', message: `${preview.errors} row(s) need fixing; nothing was saved.`, ...preview });
    const batch = await this.history.run(ctx, async (tx, c) => {
      const items = await build(tx, c);
      const row = await tx.employeeChangeBatch.create({
        data: { organizationId: c.organizationId, source: meta.source, fileName: meta.fileName ?? null, reason: meta.reason.trim(), rowCount: items.length, requestedBy: c.userId ?? null },
      });
      for (const item of items) {
        if (!item.dto) throw new ConflictException('The data changed while the file was checked. Check it again.');
        const { ch } = await this.history.createChange(tx, c, v, item.dto);
        await tx.employeeChange.update({ where: { id: ch.id }, data: { batchId: row.id } });
      }
      await audit(tx, c, 'employee.change.batch_requested', 'employee_change_batch', row.id, { source: meta.source, rows: items.length, touchesPay: items.some((i) => Boolean(i.dto?.payload.compensation)) });
      return row;
    });
    return { batch: { id: batch.id, status: batch.status, rowCount: batch.rowCount }, ...preview };
  }

  fromCsv(ctx: TenantContext, v: Viewer, dto: { csv: string; fileName?: string; reason: string; dryRun?: boolean }) {
    let rows: RawRow[];
    try {
      rows = parseBulkCsv(dto.csv);
    } catch (e) {
      if (e instanceof CsvProblem) throw new BadRequestException(e.message);
      throw e;
    }
    return this.submit(ctx, v, async (tx, c) => this.resolve(tx, c, v, rows, dto.reason.trim(), await this.reachable(tx, c, v)), { source: 'csv', fileName: dto.fileName, reason: dto.reason, dryRun: dto.dryRun === true });
  }

  /** M01 §3.2: "reassign N reports to …" when a manager leaves or a team moves: a manager change for each. */
  reassign(ctx: TenantContext, v: Viewer, dto: { fromManagerId: string; toManagerId: string; effectiveDate: string; reason: string; dryRun?: boolean }) {
    if (dto.fromManagerId === dto.toManagerId) throw new BadRequestException('Pick a different new manager.');
    const build = async (tx: Tx, c: CompanyContext): Promise<Item[]> => {
      const on = asDate(dto.effectiveDate);
      const reports = await tx.employeeAssignment.findMany({
        where: { organizationId: c.organizationId, managerEmployeeId: dto.fromManagerId, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] },
        select: { employeeId: true },
        orderBy: { employeeId: 'asc' },
      });
      const codes = await tx.employment.findMany({ where: { organizationId: c.organizationId, employeeId: { in: reports.map((r) => r.employeeId) }, exitedOn: null }, select: { employeeId: true, employeeCode: true } });
      const reach = await this.reachable(tx, c, v);
      return reports
        // P02 §4.3: only the reports the viewer's grant reaches are moved (or even listed).
        .filter((r) => r.employeeId !== dto.toManagerId && reach.has(r.employeeId))
        .map((r, i) => ({
          line: i + 1,
          employeeId: r.employeeId,
          employeeCode: codes.find((x) => x.employeeId === r.employeeId)?.employeeCode,
          dto: plainToInstance(ChangeRequestDto, { employeeId: r.employeeId, changeType: 'manager_change', effectiveDate: dto.effectiveDate, payload: { assignment: { managerEmployeeId: dto.toManagerId } }, reason: dto.reason.trim() }),
        }));
    };
    return this.submit(ctx, v, build, { source: 'reassign', reason: dto.reason, dryRun: dto.dryRun === true });
  }

  // ---- the batch: one decision for all its changes ----

  private async batchOr404(tx: Tx, c: CompanyContext, id: string) {
    const b = await tx.employeeChangeBatch.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!b) throw new NotFoundException('Batch not found');
    return b;
  }

  private async visibleBatch(tx: Tx, c: CompanyContext, v: Viewer, id: string) {
    const b = await this.batchOr404(tx, c, id);
    if (!(await this.inView(tx, c, v, b, await this.changesOf(tx, c, id)))) throw new NotFoundException('Batch not found');
    return b;
  }

  /**
   * P02 §4.3: a batch is visible to whoever raised it and to HR whose keys reach every person in it; a batch
   * reaching beyond one's scope stays out of view (same answer as a missing one).
   */
  private async inView(tx: Tx, c: CompanyContext, v: Viewer, b: Prisma.EmployeeChangeBatchGetPayload<object>, changes: Prisma.EmployeeChangeGetPayload<object>[]) {
    if (b.requestedBy && b.requestedBy === v.userId) return true;
    for (const ch of changes) if (!(await this.history.canSeeChange(tx, c, v, ch))) return false;
    return true;
  }

  private changesOf(tx: Tx, c: CompanyContext, id: string) {
    return tx.employeeChange.findMany({ where: { organizationId: c.organizationId, batchId: id }, orderBy: { seq: 'asc' } });
  }

  private async batchView(tx: Tx, c: CompanyContext, v: Viewer, b: Prisma.EmployeeChangeBatchGetPayload<object>, withChanges: boolean) {
    const changes = await this.changesOf(tx, c, b.id);
    const people = withChanges ? await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: changes.map((x) => x.employeeId) } } }) : [];
    // R1 per change date, impacts within scope, pay views recorded (P02 §4.3, YX-SEC-09).
    const views = withChanges ? await this.history.viewChanges(tx, c, v, changes, 'batch') : [];
    return {
      id: b.id,
      status: b.status,
      source: b.source,
      fileName: b.fileName,
      reason: b.reason,
      rowCount: b.rowCount,
      requestedBy: b.requestedBy,
      requestedAt: b.requestedAt,
      decidedAt: b.decidedAt,
      decisionNote: b.decisionNote,
      touchesPay: changes.some((x) => Boolean((x.payload as { compensation?: unknown }).compensation)),
      ...(withChanges
        ? {
            changes: views.map((x) => {
              const p = people.find((y) => y.id === x.employeeId);
              return { ...x, employeeName: p ? displayName(p) : null };
            }),
          }
        : {}),
    };
  }

  list(ctx: TenantContext, v: Viewer, status?: string) {
    return this.history.run(ctx, async (tx, c) => {
      const rows = await tx.employeeChangeBatch.findMany({ where: { organizationId: c.organizationId, ...(status ? { status } : {}) }, orderBy: { requestedAt: 'desc' }, take: 200 });
      const visible = [];
      for (const b of rows) if (await this.inView(tx, c, v, b, await this.changesOf(tx, c, b.id))) visible.push(await this.batchView(tx, c, v, b, false));
      return visible;
    });
  }

  get(ctx: TenantContext, v: Viewer, id: string) {
    return this.history.run(ctx, async (tx, c) => this.batchView(tx, c, v, await this.visibleBatch(tx, c, v, id), true));
  }

  /** One approval for every change in the batch, in the order raised; any failure leaves everything as it was. */
  approve(ctx: TenantContext, v: Viewer, id: string, confirmRebase: boolean, note?: string) {
    return this.history.run(ctx, async (tx, c) => {
      const b = await this.visibleBatch(tx, c, v, id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`batch:${c.organizationId}:${id}`}))`;
      const fresh = await this.batchOr404(tx, c, id);
      if (fresh.status !== 'pending') throw new ConflictException(`This batch is ${fresh.status}.`);
      if (b.requestedBy && b.requestedBy === c.userId) throw new ForbiddenException('You raised this batch, so someone else approves it (YX-SEC-11).');
      const changes = await tx.employeeChange.findMany({ where: { organizationId: c.organizationId, batchId: id, status: 'pending' }, orderBy: { seq: 'asc' } });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: changes.map((x) => x.employeeId) } } });
      const applied = [];
      for (const ch of changes) {
        const e = await this.history.employmentById(tx, c, ch.employmentId);
        await this.history.lockEmployment(tx, c, e.id);
        const who = people.find((p) => p.id === ch.employeeId);
        try {
          if (e.exitedOn) throw new ConflictException('The employment has ended.');
          applied.push(await this.history.approveIn(tx, c, v, ch, e, { confirmRebase, note, simulate: false }));
        } catch (err) {
          // The whole batch rolls back; say which person stopped it.
          if (err instanceof HttpException) {
            const r = err.getResponse();
            const body = typeof r === 'object' ? (r as Record<string, unknown>) : { message: r };
            throw new HttpException({ ...body, statusCode: err.getStatus(), message: `${who ? displayName(who) : 'A person'}: ${String(body.message ?? err.message)}`, changeId: ch.id }, err.getStatus());
          }
          throw err;
        }
      }
      for (const a of applied) await this.history.afterApply(tx, c, a.updated, a.impact, a.effectiveNow);
      const updated = await tx.employeeChangeBatch.update({ where: { id }, data: { status: 'approved', decidedBy: c.userId ?? null, decidedAt: new Date(), decisionNote: note?.trim() || null } });
      await audit(tx, c, 'employee.change.batch_approved', 'employee_change_batch', id, { changes: applied.length });
      return this.batchView(tx, c, v, updated, true);
    });
  }

  /** Reject (an approver, never the requester) or cancel (the requester or HR): every pending change goes with it. */
  close(ctx: TenantContext, v: Viewer, id: string, outcome: 'rejected' | 'cancelled', reason: string) {
    return this.history.run(ctx, async (tx, c) => {
      const b = await this.visibleBatch(tx, c, v, id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`batch:${c.organizationId}:${id}`}))`;
      if ((await this.batchOr404(tx, c, id)).status !== 'pending') throw new ConflictException(`This batch is ${b.status}.`);
      if (outcome === 'rejected' && b.requestedBy === c.userId) throw new ForbiddenException('You raised this batch: cancel it instead.');
      // P02 §4.3: rejecting needs the approval grant over every person in it; cancelling, the requester or HR's change grant over all.
      const key = outcome === 'rejected' ? 'employee.change.approve' : 'employee.change.manage';
      if (outcome === 'rejected' || b.requestedBy !== c.userId) {
        for (const ch of await this.changesOf(tx, c, id)) await this.history.mustReach(tx, c, v, key, ch.employeeId, isoDate(ch.effectiveDate));
      }
      // YX-SEC-11: a batch with a change about oneself is decided by someone else, rejection included.
      if (outcome === 'rejected') {
        const own = await this.history.ownEmployeeId(tx, c, v);
        if (own && (await this.changesOf(tx, c, id)).some((ch) => ch.employeeId === own)) throw new ForbiddenException('This batch includes a change about you, so someone else decides it (YX-SEC-11).');
      }
      const now = new Date();
      await tx.employeeChange.updateMany({ where: { organizationId: c.organizationId, batchId: id, status: 'pending' }, data: { status: outcome, decidedBy: c.userId ?? null, decidedAt: now, decisionNote: reason.trim() } });
      const updated = await tx.employeeChangeBatch.update({ where: { id }, data: { status: outcome, decidedBy: c.userId ?? null, decidedAt: now, decisionNote: reason.trim() } });
      await audit(tx, c, `employee.change.batch_${outcome}`, 'employee_change_batch', id, { reason: reason.trim() });
      return this.batchView(tx, c, v, updated, true);
    });
  }
}

