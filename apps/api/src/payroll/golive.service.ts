import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { asDate } from '../time/time-core';
import { sha256 } from './pay-file-store';
import { entitiesFor, payScope, payViewer, requireSelf } from './pay-access';

// Go-live (M03-BUILD-DESIGN §17.10, PAY-10.07): the parallel run and the readiness page. A month is paid by the old
// payroll and worked out by YukthiX; the old register (employee code, gross, deductions, net) is uploaded and compared
// person by person, to the rupee. Someone other than the uploader signs it off (a reason when differences remain) or
// waives it with a reason. The readiness page lists what a legal entity still needs before its first live month.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const TOLERANCE = D(1);
const CAP_ROWS = 5000;

export interface RegisterRow {
  employeeCode: string;
  gross: string;
  deductions: string;
  net: string;
}

/** The old payroll's register as CSV: a header with employee_code, gross, deductions and net (other columns ignored). */
export function parseRegister(csv: string): { rows: RegisterRow[]; problems: string[] } {
  let table: string[][];
  try {
    table = parse(csv.replace(/^\uFEFF/, ''), { skip_empty_lines: true, trim: true, relax_column_count: true, to: CAP_ROWS + 2 }) as string[][];
  } catch {
    return { rows: [], problems: ['This is not a CSV file.'] };
  }
  if (!table.length) return { rows: [], problems: ['The file is empty.'] };
  const head = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const at = (k: string) => head.indexOf(k);
  const missing = ['employee_code', 'gross', 'deductions', 'net'].filter((k) => at(k) < 0);
  if (missing.length) return { rows: [], problems: [`The header needs ${missing.join(', ')}.`] };
  if (table.length - 1 > CAP_ROWS) return { rows: [], problems: [`At most ${CAP_ROWS} people in one file.`] };
  const rows: RegisterRow[] = [];
  const problems: string[] = [];
  const money = /^-?\d{1,12}(\.\d{1,2})?$/;
  const amount = (c: string[], k: string) => (c[at(k)] ?? '').replace(/,/g, '');
  table.slice(1).forEach((c, i) => {
    const r = { employeeCode: c[at('employee_code')] ?? '', gross: amount(c, 'gross'), deductions: amount(c, 'deductions'), net: amount(c, 'net') };
    if (!r.employeeCode || ![r.gross, r.deductions, r.net].every((x) => money.test(x))) problems.push(`Line ${i + 2}: an employee code and three amounts are needed.`);
    else if (rows.some((x) => x.employeeCode === r.employeeCode)) problems.push(`Line ${i + 2}: ${r.employeeCode} is listed twice.`);
    else rows.push(r);
  });
  return { rows, problems: problems.slice(0, 50) };
}

export interface CompareRow {
  employeeCode: string;
  name: string | null;
  field: 'gross' | 'deductions' | 'net' | 'missing_in_yukthix' | 'missing_in_register';
  ours: string | null;
  theirs: string | null;
  difference: string | null;
}

/** Person by person, the amounts that differ by more than a rupee, and people on one side only. */
export function compareRegister(ours: (RegisterRow & { name: string })[], theirs: RegisterRow[]): { matched: number; rows: CompareRow[] } {
  const out: CompareRow[] = [];
  let matched = 0;
  for (const t of theirs) {
    const o = ours.find((x) => x.employeeCode === t.employeeCode);
    if (!o) {
      out.push({ employeeCode: t.employeeCode, name: null, field: 'missing_in_yukthix', ours: null, theirs: t.net, difference: null });
      continue;
    }
    let same = true;
    for (const k of ['gross', 'deductions', 'net'] as const) {
      const diff = D(o[k]).sub(t[k]);
      if (diff.abs().gt(TOLERANCE)) {
        same = false;
        out.push({ employeeCode: t.employeeCode, name: o.name, field: k, ours: D(o[k]).toFixed(2), theirs: D(t[k]).toFixed(2), difference: diff.toFixed(2) });
      }
    }
    if (same) matched++;
  }
  for (const o of ours) if (!theirs.some((t) => t.employeeCode === o.employeeCode)) out.push({ employeeCode: o.employeeCode, name: o.name, field: 'missing_in_register', ours: o.net, theirs: null, difference: null });
  return { matched, rows: out };
}

