import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, type ScopeUser } from '../access/scope';
import { hashValue, sealValue } from '../people/profile.service';
import { FilesService } from '../documents/files.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { minWageTable, minWageTableFor } from '../statutory/evaluator';
import { reachOf, reaches, reachWhere, type Reach } from './reach';

// Contract labour, part 2 (founder decision 21 Oct 2026): vendor compliance (CLB-03), CLRA registers and returns (CLB-04)
// and reports, worked out from contractors, licences, deployments and the proofs contractors hand in. Nothing is
// invented: a register or return that needs data the product does not hold yet (daily attendance of contract workers,
// the contractor's wage lines, deductions, overtime) says so instead. Keys: clra.worker.view (read), clra.worker.manage
// (workers), clra.compliance.manage (verify, release a held bill, close alerts), clra.identity.view (Aadhaar, UAN, ESI
// in full, audited). Reach as for workers: company, legal entity or site.

const KEYS = ['clra.worker.view', 'clra.worker.manage', 'clra.compliance.manage', 'clra.identity.view'] as const;
type Key = (typeof KEYS)[number];
export const PROOF_TYPES = ['pf', 'esi', 'wage_register', 'wage_payment', 'pt_lwf'] as const;
export type ProofType = (typeof PROOF_TYPES)[number];
export const DOCUMENT_KINDS = ['licence', 'registration', 'pf_code', 'esi_code', 'insurance', 'other'] as const;
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const nextMonthDay = (m: string, day: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), day)).toISOString().slice(0, 10);
const addDays = (on: string, n: number) => new Date(D(on).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const days = (from: string, to: string) => Math.round((D(to).getTime() - D(from).getTime()) / 86_400_000) + 1;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthText = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dayText = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const nameOf = (p: { givenName: string; familyName: string | null; preferredName: string | null } | undefined) => (p ? p.preferredName || [p.givenName, p.familyName].filter(Boolean).join(' ') : '');
/** Proofs are due by the 15th of the month after the wage month; wages by the 7th (Payment of Wages, under 1,000 workers). */
export const proofDue = (m: string) => nextMonthDay(m, 15);
export const wageDue = (m: string) => nextMonthDay(m, 7);
// The rates that size a short PF or ESI challan (an estimate of what the principal employer may have to make good).
const ESI_RATE = 0.04;
const ESI_CEILING = 21000;
const PF_RATE = 0.24;
const PF_CEILING = 15000;
const REGISTER_FORMS: Record<string, string> = {
  contractors: 'CLRA Central Rules 1971 · Form XII',
  workmen: 'CLRA Central Rules 1971 · Form XIII',
  muster: 'CLRA Central Rules 1971 · Form XVI',
  wages: 'CLRA Central Rules 1971 · Form XVII',
  deductions: 'CLRA Central Rules 1971 · Form XX',
  overtime: 'CLRA Central Rules 1971 · Form XXIII',
};

type Deployment = Prisma.ContractDeploymentGetPayload<object>;
/** On site in the month: approved, and the deployment overlaps it. */
const inMonth = (w: Deployment, m: string) => w.status !== 'pending' && iso(w.fromOn)! <= monthEnd(m) && (!w.toOn || iso(w.toOn)! >= `${m}-01`);
const onDay = (w: Deployment, d: string) => w.status !== 'pending' && iso(w.fromOn)! <= d && (!w.toOn || iso(w.toOn)! >= d);

export interface IdentifierInput {
  aadhaar?: string;
  uan?: string;
  esic?: string;
  gatePass?: string;
  gatePassValidTo?: string;
}

@Injectable()
export class ContractComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async need(user: ScopeUser, key: Key): Promise<Reach> {
    const r = reachOf(await buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]), key);
    if (!r) throw new ForbiddenException('You do not have access to this.');
    return r;
  }

  private files() {
    return this.moduleRef.get(FilesService, { strict: false });
  }

  /** Contractors in reach (their entity, or a licence at one of the person's sites), with their licences and workers. */
  private async scope(tx: Tx, org: string, r: Reach, legalEntityId: string | null) {
    const licences = await tx.contractorLicence.findMany({ where: { organizationId: org } });
    const all = await tx.contractor.findMany({ where: { organizationId: org, ...(legalEntityId ? { legalEntityId } : {}) }, orderBy: { name: 'asc' } });
    const contractors = all.filter((k) => reaches(r, k.legalEntityId) || licences.some((l) => l.contractorId === k.id && r.locations.includes(l.locationId)));
    const ids = contractors.map((k) => k.id);
    const workers = await tx.contractDeployment.findMany({ where: { organizationId: org, contractorId: { in: ids }, ...reachWhere(r) } });
    const sites = await tx.location.findMany({ where: { organizationId: org }, select: { id: true, name: true, state: true, minWageZone: true, legalEntityId: true } });
    return { contractors, licences: licences.filter((l) => ids.includes(l.contractorId)), workers, sites };
  }

  // ------------------------------------------------------------------------------------------ identifiers (Confidential)

  /** Seals what was given; the last four are kept for display. Aadhaar is checked against open deployments by its hash. */
  async identifierData(tx: Tx, c: CompanyContext, deploymentId: string, i: IdentifierInput) {
    const org = c.organizationId;
    const data: Prisma.ContractDeploymentUpdateInput = {};
    if (i.aadhaar) {
      const hash = hashValue(this.crypto, org, 'aadhaar', i.aadhaar);
      const other = await tx.contractDeployment.findFirst({ where: { organizationId: org, aadhaarHash: hash, status: { not: 'released' }, id: { not: deploymentId } } });
      if (other) throw new ConflictException('This Aadhaar is already on a worker deployed by a contractor.');
      Object.assign(data, { aadhaarEnc: sealValue(this.crypto, org, deploymentId, i.aadhaar), aadhaarHash: hash, aadhaarLast4: i.aadhaar.slice(-4) });
    }
    if (i.uan) Object.assign(data, { uanEnc: sealValue(this.crypto, org, deploymentId, i.uan), uanLast4: i.uan.slice(-4) });
    if (i.esic) Object.assign(data, { esicEnc: sealValue(this.crypto, org, deploymentId, i.esic), esicLast4: i.esic.slice(-4) });
    if (i.gatePass !== undefined) {
      if (i.gatePass && (await tx.contractDeployment.findFirst({ where: { organizationId: org, gatePass: i.gatePass, status: { not: 'released' }, id: { not: deploymentId } } }))) throw new ConflictException('This gate pass number is already given to another worker.');
      Object.assign(data, { gatePass: i.gatePass || null });
    }
    if (i.gatePassValidTo !== undefined) Object.assign(data, { gatePassValidTo: i.gatePassValidTo ? D(i.gatePassValidTo) : null });
    return data;
  }

  async setIdentifiers(ctx: TenantContext, user: ScopeUser, id: string, dto: IdentifierInput) {
    const r = await this.need(user, 'clra.worker.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const w = await tx.contractDeployment.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!w || !reaches(r, w.legalEntityId, w.locationId)) throw new NotFoundException('Not found');
      const data = await this.identifierData(tx, c, id, dto);
      await tx.contractDeployment.update({ where: { id }, data });
      // Which fields changed, never their values.
      await audit(tx, c, 'clra.worker.identifiers_set', 'contract_deployment', id, { fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined) });
      return { id };
    });
  }

  /** The full Aadhaar, UAN or ESI number, for clra.identity.view where it reaches; every view is recorded. */
  async reveal(ctx: TenantContext, user: ScopeUser, id: string, field: 'aadhaar' | 'uan' | 'esic') {
    const r = await this.need(user, 'clra.identity.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const w = await tx.contractDeployment.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!w || !reaches(r, w.legalEntityId, w.locationId)) throw new NotFoundException('Not found');
      const blob = field === 'aadhaar' ? w.aadhaarEnc : field === 'uan' ? w.uanEnc : w.esicEnc;
      if (!blob) throw new NotFoundException('Nothing on file');
      const prefix = `${c.organizationId}:${id}:`;
      const plain = this.crypto.decrypt(blob);
      if (!plain.startsWith(prefix)) throw new ConflictException('A stored value does not belong to this record.');
      await audit(tx, c, 'clra.worker.identity_viewed', 'contract_deployment', id, { field });
      return { field, value: plain.slice(prefix.length) };
    });
  }

  /** The minimum wage for a site and skill on a date (the published state table), or why there is none on record. */
  async minimumWage(ctx: TenantContext, user: ScopeUser, locationId: string, skill: string, on: string) {
    await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const site = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: locationId }, select: { state: true, minWageZone: true } });
      if (!site) throw new NotFoundException('Not found');
      return this.minWageFor(site, skill, on);
    });
  }

  private async minWageFor(site: { state: string; minWageZone: string | null }, skill: string, on: string): Promise<{ monthly: string; text: string } | { monthly: null; text: string }> {
    const sets = await this.moduleRef.get(StatutoryRulesService, { strict: false }).published();
    const table = minWageTableFor(sets, site.state, on);
    if (!table) return { monthly: null, text: 'No minimum wage table on record for this state yet.' };
    if (!site.minWageZone) return { monthly: null, text: 'The site has no minimum-wage zone set (Settings › Locations).' };
    const rate = minWageTable(table, { zone: site.minWageZone, skill });
    if (rate.skillFallback) return { monthly: null, text: `The ${String(table.values.employment ?? '').replace(/_/g, ' ')} table has no "${skill.replace(/_/g, '-')}" class; check the schedule that applies.` };
    return { monthly: rate.monthly.toFixed(2), text: `Minimum for zone ${rate.zone}, ${skill.replace(/_/g, '-')}: ₹${Number(rate.monthly).toLocaleString('en-IN')} a month` };
  }

  /** Contract workers as a CSV or Excel file (identifiers masked), recorded. */
  async exportWorkers(ctx: TenantContext, user: ScopeUser, format: 'csv' | 'xlsx', legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { contractors, workers, sites } = await this.scope(tx, org, r, legalEntityId);
      const people = await tx.person.findMany({ where: { organizationId: org, id: { in: workers.map((w) => w.personId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const head = ['Name', 'Contractor', 'Site', 'Work', 'Skill', 'Wage (by contractor)', 'Deployed from', 'Released on', 'Status', 'Gate pass', 'Aadhaar', 'UAN', 'ESI IP'];
      const rows = workers.map((w) => [
        nameOf(people.find((p) => p.id === w.personId)),
        contractors.find((k) => k.id === w.contractorId)?.name ?? '',
        sites.find((s) => s.id === w.locationId)?.name ?? '',
        w.work,
        w.skill.replace(/_/g, '-'),
        w.wage?.toFixed(2) ?? '',
        iso(w.fromOn)!,
        iso(w.toOn) ?? '',
        w.status,
        w.gatePass ?? '',
        w.aadhaarLast4 ? `XXXX XXXX ${w.aadhaarLast4}` : '',
        w.uanLast4 ? `XXXXXXXX${w.uanLast4}` : '',
        w.esicLast4 ? `XXXXXX${w.esicLast4}` : '',
      ]);
      await audit(tx, c, 'clra.workers.exported', 'contract_deployment', 'list', { rows: rows.length, format, legalEntityId });
      return { file: await sheetFile(format, 'Contract workers', head, rows), name: `contract-workers.${format}` };
    });
  }

  // ------------------------------------------------------------------------------------------ contractor codes and documents

  async updateContractor(ctx: TenantContext, user: ScopeUser, id: string, dto: { gstin?: string | null; pfCode?: string | null; esicCode?: string | null; lin?: string | null; contact?: string | null; status?: 'active' | 'inactive' }) {
    const r = await this.need(user, 'clra.worker.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      await tx.contractor.update({ where: { id }, data: dto });
      await audit(tx, c, 'clra.contractor.updated', 'contractor', id, { fields: Object.keys(dto) });
      return { id };
    });
  }

  async documents(ctx: TenantContext, user: ScopeUser, contractorId: string) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { contractors } = await this.scope(tx, c.organizationId, r, null);
      if (!contractors.some((k) => k.id === contractorId)) throw new NotFoundException('Not found');
      const rows = await tx.contractorDocument.findMany({ where: { organizationId: c.organizationId, contractorId }, orderBy: { createdAt: 'desc' } });
      const names = await this.userNames(tx, c.organizationId, rows.flatMap((x) => [x.submittedBy, x.verifiedBy]));
      return rows.map((x) => ({ id: x.id, kind: x.kind, number: x.number, validFrom: iso(x.validFrom), validTo: iso(x.validTo), status: x.status, note: x.note, hasFile: Boolean(x.fileId), submittedBy: names.get(x.submittedBy ?? '') ?? null, verifiedBy: names.get(x.verifiedBy ?? '') ?? null, mine: x.submittedBy === c.userId }));
    });
  }

  async addDocument(ctx: TenantContext, user: ScopeUser, contractorId: string, dto: { kind: string; number?: string; validFrom?: string; validTo?: string; note?: string }, file?: { name: string; data: Buffer }) {
    const r = await this.need(user, 'clra.worker.manage');
    if (dto.validFrom && dto.validTo && dto.validTo < dto.validFrom) throw new BadRequestException('The document ends before it starts.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id: contractorId } });
      if (!k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      const stored = file ? await this.files().storeIn(tx, c, { area: 'contractor-documents', name: file.name, data: file.data, allowedMime: ['application/pdf', 'image/jpeg', 'image/png'], maxMb: 10, via: 'staff' }) : null;
      const row = await tx.contractorDocument.create({ data: { organizationId: c.organizationId, contractorId, kind: dto.kind, number: dto.number?.trim() || null, validFrom: dto.validFrom ? D(dto.validFrom) : null, validTo: dto.validTo ? D(dto.validTo) : null, note: dto.note?.trim() || null, fileId: stored?.id ?? null, submittedBy: c.userId ?? null } });
      await audit(tx, c, 'clra.document.added', 'contractor_document', row.id, { contractorId, kind: dto.kind, validTo: dto.validTo ?? null, file: Boolean(stored) });
      return { id: row.id, fileId: stored?.id ?? null, org: c.organizationId };
    });
    if (out.fileId) void this.files().scan(out.org, out.fileId);
    return { id: out.id };
  }

  /** A document is checked by someone other than who added it. */
  async decideDocument(ctx: TenantContext, user: ScopeUser, id: string, decision: 'verified' | 'rejected', note?: string) {
    const r = await this.need(user, 'clra.compliance.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const x = await tx.contractorDocument.findFirst({ where: { organizationId: c.organizationId, id } });
      const k = x ? await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id: x.contractorId } }) : null;
      if (!x || !k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      if (x.submittedBy && x.submittedBy === c.userId) throw new ForbiddenException('You added this document, so someone else must check it.');
      if (x.status !== 'submitted') throw new ConflictException(`This document is already ${x.status}.`);
      if (decision === 'rejected' && !note?.trim()) throw new BadRequestException('Say why the document is rejected.');
      await tx.contractorDocument.update({ where: { id }, data: { status: decision, verifiedBy: c.userId ?? null, verifiedAt: new Date(), ...(note?.trim() ? { note: note.trim() } : {}) } });
      await audit(tx, c, `clra.document.${decision}`, 'contractor_document', id, { note: note ?? null });
      return { id, status: decision };
    });
  }

  // ------------------------------------------------------------------------------------------ vendor compliance (CLB-03)

  /** The month's matrix (contractor × proof), bill holds, liability alerts and each contractor's standing documents. */
  async compliance(ctx: TenantContext, user: ScopeUser, month: string, legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const { contractors, licences, workers, sites } = await this.scope(tx, org, r, legalEntityId);
      const start = D(`${month}-01`);
      const proofs = await tx.contractorProof.findMany({ where: { organizationId: org, contractorId: { in: contractors.map((k) => k.id) }, month: start } });
      const releases = await tx.contractorBillRelease.findMany({ where: { organizationId: org, contractorId: { in: contractors.map((k) => k.id) }, month: start } });
      const documents = await tx.contractorDocument.findMany({ where: { organizationId: org, contractorId: { in: contractors.map((k) => k.id) } } });
      const notes = new Set((await tx.contractorAlertNote.findMany({ where: { organizationId: org } })).map((n) => n.alertKey));
      const due = proofDue(month);
      const matrix = contractors.map((k) => {
        const onSite = workers.filter((w) => w.contractorId === k.id && inMonth(w, month));
        const statuses = PROOF_TYPES.map((t) => {
          const p = proofs.find((x) => x.contractorId === k.id && x.proofType === t);
          const status = p ? p.status : today > due ? 'overdue' : 'open';
          return { type: t, status, proofId: p?.id ?? null };
        });
        const held = statuses.some((s) => s.status === 'overdue' || s.status === 'discrepancy');
        const release = releases.find((x) => x.contractorId === k.id);
        const docs = documents.filter((d) => d.contractorId === k.id);
        const expiredDoc = docs.some((d) => d.validTo && iso(d.validTo)! < today);
        const expiredLicence = licences.some((l) => l.contractorId === k.id && iso(l.validTo)! < today);
        return {
          contractorId: k.id,
          contractor: k.name,
          workers: onSite.length,
          statuses,
          held,
          released: release ? { reason: release.reason, on: iso(release.createdAt) } : null,
          // Compliant only when nothing is overdue, in dispute or expired.
          standing: held || expiredDoc || expiredLicence ? 'action_needed' : statuses.every((s) => s.status === 'verified' || s.status === 'not_required') ? 'compliant' : 'in_progress',
          documents: { total: docs.length, verified: docs.filter((d) => d.status === 'verified').length, expiring: docs.filter((d) => d.validTo && iso(d.validTo)! >= today && iso(d.validTo)! <= addDays(today, 60)).length, expired: docs.filter((d) => d.validTo && iso(d.validTo)! < today).length },
        };
      });
      const alerts = (await this.alerts(tx, org, month, today, contractors, licences, workers, sites, proofs)).filter((a) => !notes.has(a.key));
      return { month, dueOn: due, wageDueOn: wageDue(month), proofTypes: [...PROOF_TYPES], matrix, alerts };
    });
  }

  /** Liability alerts worked out from the data (closed ones are left out by the caller). */
  private async alerts(
    tx: Tx,
    org: string,
    month: string,
    today: string,
    contractors: { id: string; name: string }[],
    licences: Prisma.ContractorLicenceGetPayload<object>[],
    workers: Deployment[],
    sites: { id: string; state: string; minWageZone: string | null }[],
    proofs: Prisma.ContractorProofGetPayload<object>[],
  ) {
    const people = await tx.person.findMany({ where: { organizationId: org, id: { in: workers.map((w) => w.personId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    const out: { key: string; type: string; contractorId: string; contractor: string; month: string | null; detail: string; liability: number; severity: 'High' | 'Medium' }[] = [];
    for (const k of contractors) {
      const onSite = workers.filter((w) => w.contractorId === k.id && inMonth(w, month));
      const wages = onSite.map((w) => Number(w.wage ?? 0));
      const avg = wages.length ? wages.reduce((a, b) => a + b, 0) / wages.length : 0;
      for (const t of ['pf', 'esi'] as const) {
        const p = proofs.find((x) => x.contractorId === k.id && x.proofType === t);
        if (p?.workersCovered !== null && p?.workersCovered !== undefined && p.workersCovered < onSite.length) {
          const short = onSite.length - p.workersCovered;
          const per = t === 'esi' ? (avg <= ESI_CEILING ? avg * ESI_RATE : 0) : Math.min(avg, PF_CEILING) * PF_RATE;
          out.push({ key: `short:${t}:${k.id}:${month}`, type: t === 'esi' ? 'Short ESI challan' : 'Short PF challan', contractorId: k.id, contractor: k.name, month, detail: `Challan covers ${p.workersCovered} workers; ${onSite.length} were deployed`, liability: Math.round(short * per), severity: 'High' });
        }
      }
      const paid = proofs.find((x) => x.contractorId === k.id && x.proofType === 'wage_payment' && x.status === 'verified');
      if (!paid && onSite.length && today > wageDue(month))
        out.push({ key: `unpaid:${k.id}:${month}`, type: 'Wages not paid by the wage date', contractorId: k.id, contractor: k.name, month, detail: `No verified payment proof by ${dayText(wageDue(month))}`, liability: Math.round(wages.reduce((a, b) => a + b, 0)), severity: 'High' });
      for (const l of licences.filter((x) => x.contractorId === k.id && iso(x.validTo)! < today)) {
        const still = workers.filter((w) => w.licenceId === l.id && w.status !== 'released').length;
        if (still) out.push({ key: `licence:${l.id}`, type: 'Licence expired', contractorId: k.id, contractor: k.name, month: null, detail: `Licence ${l.licenceNo} expired ${dayText(iso(l.validTo)!)}; ${still} ${still === 1 ? 'worker' : 'workers'} still deployed`, liability: 0, severity: 'High' });
      }
      for (const w of onSite) {
        const site = sites.find((s) => s.id === w.locationId);
        if (!site || w.wage === null) continue;
        const min = await this.minWageFor(site, w.skill, `${month}-01`);
        if (min.monthly !== null && Number(w.wage) < Number(min.monthly))
          out.push({ key: `minwage:${w.id}:${month}`, type: 'Wage below minimum', contractorId: k.id, contractor: k.name, month, detail: `${nameOf(people.find((p) => p.id === w.personId))}: ₹${Number(w.wage).toLocaleString('en-IN')} vs ₹${Number(min.monthly).toLocaleString('en-IN')} minimum`, liability: Math.round(Number(min.monthly) - Number(w.wage)), severity: 'Medium' });
      }
    }
    return out;
  }

  /** A proof handed in for a wage month (by HR on the contractor's behalf until contractors have their own login). */
  async addProof(ctx: TenantContext, user: ScopeUser, dto: { contractorId: string; month: string; proofType: ProofType; reference?: string; amount?: string; workersCovered?: number; paidOn?: string; note?: string; notRequired?: boolean }, file?: { name: string; data: Buffer }) {
    const r = await this.need(user, 'clra.worker.manage');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const k = await tx.contractor.findFirst({ where: { organizationId: org, id: dto.contractorId } });
      if (!k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      const month = D(`${dto.month}-01`);
      const old = await tx.contractorProof.findFirst({ where: { organizationId: org, contractorId: k.id, month, proofType: dto.proofType } });
      if (old?.status === 'verified') throw new ConflictException('This proof is verified already.');
      const stored = file ? await this.files().storeIn(tx, c, { area: 'contractor-proofs', name: file.name, data: file.data, allowedMime: ['application/pdf', 'image/jpeg', 'image/png'], maxMb: 10, via: 'staff' }) : null;
      const data = {
        status: dto.notRequired ? 'not_required' : 'submitted',
        reference: dto.reference?.trim() || null,
        amount: dto.amount ? new Prisma.Decimal(dto.amount) : null,
        workersCovered: dto.workersCovered ?? null,
        paidOn: dto.paidOn ? D(dto.paidOn) : null,
        note: dto.note?.trim() || null,
        fileId: stored?.id ?? old?.fileId ?? null,
        submittedBy: c.userId ?? null,
        verifiedBy: null,
        verifiedAt: null,
      };
      const row = old ? await tx.contractorProof.update({ where: { id: old.id }, data }) : await tx.contractorProof.create({ data: { organizationId: org, contractorId: k.id, month, proofType: dto.proofType, ...data } });
      await audit(tx, c, 'clra.proof.submitted', 'contractor_proof', row.id, { contractorId: k.id, month: dto.month, proofType: dto.proofType, status: data.status, file: Boolean(stored) });
      return { id: row.id, fileId: stored?.id ?? null, org };
    });
    if (out.fileId) void this.files().scan(out.org, out.fileId);
    return { id: out.id };
  }

  /** The checks the CLB-03 verification shows, from the proof and the deployments of its month. */
  private async checks(tx: Tx, org: string, p: Prisma.ContractorProofGetPayload<object>) {
    const m = iso(p.month)!.slice(0, 7);
    const k = await tx.contractor.findFirstOrThrow({ where: { organizationId: org, id: p.contractorId } });
    const workers = (await tx.contractDeployment.findMany({ where: { organizationId: org, contractorId: k.id } })).filter((w) => inMonth(w, m));
    const sites = await tx.location.findMany({ where: { organizationId: org, id: { in: workers.map((w) => w.locationId) } }, select: { id: true, state: true, minWageZone: true } });
    const out: { id: string; status: 'pass' | 'fail' | 'warn'; label: string; detail?: string }[] = [{ id: 'period', status: 'pass', label: `For ${monthText(m)} wages` }];
    if (p.proofType === 'pf' || p.proofType === 'esi') {
      const code = p.proofType === 'pf' ? k.pfCode : k.esicCode;
      out.push(code ? { id: 'code', status: 'pass', label: `Employer code on the contractor's record (${code})`, detail: 'Compare it with the code on the challan.' } : { id: 'code', status: 'warn', label: `No ${p.proofType === 'pf' ? 'PF' : 'ESI'} code on the contractor's record`, detail: 'Add it on Contractors.' });
      if (p.workersCovered === null) out.push({ id: 'covered', status: 'warn', label: 'Workers covered not entered' });
      else out.push({ id: 'covered', status: p.workersCovered >= workers.length ? 'pass' : 'fail', label: 'Workers covered ≥ workers deployed', detail: `Covers ${p.workersCovered}; ${workers.length} were deployed in ${monthText(m)}.${p.workersCovered < workers.length ? ` Short by ${workers.length - p.workersCovered}.` : ''}` });
    }
    if (p.proofType === 'wage_register' || p.proofType === 'wage_payment') {
      const below: string[] = [];
      let unknown = 0;
      for (const w of workers) {
        const site = sites.find((s) => s.id === w.locationId);
        const min = site && w.wage !== null ? await this.minWageFor(site, w.skill, `${m}-01`) : { monthly: null };
        if (min.monthly === null) unknown++;
        else if (Number(w.wage) < Number(min.monthly)) below.push(w.id);
      }
      out.push(below.length ? { id: 'minwage', status: 'fail', label: 'Wages at or above minimum wage', detail: `${below.length} ${below.length === 1 ? 'worker is' : 'workers are'} below the minimum.` } : unknown ? { id: 'minwage', status: 'warn', label: 'Wages at or above minimum wage', detail: `No minimum wage on record for ${unknown} ${unknown === 1 ? 'worker' : 'workers'}.` } : { id: 'minwage', status: 'pass', label: 'Wages at or above minimum wage' });
    }
    if (p.proofType === 'wage_payment') {
      if (!p.paidOn) out.push({ id: 'paid', status: 'warn', label: 'Date of payment not entered' });
      else out.push({ id: 'paid', status: iso(p.paidOn)! <= wageDue(m) ? 'pass' : 'warn', label: `Paid by the wage date (${dayText(wageDue(m))})`, detail: `Paid on ${dayText(iso(p.paidOn)!)}` });
    }
    return { contractor: k.name, month: m, checks: out };
  }

  async proof(ctx: TenantContext, user: ScopeUser, id: string) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await tx.contractorProof.findFirst({ where: { organizationId: c.organizationId, id } });
      const k = p ? await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id: p.contractorId } }) : null;
      if (!p || !k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      const names = await this.userNames(tx, c.organizationId, [p.submittedBy, p.verifiedBy]);
      const ch = await this.checks(tx, c.organizationId, p);
      return { id: p.id, contractorId: k.id, contractor: k.name, month: ch.month, proofType: p.proofType, status: p.status, reference: p.reference, amount: p.amount?.toFixed(2) ?? null, workersCovered: p.workersCovered, paidOn: iso(p.paidOn), note: p.note, hasFile: Boolean(p.fileId), submittedBy: names.get(p.submittedBy ?? '') ?? null, submittedOn: iso(p.createdAt), mine: p.submittedBy === c.userId, checks: ch.checks };
    });
  }

  /** Verified (when no check fails) or a discrepancy raised, by someone other than who handed it in. */
  async decideProof(ctx: TenantContext, user: ScopeUser, id: string, decision: 'verified' | 'discrepancy', note?: string) {
    const r = await this.need(user, 'clra.compliance.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const p = await tx.contractorProof.findFirst({ where: { organizationId: c.organizationId, id } });
      const k = p ? await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id: p.contractorId } }) : null;
      if (!p || !k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      if (p.submittedBy && p.submittedBy === c.userId) throw new ForbiddenException('You handed in this proof, so someone else must verify it.');
      if (p.status !== 'submitted' && p.status !== 'discrepancy') throw new ConflictException(`This proof is ${p.status.replace('_', ' ')}.`);
      if (decision === 'verified') {
        const failed = (await this.checks(tx, c.organizationId, p)).checks.filter((x) => x.status === 'fail');
        if (failed.length) throw new ConflictException({ statusCode: 409, code: 'CHECKS_FAILED', message: `It cannot be verified: ${failed.map((f) => f.detail ?? f.label).join(' ')}` });
      } else if (!note?.trim()) throw new BadRequestException('Say what is wrong with the proof.');
      await tx.contractorProof.update({ where: { id }, data: { status: decision, verifiedBy: c.userId ?? null, verifiedAt: new Date(), ...(note?.trim() ? { note: note.trim() } : {}) } });
      await audit(tx, c, decision === 'verified' ? 'clra.proof.verified' : 'clra.proof.discrepancy', 'contractor_proof', id, { note: note ?? null });
      return { id, status: decision };
    });
  }

  /** A held bill released for the month with a reason (the alerts stay open). */
  async releaseBill(ctx: TenantContext, user: ScopeUser, dto: { contractorId: string; month: string; reason: string }) {
    const r = await this.need(user, 'clra.compliance.manage');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await tx.contractor.findFirst({ where: { organizationId: c.organizationId, id: dto.contractorId } });
      if (!k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      const month = D(`${dto.month}-01`);
      if (await tx.contractorBillRelease.findFirst({ where: { organizationId: c.organizationId, contractorId: k.id, month } })) throw new ConflictException('This bill is already released.');
      const row = await tx.contractorBillRelease.create({ data: { organizationId: c.organizationId, contractorId: k.id, month, reason: dto.reason.trim(), releasedBy: c.userId! } });
      await audit(tx, c, 'clra.bill.released', 'contractor', k.id, { month: dto.month, reason: dto.reason.trim() });
      return { id: row.id };
    });
  }

  async resolveAlert(ctx: TenantContext, user: ScopeUser, key: string, note: string) {
    const r = await this.need(user, 'clra.compliance.manage');
    const contractorId = /^(?:short:(?:pf|esi)|unpaid):([0-9a-f-]{36}):/.exec(key)?.[1];
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      // The alert's contractor must be in reach (licence and wage alerts name their licence or worker).
      const licenceId = /^licence:([0-9a-f-]{36})$/.exec(key)?.[1];
      const workerId = /^minwage:([0-9a-f-]{36}):/.exec(key)?.[1];
      const kid = contractorId ?? (licenceId ? (await tx.contractorLicence.findFirst({ where: { organizationId: org, id: licenceId } }))?.contractorId : workerId ? (await tx.contractDeployment.findFirst({ where: { organizationId: org, id: workerId } }))?.contractorId : undefined);
      const k = kid ? await tx.contractor.findFirst({ where: { organizationId: org, id: kid } }) : null;
      if (!k || !reaches(r, k.legalEntityId)) throw new NotFoundException('Not found');
      if (await tx.contractorAlertNote.findFirst({ where: { organizationId: org, alertKey: key } })) throw new ConflictException('This alert is already closed.');
      await tx.contractorAlertNote.create({ data: { organizationId: org, alertKey: key, note: note.trim(), resolvedBy: c.userId! } });
      await audit(tx, c, 'clra.alert.resolved', 'contractor', k.id, { alert: key, note: note.trim() });
      return { key };
    });
  }

  // ------------------------------------------------------------------------------------------ registers and returns (CLB-04)

  /** The registers of each establishment (a site with contractors) for a month: generated, or what they still need. */
  async registers(ctx: TenantContext, user: ScopeUser, month: string, legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { contractors, licences, workers, sites } = await this.scope(tx, c.organizationId, r, legalEntityId);
      const establishments = sites.filter((s) => licences.some((l) => l.locationId === s.id) && (r.all || r.entities.includes(s.legalEntityId) || r.locations.includes(s.id)));
      const out: { id: string; kind: string; name: string; siteId: string; site: string; contractorId: string | null; period: string; format: string; status: 'ready' | 'no_data'; rows: number; why: string | null }[] = [];
      for (const s of establishments) {
        const here = licences.filter((l) => l.locationId === s.id);
        const ks = contractors.filter((k) => here.some((l) => l.contractorId === k.id));
        out.push({ id: `contractors:${s.id}`, kind: 'contractors', name: 'Register of contractors', siteId: s.id, site: s.name, contractorId: null, period: month, format: REGISTER_FORMS.contractors, status: 'ready', rows: ks.length, why: null });
        for (const k of ks) {
          const n = workers.filter((w) => w.contractorId === k.id && w.locationId === s.id && inMonth(w, month)).length;
          out.push({ id: `workmen:${s.id}:${k.id}`, kind: 'workmen', name: `Register of workmen, ${k.name}`, siteId: s.id, site: s.name, contractorId: k.id, period: month, format: REGISTER_FORMS.workmen, status: n ? 'ready' : 'no_data', rows: n, why: n ? null : 'No workers deployed in the month.' });
        }
        // Registers whose data the product does not hold yet: said, never made up.
        out.push({ id: `muster:${s.id}`, kind: 'muster', name: 'Muster roll', siteId: s.id, site: s.name, contractorId: null, period: month, format: REGISTER_FORMS.muster, status: 'no_data', rows: 0, why: 'Needs daily attendance of contract workers (gate or kiosk punches), which is not recorded yet.' });
        out.push({ id: `wages:${s.id}`, kind: 'wages', name: 'Register of wages', siteId: s.id, site: s.name, contractorId: null, period: month, format: REGISTER_FORMS.wages, status: 'no_data', rows: 0, why: "Needs each worker's wage lines from the contractors, which are not uploaded yet." });
        out.push({ id: `deductions:${s.id}`, kind: 'deductions', name: 'Register of deductions, fines and advances', siteId: s.id, site: s.name, contractorId: null, period: month, format: REGISTER_FORMS.deductions, status: 'no_data', rows: 0, why: 'Needs deductions from the contractors, which are not uploaded yet.' });
        out.push({ id: `overtime:${s.id}`, kind: 'overtime', name: 'Register of overtime', siteId: s.id, site: s.name, contractorId: null, period: month, format: REGISTER_FORMS.overtime, status: 'no_data', rows: 0, why: 'Needs overtime hours of contract workers, which are not recorded yet.' });
      }
      // Contract workers on site each month (last six), per establishment, for the chart.
      const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 6 + i, 1)).toISOString().slice(0, 7));
      const onSite = establishments.map((s) => ({ siteId: s.id, site: s.name, values: months.map((m) => workers.filter((w) => w.locationId === s.id && onDay(w, monthEnd(m) < todayIst() ? monthEnd(m) : todayIst())).length) }));
      return { month, registers: out, chart: { months, sites: onSite }, establishments: establishments.map((s) => ({ id: s.id, name: s.name })) };
    });
  }

  /** One register as an Excel file (only the ones with data), recorded. */
  async registerFile(ctx: TenantContext, user: ScopeUser, kind: string, siteId: string, contractorId: string | null, month: string) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const built = await this.registerSheet(tx, c.organizationId, r, kind, siteId, contractorId, month);
      await audit(tx, c, 'clra.register.downloaded', 'location', siteId, { kind, contractorId, month });
      return { file: await sheetFile('xlsx', built.title.slice(0, 31), built.head, built.rows, built.title), name: `${kind}-${month}.xlsx` };
    });
  }

  private async registerSheet(tx: Tx, org: string, r: Reach, kind: string, siteId: string, contractorId: string | null, month: string) {
    const { contractors, licences, workers, sites } = await this.scope(tx, org, r, null);
    const site = sites.find((s) => s.id === siteId);
    if (!site || !licences.some((l) => l.locationId === site.id) || !(r.all || r.entities.includes(site.legalEntityId) || r.locations.includes(site.id))) throw new NotFoundException('Not found');
    if (kind === 'contractors') {
      const here = licences.filter((l) => l.locationId === site.id);
      return {
        title: `Register of contractors · ${site.name} · ${monthText(month)}`,
        head: ['Sl', 'Contractor', 'PAN', 'Nature of work', 'Licence', 'Valid from', 'Valid to', 'Maximum workers', `Deployed in ${monthText(month)}`],
        rows: here.map((l, i) => {
          const k = contractors.find((x) => x.id === l.contractorId)!;
          return [String(i + 1), k.name, k.pan ?? '', k.work, l.licenceNo, iso(l.validFrom)!, iso(l.validTo)!, String(l.maxWorkers), String(workers.filter((w) => w.licenceId === l.id && inMonth(w, month)).length)];
        }),
      };
    }
    if (kind === 'workmen' && contractorId) {
      const k = contractors.find((x) => x.id === contractorId);
      if (!k) throw new NotFoundException('Not found');
      const list = workers.filter((w) => w.contractorId === k.id && w.locationId === site.id && inMonth(w, month));
      if (!list.length) throw new ConflictException('No workers deployed in the month, so the register is empty.');
      const people = await tx.person.findMany({ where: { organizationId: org, id: { in: list.map((w) => w.personId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      return {
        title: `Register of workmen · ${k.name} · ${site.name} · ${monthText(month)}`,
        head: ['Sl', 'Name', 'Date of birth', 'Nature of employment', 'Skill', 'Date of commencement', 'Date of termination', 'Gate pass', 'UAN', 'ESI IP'],
        rows: list.map((w, i) => [String(i + 1), nameOf(people.find((p) => p.id === w.personId)), iso(w.dateOfBirth)!, w.work, w.skill.replace(/_/g, '-'), iso(w.fromOn)!, iso(w.toOn) ?? '', w.gatePass ?? '', w.uanLast4 ? `XXXXXXXX${w.uanLast4}` : '', w.esicLast4 ? `XXXXXX${w.esicLast4}` : '']),
      };
    }
    throw new ConflictException('This register needs data that is not recorded yet.');
  }

  /** Every register with data for a site and month in one zip (the inspection pack), recorded. */
  async inspectionPack(ctx: TenantContext, user: ScopeUser, siteId: string, month: string) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { contractors, licences, workers } = await this.scope(tx, c.organizationId, r, null);
      const zip = new JSZip();
      const add = async (kind: string, contractorId: string | null, name: string) => {
        const b = await this.registerSheet(tx, c.organizationId, r, kind, siteId, contractorId, month);
        zip.file(name, await sheetFile('xlsx', b.title.slice(0, 31), b.head, b.rows, b.title));
      };
      await add('contractors', null, `register-of-contractors-${month}.xlsx`);
      for (const k of contractors.filter((x) => licences.some((l) => l.contractorId === x.id && l.locationId === siteId)))
        if (workers.some((w) => w.contractorId === k.id && w.locationId === siteId && inMonth(w, month))) await add('workmen', k.id, `register-of-workmen-${k.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${month}.xlsx`);
      zip.file('README.txt', 'Generated by YukthiX from contractor, licence and deployment records.\r\nNot included because the data is not recorded yet: muster roll, register of wages, register of deductions, register of overtime.\r\n');
      await audit(tx, c, 'clra.inspection_pack.downloaded', 'location', siteId, { month });
      return { file: Buffer.from(await zip.generateAsync({ type: 'uint8array' })), name: `inspection-pack-${month}.zip` };
    });
  }

  /** The annual return of each establishment (principal employer) for a calendar year, drafted from the year's records. */
  async returns(ctx: TenantContext, user: ScopeUser, year: number, legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { contractors, licences, workers, sites } = await this.scope(tx, c.organizationId, r, legalEntityId);
      const establishments = sites.filter((s) => licences.some((l) => l.locationId === s.id) && (r.all || r.entities.includes(s.legalEntityId) || r.locations.includes(s.id)));
      return establishments.map((s) => ({ siteId: s.id, site: s.name, year, ...this.yearFacts(workers.filter((w) => w.locationId === s.id), contractors, year), dueOn: `${year + 1}-02-15` }));
    });
  }

  private yearFacts(workers: Deployment[], contractors: { id: string }[], year: number) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31` < todayIst() ? `${year}-12-31` : todayIst();
    const inYear = workers.filter((w) => w.status !== 'pending' && iso(w.fromOn)! <= to && (!w.toOn || iso(w.toOn)! >= from));
    let max = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) max = Math.max(max, inYear.filter((w) => onDay(w, d)).length);
    const deployedDays = inYear.reduce((n, w) => {
      const a = iso(w.fromOn)! > from ? iso(w.fromOn)! : from;
      const b = w.toOn && iso(w.toOn)! < to ? iso(w.toOn)! : to;
      return n + (b >= a ? days(a, b) : 0);
    }, 0);
    return { contractors: new Set(inYear.map((w) => w.contractorId).filter((id) => contractors.some((k) => k.id === id))).size, workers: inYear.length, maxOnAnyDay: max, deployedDays, daysWorked: null as number | null };
  }

  async returnFile(ctx: TenantContext, user: ScopeUser, siteId: string, year: number) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { contractors, licences, workers, sites } = await this.scope(tx, c.organizationId, r, null);
      const site = sites.find((s) => s.id === siteId);
      if (!site || !licences.some((l) => l.locationId === siteId) || !(r.all || r.entities.includes(site.legalEntityId) || r.locations.includes(site.id))) throw new NotFoundException('Not found');
      const here = workers.filter((w) => w.locationId === siteId);
      const f = this.yearFacts(here, contractors, year);
      const head = ['Item', 'Value'];
      const rows = [
        ['Establishment', site.name],
        ['Year', String(year)],
        ['Contractors engaged', String(f.contractors)],
        ['Contract workers deployed', String(f.workers)],
        ['Most contract workers on any day', String(f.maxOnAnyDay)],
        ['Days deployed (all workers)', String(f.deployedDays)],
        ['Days worked', 'Not recorded yet: needs daily attendance of contract workers'],
        ['Due', `15 Feb ${year + 1}`],
        ...contractors
          .filter((k) => here.some((w) => w.contractorId === k.id))
          .map((k) => [`Contractor: ${k.name}`, `${licences.filter((l) => l.contractorId === k.id && l.locationId === siteId).map((l) => l.licenceNo).join(', ')} · ${here.filter((w) => w.contractorId === k.id).length} workers`]),
      ];
      await audit(tx, c, 'clra.return.downloaded', 'location', siteId, { year });
      return { file: await sheetFile('xlsx', `Annual return ${year}`, head, rows, `Annual return ${year} · ${site.name} (principal employer) · draft`), name: `annual-return-${year}.xlsx` };
    });
  }

  // ------------------------------------------------------------------------------------------ reports

  /** Contract labour reports (designed 21 Oct 2026): headcount, licence use, movements and compliance by contractor. */
  async reports(ctx: TenantContext, user: ScopeUser, month: string, legalEntityId: string | null) {
    const r = await this.need(user, 'clra.worker.view');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const { contractors, licences, workers, sites } = await this.scope(tx, c.organizationId, r, legalEntityId);
      const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 6 + i, 1)).toISOString().slice(0, 7));
      const lastDay = (m: string) => (monthEnd(m) < today ? monthEnd(m) : today);
      const proofs = await tx.contractorProof.findMany({ where: { organizationId: c.organizationId, contractorId: { in: contractors.map((k) => k.id) }, month: D(`${month}-01`) } });
      return {
        month,
        months,
        headcount: contractors.map((k) => ({ contractorId: k.id, contractor: k.name, values: months.map((m) => workers.filter((w) => w.contractorId === k.id && onDay(w, lastDay(m))).length) })),
        movements: months.map((m) => ({ month: m, deployed: workers.filter((w) => w.status !== 'pending' && iso(w.fromOn)!.startsWith(m)).length, released: workers.filter((w) => w.toOn && iso(w.toOn)!.startsWith(m)).length })),
        licences: licences.map((l) => ({ id: l.id, licenceNo: l.licenceNo, contractor: contractors.find((k) => k.id === l.contractorId)?.name ?? '', site: sites.find((s) => s.id === l.locationId)?.name ?? '', maxWorkers: l.maxWorkers, active: workers.filter((w) => w.licenceId === l.id && w.status !== 'released').length, validTo: iso(l.validTo)! })),
        compliance: contractors.map((k) => ({ contractorId: k.id, contractor: k.name, verified: proofs.filter((p) => p.contractorId === k.id && (p.status === 'verified' || p.status === 'not_required')).length, submitted: proofs.filter((p) => p.contractorId === k.id && p.status === 'submitted').length, discrepancy: proofs.filter((p) => p.contractorId === k.id && p.status === 'discrepancy').length, missing: PROOF_TYPES.length - proofs.filter((p) => p.contractorId === k.id).length })),
      };
    });
  }

  private async userNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(rows.map((u) => [u.id, u.name || u.email]));
  }
}

/** A sheet as CSV (every cell quoted, formulas neutralised) or Excel (text cells). */
async function sheetFile(format: 'csv' | 'xlsx', sheet: string, head: string[], rows: string[][], title?: string): Promise<Buffer> {
  if (format === 'csv') {
    const esc = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d[\d .]*$/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    return Buffer.from([head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'), 'utf8');
  }
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet(sheet.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  if (title) {
    ws.addRow([title]).font = { bold: true };
    ws.addRow([]);
  }
  ws.addRow(head).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await book.xlsx.writeBuffer());
}
