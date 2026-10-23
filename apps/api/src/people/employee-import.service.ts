import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantContext } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { has } from '../access/scope';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { EmployeeCreateDto } from '../employee-history/dto';
import { FoldError } from '../employee-history/history-rules';
import { hashValue, ProfileService } from './profile.service';
import { fieldIssues, IMPORT_FIELDS, importDate, ImportValues, Issue, plain, showDate } from './employee-import';

// People › Import (PPL-07): employees from a file, each row created through the same hire path as "Add employee"
// (EmployeeHistoryService.createEmployeeIn), so scope, retro limits, references, audit and RLS all apply. "Check"
// runs every row in a transaction that is rolled back; "Import" runs it again and keeps the rows that pass. Each
// row has its own savepoint, so one bad row never stops the others. PAN is never written directly: it is raised as
// an identity change that someone else approves (maker-checker), and only by someone who may raise those.

export interface ImportRowInput {
  row: number;
  values: ImportValues;
}
export interface RowResult {
  row: number;
  name: string;
  code: string | null;
  joined: string | null;
  manager: { code: string; name: string; inFile: boolean } | null;
  issues: Issue[];
  /** Skipped because the person is already an employee (not something to fix). */
  duplicate: boolean;
}

const lower = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const label = (f: keyof typeof IMPORT_FIELDS) => IMPORT_FIELDS[f].label;

/** A Nest or engine error from the hire path, in plain words. */
function rowMessage(e: unknown): string {
  if (e instanceof HttpException) {
    const r = e.getResponse() as string | { code?: string; message?: string | string[] };
    if (typeof r === 'object' && r.code === 'POSSIBLE_SAME_PERSON') return 'This email or mobile already belongs to someone in the company. Add this person from the Directory and link them.';
    const m = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join('; ') : (r.message ?? e.message);
    return plain(m);
  }
  if (e instanceof FoldError) return plain(e.message);
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'This employee code is already used. Use a new code or leave it blank.';
  throw e;
}