@Injectable()
export class GoLiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private view(p: Prisma.ParallelRunGetPayload<object>) {
    const r = p.result as unknown as { matched: number; rows: CompareRow[]; people: number };
    return { id: p.id, runId: p.runId, legalEntityId: p.legalEntityId, status: p.status, people: r.people, matched: r.matched, differences: p.differences, rows: r.rows, reason: p.reason, createdBy: p.createdBy, decidedBy: p.decidedBy, decidedAt: p.decidedAt, createdAt: p.createdAt };
  }

  /** Upload the old register for a calculated run and compare it (an earlier comparison of the run is superseded). */
  async upload(ctx: TenantContext, user: ScopeUser, runId: string, file: Buffer | undefined) {
    const v = await this.viewer(user);
    if (!file?.length) throw new BadRequestException('Attach the old payroll’s register as CSV.');
    const { rows: theirs, problems } = parseRegister(file.toString('utf8'));
    if (problems.length) throw new BadRequestException({ statusCode: 400, message: 'Fix the register first.', problems });
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.run.prepare');
      await payScope(tx, ids);
      const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: runId } });
      if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
      if (run.runType !== 'regular' || !['calculated', 'in_review', 'submitted', 'approved', 'paid'].includes(run.status)) throw new ConflictException('Compare a calculated monthly run.');
      const slips = await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: { in: ['draft', 'approved'] } } });
      const ems = await tx.employment.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employmentId) } }, select: { id: true, employeeCode: true, employeeId: true } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: slips.map((s) => s.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const ours = slips.map((s) => {
        const em = ems.find((e) => e.id === s.employmentId);
        const p = people.find((x) => x.id === s.employeeId);
        return { employeeCode: em?.employeeCode ?? '', name: [p?.preferredName ?? p?.givenName, p?.familyName].filter(Boolean).join(' '), gross: s.gross.toFixed(2), deductions: s.deductions.toFixed(2), net: s.net.toFixed(2) };
      });
      const cmp = compareRegister(ours, theirs);
      await tx.parallelRun.updateMany({ where: { organizationId: org, runId: run.id, status: 'compared' }, data: { status: 'superseded' } });
      const p = await tx.parallelRun.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, runId: run.id, fileSha256: sha256(file), reference: theirs as unknown as Prisma.InputJsonValue, result: { ...cmp, people: ours.length } as unknown as Prisma.InputJsonValue, differences: cmp.rows.length, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.parallel_run.compared', 'parallel_run', p.id, { runId: run.id, people: ours.length, matched: cmp.matched, differences: cmp.rows.length, sha256: p.fileSha256 });
      return this.view(p);
    });
  }

  async list(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set([...(await entitiesFor(tx, c, v, 'payroll.run.prepare')), ...(await entitiesFor(tx, c, v, 'payroll.run.approve'))])];
      if (!ids.includes(entityId)) throw new NotFoundException('Not found');
      await payScope(tx, ids);
      return (await tx.parallelRun.findMany({ where: { organizationId: c.organizationId, legalEntityId: entityId }, orderBy: { createdAt: 'desc' }, take: 50 })).map((p) => this.view(p));
    });
  }

  /** Signed off (a reason when differences remain) or waived with a reason, by someone other than the uploader. */
  async decide(ctx: TenantContext, user: ScopeUser, id: string, decision: 'signed_off' | 'waived', reason: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.run.approve');
      await payScope(tx, ids);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`parallel:${id}`}))`;
      const p = await tx.parallelRun.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!p || !ids.includes(p.legalEntityId)) throw new NotFoundException('Not found');
      if (p.status !== 'compared') throw new ConflictException(`This comparison is ${p.status.replace('_', ' ')}.`);
      if (p.createdBy === v.userId) throw new ForbiddenException('Someone other than the person who uploaded the register signs it off.');
      if ((decision === 'waived' || p.differences > 0) && !reason) throw new BadRequestException(decision === 'waived' ? 'Say why the parallel run is waived.' : 'Differences remain: say why they are accepted.');
      const done = await tx.parallelRun.update({ where: { id: p.id }, data: { status: decision, reason, decidedBy: v.userId, decidedAt: new Date() } });
      await audit(tx, c, `payroll.parallel_run.${decision}`, 'parallel_run', p.id, { runId: p.runId, differences: p.differences, reason });
      return this.view(done);
    });
  }

  /** What a legal entity still needs before its first live month (each item says what to do). */
  async readiness(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = [...new Set([...(await entitiesFor(tx, c, v, 'payroll.run.prepare')), ...(await entitiesFor(tx, c, v, 'payroll.setup.manage'))])];
      if (!ids.includes(entityId)) throw new NotFoundException('Not found');
      await payScope(tx, ids);
      const today = todayIst();
      const on = asDate(today);
      const employments = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: entityId, joinedOn: { lte: on }, OR: [{ exitedOn: null }, { exitedOn: { gte: on } }] }, select: { id: true, employeeId: true } });
      const n = employments.length;
      const inGroup = await tx.payGroupMember.findMany({ where: { organizationId: org, employmentId: { in: employments.map((e) => e.id) }, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] }, distinct: ['employmentId'], select: { employmentId: true } });
      const comps = await tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: employments.map((e) => e.id) }, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] }, select: { employmentId: true, changeId: true } });
      const pkgs = await tx.compensationPackage.findMany({ where: { organizationId: org, changeId: { in: comps.map((x) => x.changeId) } }, select: { employmentId: true } });
      const banks = await tx.employeeBankAccount.findMany({ where: { organizationId: org, employeeId: { in: employments.map((e) => e.employeeId) }, purpose: 'salary', validTo: null }, distinct: ['employeeId'], select: { employeeId: true } });
      const idents = await tx.employeeIdentifiers.findMany({ where: { organizationId: org, employeeId: { in: employments.map((e) => e.employeeId) } }, select: { panHash: true, uanHash: true } });
      const regs = await tx.statutoryRegistration.findMany({ where: { organizationId: org, legalEntityId: entityId, status: { in: ['on', 'applied_awaited'] } }, select: { statute: true } });
      const parallel = await tx.parallelRun.findFirst({ where: { organizationId: org, legalEntityId: entityId, status: { in: ['signed_off', 'waived'] } }, orderBy: { decidedAt: 'desc' } });
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: entityId }, select: { tan: true, pan: true, registeredAddress: true } });
      const verify = (await this.rules.published()).filter((r) => r.verify).length;
      const count = (k: number) => `${k} of ${n}`;
      const items = [
        { key: 'registrations', label: 'Statutory registrations recorded', ok: regs.length > 0, detail: regs.length ? regs.map((r) => r.statute).join(', ') : 'Record PF, ESI, PT and TDS in Payroll set-up.' },
        { key: 'deductor', label: 'TAN, PAN and registered address of the legal entity', ok: !!(entity.tan && entity.pan && entity.registeredAddress), detail: entity.tan && entity.pan ? 'Recorded.' : 'Needed for the quarterly TDS return.' },
        { key: 'pay_groups', label: 'Everyone in a pay group', ok: inGroup.length === n && n > 0, detail: count(inGroup.length) },
        { key: 'salaries', label: 'Everyone has a salary with its breakup', ok: pkgs.length >= n && n > 0, detail: count(new Set(pkgs.map((p) => p.employmentId)).size) },
        { key: 'banks', label: 'Everyone has a salary bank account', ok: banks.length >= n && n > 0, detail: count(banks.length) },
        { key: 'pan', label: 'PAN on file', ok: idents.filter((i) => i.panHash).length >= n, detail: `${count(idents.filter((i) => i.panHash).length)} (without a PAN, tax is deducted at the higher rate)` },
        { key: 'uan', label: 'UAN on file', ok: idents.filter((i) => i.uanHash).length >= n, detail: `${count(idents.filter((i) => i.uanHash).length)} (the PF file lists people by UAN)` },
        { key: 'parallel', label: 'A parallel run signed off', ok: !!parallel, detail: parallel ? `${parallel.status === 'waived' ? 'Waived' : 'Signed off'}${parallel.reason ? `: ${parallel.reason}` : ''}` : 'Pay one month in the old payroll too, upload its register on the run and have someone else sign it off.' },
        { key: 'rules', label: 'Statutory rules marked verify', ok: true, info: true, detail: `${verify} published rule sets are marked verify; the compliance owner confirms them (go-live checklist).` },
      ];
      return { entityId, people: n, ready: items.every((i) => i.ok), items };
    });
  }
}
