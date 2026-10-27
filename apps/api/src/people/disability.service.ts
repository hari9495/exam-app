import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgSecretsCryptoService, TenantContext } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { addDays, isoDate, todayIst } from '../org-structure/org-validation';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { sealValue } from './profile.service';
import type { DisabilityDto } from './person-panels.dto';

// PPL-38 Disability declaration (Special class, P02 §4.4; RPwD Act 2016). Voluntary: the person declares with consent
// and may withdraw at any time, which clears what they declared (the audit trail keeps only that it happened). The HR
// diversity role (employee.disability.view, in scope) sees the list, each look recorded for "Who accessed my data";
// managers and everyone else never do. Category, percentage and adjustments are sealed to the person.

const CERT = 'disability_certificate';
interface Details {
  category: string;
  percent: number;
  adjustments: string | null;
}

@Injectable()
export class DisabilityService {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  private open(c: CompanyContext, employeeId: string, blob: string): Details {
    const prefix = `${c.organizationId}:${employeeId}:`;
    const plain = this.crypto.decrypt(blob);
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored value does not belong to this record.');
    return JSON.parse(plain.slice(prefix.length)) as Details;
  }

  private async own(tx: Tx, c: CompanyContext, v: Viewer) {
    const id = await this.history.ownEmployeeId(tx, c, v);
    if (!id || v.actingForOther) throw new NotFoundException('You have no employee record in this company.');
    return id;
  }

  private async certificate(tx: Tx, org: string, id: string | null) {
    const d = id ? await tx.document.findFirst({ where: { organizationId: org, id }, select: { id: true, status: true, expiresOn: true, rejectReason: true, version: true } }) : null;
    return d ? { id: d.id, status: d.status, validUntil: d.expiresOn ? isoDate(d.expiresOn) : null, rejectReason: d.status === 'rejected' ? d.rejectReason : null, version: d.version } : null;
  }

  /** My declaration, if any (the person only). */
  mine(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const employeeId = await this.own(tx, c, v);
      const e = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: employeeId }, select: { personId: true } });
      const company = (await tx.organization.findUniqueOrThrow({ where: { id: c.organizationId }, select: { name: true } })).name;
      const row = await tx.disabilityDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId, withdrawnAt: null } });
      return {
        company,
        personId: e.personId,
        declaration: row
          ? { answer: row.answer, ...(row.detailsEnc ? this.open(c, employeeId, row.detailsEnc) : {}), consentAt: row.consentAt.toISOString(), certificate: await this.certificate(tx, c.organizationId, row.certificateDocumentId) }
          : null,
      };
    });
  }

  /** Declare (or change) with consent; a certificate is the person's own document of the disability certificate type. */
  declare(ctx: TenantContext, v: Viewer, dto: DisabilityDto) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const employeeId = await this.own(tx, c, v);
      const yes = dto.answer === 'yes';
      if (yes && (!dto.category || dto.percent === undefined || !dto.certificateDocumentId)) throw new BadRequestException('Give the category, the percentage and the certificate.');
      if (!yes && (dto.category || dto.percent !== undefined || dto.certificateDocumentId || dto.adjustments)) throw new BadRequestException('Only a "Yes" carries the details.');
      if (dto.certificateDocumentId) {
        const e = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: employeeId }, select: { personId: true } });
        if (!(await tx.document.findFirst({ where: { organizationId: org, id: dto.certificateDocumentId, personId: e.personId, typeKey: CERT } }))) throw new BadRequestException('That certificate is not your disability certificate.');
      }
      const details: Details | null = yes ? { category: dto.category!, percent: dto.percent!, adjustments: dto.adjustments?.trim() || null } : null;
      const data = { answer: dto.answer, detailsEnc: details ? sealValue(this.crypto, org, employeeId, JSON.stringify(details)) : null, certificateDocumentId: dto.certificateDocumentId ?? null, consentAt: new Date(), withdrawnAt: null };
      await tx.disabilityDeclaration.upsert({ where: { organizationId_employeeId: { organizationId: org, employeeId } }, create: { organizationId: org, employeeId, ...data }, update: data });
      await audit(tx, c, 'employee.disability.declared', 'employee', employeeId, { answer: dto.answer });
      return { saved: true };
    });
  }

  /** Withdraw consent: what was declared is cleared. */
  withdraw(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const employeeId = await this.own(tx, c, v);
      const row = await tx.disabilityDeclaration.findFirst({ where: { organizationId: c.organizationId, employeeId, withdrawnAt: null } });
      if (!row) throw new NotFoundException('There is no declaration to withdraw.');
      await tx.disabilityDeclaration.update({ where: { id: row.id }, data: { withdrawnAt: new Date(), detailsEnc: null, certificateDocumentId: null } });
      await audit(tx, c, 'employee.disability.withdrawn', 'employee', employeeId);
      return { withdrawn: true };
    });
  }

  /** The HR diversity role: declared disabilities of the people the key reaches today; each person's look recorded. */
  list(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      if (v.actingForOther) return { rows: [] };
      const rows = await tx.disabilityDeclaration.findMany({ where: { organizationId: org, answer: 'yes', withdrawnAt: null } });
      const reached = await this.history.reachedIds(tx, c, v, 'employee.disability.view', rows.map((r) => r.employeeId));
      const mine = await this.history.ownEmployeeId(tx, c, v);
      const shown = rows.filter((r) => reached.has(r.employeeId) && r.employeeId !== mine);
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: shown.map((r) => r.employeeId) } } });
      const out = [];
      for (const r of shown) {
        const d = this.open(c, r.employeeId, r.detailsEnc!);
        const cert = await this.certificate(tx, org, r.certificateDocumentId);
        await audit(tx, c, 'employee.disability.viewed', 'employee', r.employeeId);
        out.push({ employeeId: r.employeeId, name: displayName(people.find((p) => p.id === r.employeeId)!), category: d.category, percent: d.percent, validUntil: cert?.validUntil ?? null, verified: cert?.status === 'verified', expiringSoon: Boolean(cert?.validUntil && cert.validUntil <= addDays(todayIst(), 90)), certificate: cert });
      }
      return { rows: out.sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }
}