@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly profile: ProfileService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  /** Check (nothing saved) or import (rows that pass are saved, the rest skipped). */
  async run(ctx: TenantContext, v: Viewer, legalEntityId: string, fileName: string, rows: ImportRowInput[], save: boolean) {
    if (new Set(rows.map((r) => r.row)).size !== rows.length) throw new BadRequestException('Each row number appears once.');
    const work = (tx: Tx, c: CompanyContext) => this.process(tx, c, v, legalEntityId, fileName, rows, save);
    return save ? this.history.run(ctx, work) : this.history.preview(ctx, work);
  }

  private async process(tx: Tx, c: CompanyContext, v: Viewer, legalEntityId: string, fileName: string, input: ImportRowInput[], save: boolean) {
    const org = c.organizationId;
    const entity = await tx.legalEntity.findFirst({ where: { id: legalEntityId, organizationId: org } });
    if (!entity || entity.archivedAt) throw new BadRequestException('Choose a legal entity of this company.');
    const usable = (m: { archivedAt: Date | null; ownerLegalEntityId: string | null; appliesToEntities: string[] }) =>
      !m.archivedAt && (m.ownerLegalEntityId ? m.ownerLegalEntityId === entity.id : m.appliesToEntities.length === 0 || m.appliesToEntities.includes(entity.id));
    const sel = { id: true, name: true, code: true, archivedAt: true, ownerLegalEntityId: true, appliesToEntities: true } as const;
    const [departments, designations, types, locations] = await Promise.all([
      tx.department.findMany({ where: { organizationId: org }, select: sel }),
      tx.designation.findMany({ where: { organizationId: org }, select: sel }),
      tx.employmentType.findMany({ where: { organizationId: org }, select: sel }),
      tx.location.findMany({ where: { organizationId: org, legalEntityId: entity.id, archivedAt: null }, select: { id: true, name: true, code: true } }),
    ]);
    const finder = <T extends { id: string; name: string; code: string }>(list: T[]) => (s: string | undefined) => list.find((m) => lower(m.name) === lower(s)) ?? list.find((m) => lower(m.code) === lower(s));
    const dept = finder(departments.filter(usable));
    const desig = finder(designations.filter(usable));
    const type = finder(types.filter(usable));
    const loc = finder(locations);

    // Employee codes are Internal (P02 §4.4): a manager code resolves only among people the uploader's HR keys reach.
    const employments = await tx.employment.findMany({ where: { organizationId: org, exitedOn: null }, select: { employeeId: true, employeeCode: true, legalEntityId: true } });
    const ids = employments.map((e) => e.employeeId);
    const names = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, givenName: true, familyName: true, preferredName: true } })).map((p) => [p.id, displayName(p)]));
    const open = employments.map((e) => ({ ...e, name: names.get(e.employeeId) ?? '' }));
    const seen = new Set([...(await this.history.reachedIds(tx, c, v, 'employee.profile.view', ids)), ...(await this.history.reachedIds(tx, c, v, 'employee.change.manage', ids))]);
    const known = open.filter((e) => seen.has(e.employeeId));
    const byCode = (code: string) => known.find((e) => e.legalEntityId === entity.id && lower(e.employeeCode) === lower(code)) ?? known.find((e) => lower(e.employeeCode) === lower(code));
    const codeTaken = new Set(open.filter((e) => e.legalEntityId === entity.id).map((e) => lower(e.employeeCode)));

    // The same PAN on file is the same person, not a new joiner (named only when the uploader may see them).
    const panOf = (r: ImportRowInput) => (r.values.pan ?? '').trim().toUpperCase();
    const hashes = new Map(input.filter(panOf).map((r) => [hashValue(this.crypto, org, 'pan', panOf(r)), r.row]));
    const panOnFile = hashes.size ? await tx.employeeIdentifiers.findMany({ where: { organizationId: org, panHash: { in: [...hashes.keys()] } }, select: { employeeId: true, panHash: true } }) : [];
    const panRow = new Map<number, string>();
    for (const p of panOnFile) panRow.set(hashes.get(p.panHash!)!, p.employeeId);
    const panAllowed = has(v, 'employee.identity.manage') && !v.actingForOther;

    const results = new Map<number, RowResult>();
    const inFile = new Map(input.filter((r) => r.values.code?.trim()).map((r) => [lower(r.values.code), r]));
    for (const r of input) {
      const val = r.values;
      const issues = fieldIssues(val);
      const res: RowResult = { row: r.row, name: (val.name ?? '').trim(), code: val.code?.trim() || null, joined: importDate(val.joined ?? '') ? showDate(importDate(val.joined ?? '')!) : (val.joined?.trim() || null), manager: null, issues, duplicate: false };
      results.set(r.row, res);
      const other = panRow.get(r.row);
      if (other) {
        const e = open.find((x) => x.employeeId === other);
        res.duplicate = true;
        res.issues = [{ field: 'Already an employee', message: e && seen.has(other) ? `Looks like ${e.name} (${e.employeeCode}, same PAN), who is already an employee. This row is skipped.` : 'Someone with this PAN is already an employee. This row is skipped.' }];
        continue;
      }
      const twin = input.find((x) => x.row < r.row && panOf(x) && panOf(x) === panOf(r));
      if (twin) issues.push({ field: label('pan'), message: `Row ${twin.row} has the same PAN. One person is one row.` });
      if (panOf(r) && !panAllowed) issues.push({ field: label('pan'), message: 'You cannot add PAN numbers. Leave the PAN column out, or ask someone who manages identity details.' });
      const code = val.code?.trim();
      if (code && codeTaken.has(lower(code))) issues.push({ field: label('code'), message: `${code} already exists. Use a new code or leave it blank.` });
      if (code && input.some((x) => x.row < r.row && lower(x.values.code) === lower(code))) issues.push({ field: label('code'), message: `Row ${input.find((x) => lower(x.values.code) === lower(code))!.row} has the same code.` });
      const look = [
        ['department', dept],
        ['designation', desig],
        ['location', loc],
        ['type', type],
      ] as const;
      for (const [f, find] of look) if (val[f]?.trim() && !find(val[f])) issues.push({ field: label(f), message: `No ${label(f).toLowerCase()} called "${val[f]!.trim()}"${f === 'location' ? ` in ${entity.name}` : ''}. Check the name.` });
      const m = val.manager?.trim();
      if (m) {
        const mine = inFile.get(lower(m));
        const there = byCode(m);
        if (mine && mine.row === r.row) issues.push({ field: label('manager'), message: 'A person cannot be their own manager.' });
        else if (mine) res.manager = { code: m, name: (mine.values.name ?? '').trim(), inFile: true };
        else if (there) res.manager = { code: there.employeeCode, name: there.name, inFile: false };
        else issues.push({ field: label('manager'), message: `No employee with code ${m}. Check the code.` });
      }
    }

    // Managers in the file are created before the people who report to them; a loop can never be created.
    const order: ImportRowInput[] = [];
    const placed = new Set<number>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const r of input) {
        if (placed.has(r.row)) continue;
        const boss = results.get(r.row)!.manager;
        const dep = boss?.inFile ? inFile.get(lower(boss.code)) : undefined;
        if (!dep || placed.has(dep.row)) {
          order.push(r);
          placed.add(r.row);
          progress = true;
        }
      }
    }
    for (const r of input) if (!placed.has(r.row)) results.get(r.row)!.issues.push({ field: label('manager'), message: 'The managers in these rows point to each other in a circle. Fix one of them.' });

    const created = new Map<number, string>();
    const reason = `Imported from ${fileName}`.slice(0, 1000);
    for (const r of order) {
      const res = results.get(r.row)!;
      if (res.issues.length) continue;
      const val = r.values;
      let managerEmployeeId: string | null = null;
      if (res.manager?.inFile) {
        const bossRow = inFile.get(lower(res.manager.code))!.row;
        managerEmployeeId = created.get(bossRow) ?? null;
        if (!managerEmployeeId) {
          res.issues.push({ field: label('manager'), message: `The manager's row (row ${bossRow}) has a problem. Fix that row first.` });
          continue;
        }
      } else if (res.manager) managerEmployeeId = byCode(res.manager.code)!.employeeId;
      const words = (val.name ?? '').trim().split(/\s+/);
      const dto: EmployeeCreateDto = {
        givenName: words.length > 1 ? words.slice(0, -1).join(' ') : words[0],
        ...(words.length > 1 ? { familyName: words[words.length - 1] } : {}),
        ...(val.email?.trim() ? { workEmail: val.email.trim() } : {}),
        ...(val.mobile?.trim() ? { mobilePhone: val.mobile.trim().slice(0, 20) } : {}),
        legalEntityId: entity.id,
        ...(val.code?.trim() ? { employeeCode: val.code.trim() } : {}),
        joinedOn: importDate(val.joined!)!,
        status: lower(val.status) === 'confirmed' ? 'confirmed' : 'probation',
        assignment: { locationId: loc(val.location)!.id, departmentId: dept(val.department)!.id, designationId: desig(val.designation)!.id, employmentTypeId: type(val.type)!.id, managerEmployeeId },
        reason,
      };
      await tx.$executeRawUnsafe('SAVEPOINT import_row');
      try {
        const out = await this.history.createEmployeeIn(tx, c, v, dto);
        if (panOf(r)) await this.profile.raiseIn(tx, c, out.id, 'pan', { pan: panOf(r) }, reason);
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT import_row');
        created.set(r.row, out.id);
        res.code = out.employeeCode;
      } catch (e) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT import_row');
        res.issues.push({ field: 'Row', message: rowMessage(e) });
      }
    }
    if (save && created.size) await audit(tx, c, 'employee.import', 'legal_entity', entity.id, { fileName, rows: input.length, created: created.size, skipped: input.length - created.size });
    return { rows: input.map((r) => results.get(r.row)!), ready: created.size, ...(save ? { created: created.size } : {}) };
  }
}
