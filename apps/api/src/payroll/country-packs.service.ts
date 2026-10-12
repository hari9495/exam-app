import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { eosg, f1099Due, inForce, type RuleSet } from '../statutory/evaluator';
import { asDate, dateOf, monthRange } from '../time/time-core';
import type { W9Dto, WpsIdsDto } from './dto-5i';
import { ExchangeFilesService } from './exchange-files.service';
import { entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { serviceYearsBetween } from './special';

// Batch 5i, PAY-9.10 … 9.12 country packs (M03 YX-PAY-43 … 45, C4). A legal entity outside India is paid only once its
// country's P07 pack is switched on: the pack's manifest (rule data) names the rule sets it needs in force and the set-up
// it needs, and the switch keeps what was checked. The UAE pack makes the run's WPS salary file (SIF) from the approved
// payslips and the monthly end-of-service gratuity provision; the US pack keeps contractors' W-9 (TIN sealed) and makes
// the year's 1099-NEC data and recipient copies. Every figure and layout is pack data (verify), never a code branch.
// DECISION NEEDED: e-filing 1099-NEC (IRS IRIS) and WPS upload to the agent are by the payroll team for now; the UAE
// gratuity is computed here for the F&F to pay as an item.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
interface Manifest {
  country: string;
  currency: string;
  requires: string[];
  settings: { key: string; label: string; pattern: string }[];
}

@Injectable()
export class CountryPackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rules: StatutoryRulesService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly exchange: ExchangeFilesService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private async entity(tx: Tx, c: CompanyContext, v: Viewer, entityId: string, key: 'payroll.setup.manage' | 'payroll.file.view' | 'consultant.manage' | 'payroll.special.manage' = 'payroll.setup.manage') {
    await requireEntity(tx, c, v, key, entityId);
    await payScope(tx, [entityId]);
    return tx.legalEntity.findFirstOrThrow({ where: { organizationId: c.organizationId, id: entityId } });
  }

  /** What the pack needs and what is missing, on a day. */
  private check(sets: RuleSet[], country: string, on: string, settings: Record<string, string>) {
    const manifest = inForce(sets, `${country}.PAYROLL`, [country], on);
    if (!manifest) return { manifest: null, missing: [`No ${country} country pack is published.`] };
    const m = manifest.values as unknown as Manifest;
    const missing = [
      ...m.requires.filter((s) => !inForce(sets, s, [country], on)).map((s) => `The ${s} rules are not in force on ${on}.`),
      ...m.settings.filter((x) => !new RegExp(x.pattern).test(settings[x.key] ?? '')).map((x) => `${x.label} is missing or not valid.`),
    ];
    return { manifest: { version: manifest.version, ...m }, missing };
  }

  async status(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.entity(tx, c, v, entityId);
      const on = await tx.entityCountryPack.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId } });
      if (e.country === 'IN') return { country: 'IN', needed: false, switchedOn: true, manifest: null, missing: [], settings: {} };
      const settings = (on?.settings ?? {}) as Record<string, string>;
      const x = this.check(await this.rules.published(), e.country, todayIst(), settings);
      return { country: e.country, needed: true, switchedOn: Boolean(on), switchedOnAt: on?.switchedOnAt ?? null, manifest: x.manifest, missing: x.missing, settings };
    });
  }

  /** Switched on only when every rule set the pack needs is in force and its set-up is complete (kept with the switch). */
  async switchOn(ctx: TenantContext, user: ScopeUser, entityId: string, settings: Record<string, string>) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.entity(tx, c, v, entityId);
      if (e.country === 'IN') throw new BadRequestException('Indian legal entities use the India rules; there is nothing to switch on.');
      const clean = Object.fromEntries(Object.entries(settings ?? {}).filter(([k, val]) => /^[a-zA-Z]{1,40}$/.test(k) && typeof val === 'string' && val.length <= 60));
      const x = this.check(await this.rules.published(), e.country, todayIst(), clean);
      if (!x.manifest || x.missing.length) throw new ConflictException({ statusCode: 409, message: 'The country pack is not complete yet.', problems: x.missing });
      const checked = { pack: x.manifest.version, requires: x.manifest.requires, on: todayIst() } as unknown as Prisma.InputJsonValue;
      const row = await tx.entityCountryPack.upsert({
        where: { organizationId_legalEntityId: { organizationId: c.organizationId, legalEntityId: entityId } },
        create: { organizationId: c.organizationId, legalEntityId: entityId, country: e.country, settings: clean, checked, switchedOnBy: v.userId! },
        update: { settings: clean, checked, switchedOnBy: v.userId!, switchedOnAt: new Date() },
      });
      await audit(tx, c, 'payroll.country_pack.switched_on', 'legal_entity', entityId, { country: e.country, pack: x.manifest.version, settings: Object.keys(clean) });
      return { id: row.id, country: e.country, pack: x.manifest.version };
    });
  }

  // ------------------------------------------------------------------------------------------ UAE: WPS and gratuity

  async setWpsIds(ctx: TenantContext, user: ScopeUser, entityId: string, dto: WpsIdsDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entity(tx, c, v, entityId);
      if (e.country !== 'AE') throw new BadRequestException('WPS ids are for UAE legal entities.');
      const em = await tx.employment.findFirst({ where: { organizationId: org, legalEntityId: entityId, employeeId: dto.employeeId } });
      if (!em) throw new NotFoundException('Not found');
      const sealed = { personId: dto.personId, routingCode: dto.routingCode, ibanEnc: this.crypto.encrypt(`${org}:${dto.employeeId}:${dto.iban}`), ibanLast4: dto.iban.slice(-4), updatedBy: v.userId!, updatedAt: new Date() };
      await tx.wpsEmployeeId.upsert({ where: { organizationId_legalEntityId_employeeId: { organizationId: org, legalEntityId: entityId, employeeId: dto.employeeId } }, create: { organizationId: org, legalEntityId: entityId, employeeId: dto.employeeId, ...sealed }, update: sealed });
      await audit(tx, c, 'payroll.wps.ids_saved', 'employee', dto.employeeId, { routingCode: dto.routingCode, ibanLast4: sealed.ibanLast4 });
      return { saved: true };
    });
  }

  private open(org: string, employeeId: string, blob: string) {
    const plain = this.crypto.decrypt(blob);
    const prefix = `${org}:${employeeId}:`;
    if (!plain.startsWith(prefix)) throw new ConflictException('A stored IBAN does not belong to its employee.');
    return plain.slice(prefix.length);
  }

  /**
   * The WPS salary file of an approved run (UAE): an EDR record per paid employee and the employer's SCR record, in the
   * pack's layout. Fixed pay is the net less the month's one-time earnings (variable); leave days are the unpaid days.
   */
  async wpsFile(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'payroll.bankfile.generate');
      await payScope(tx, ids);
      const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: runId } });
      if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
      if (!['approved', 'paid'].includes(run.status)) throw new ConflictException('The WPS file is made once the payroll is approved.');
      const pack = await tx.entityCountryPack.findFirst({ where: { organizationId: org, legalEntityId: run.legalEntityId, country: 'AE' } });
      if (!pack) throw new ConflictException('Switch on the UAE country pack for this legal entity first.');
      const month = dateOf(run.periodStart).slice(0, 7);
      const rs = inForce(await this.rules.published(), 'AE.WPS', ['AE'], monthRange(month).to);
      if (!rs) throw new ConflictException(`No published WPS file layout is in force for ${month}.`);
      const layout = rs.values as unknown as { edr: string[]; scr: string[]; currency: string };
      const slips = await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'approved', net: { gt: 0 } } });
      const wps = await tx.wpsEmployeeId.findMany({ where: { organizationId: org, legalEntityId: run.legalEntityId, employeeId: { in: slips.map((s) => s.employeeId) } } });
      const missing = slips.filter((s) => !wps.some((w) => w.employeeId === s.employeeId));
      if (missing.length) throw new ConflictException({ statusCode: 409, message: 'Some people have no WPS person id, routing code or IBAN.', problems: missing.map((s) => s.employeeId) });
      const oneTime = await tx.payslipLine.findMany({ where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, kind: 'earning', sourceRef: { not: null } } });
      const snaps = await tx.payslipSnapshot.findMany({ where: { payslipId: { in: slips.map((s) => s.id) } }, select: { payslipId: true, inputs: true } });
      const settings = pack.settings as Record<string, string>;
      const from = dateOf(run.rangeStart ?? run.periodStart);
      const to = dateOf(run.periodEnd);
      const record = (fields: string[], val: Record<string, string>) => fields.map((f) => (f === fields[0] && /^[A-Z]{3}$/.test(f) ? f : (val[f] ?? ''))).join(',');
      const lines: string[] = [];
      let total = D(0);
      for (const s of slips) {
        const w = wps.find((x) => x.employeeId === s.employeeId)!;
        const variable = oneTime.filter((l) => l.payslipId === s.id && l.componentCode !== 'basic').reduce((t, l) => t.add(l.amount), D(0));
        const fixed = Prisma.Decimal.max(D(0), s.net.sub(variable));
        const lop = (snaps.find((x) => x.payslipId === s.id)?.inputs as { attendance?: { lopDays?: string } } | undefined)?.attendance?.lopDays ?? '0';
        total = total.add(fixed).add(Prisma.Decimal.min(variable, s.net));
        lines.push(record(layout.edr, { personId: w.personId, routingCode: w.routingCode, iban: this.open(org, s.employeeId, w.ibanEnc), payStart: from, payEnd: to, days: String(Number(to.slice(8)) - Number(from.slice(8)) + 1), fixed: fixed.toFixed(2), variable: Prisma.Decimal.min(variable, s.net).toFixed(2), leaveDays: String(Number(lop)) }));
      }
      const now = new Date();
      lines.push(record(layout.scr, { establishmentId: settings.establishmentId, routingCode: settings.agentRoutingCode, fileDate: todayIst(), fileTime: `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`, salaryMonth: `${month.slice(5)}${month.slice(0, 4)}`, records: String(slips.length), total: total.toFixed(2), currency: layout.currency, reference: run.id.slice(0, 8) }));
      const data = Buffer.from(lines.join('\r\n') + '\r\n');
      const f = await this.exchange.generateIn(tx, c, { legalEntityId: run.legalEntityId, kind: 'wps', ownerType: 'payroll_run', ownerId: run.id, periodStart: `${month}-01`, fileName: `${settings.establishmentId}-${month.replace('-', '')}.sif`, contentType: 'text/plain', data, rows: slips.length, totals: { net: total.toFixed(2) }, by: v.userId! });
      const row = await tx.wpsFile.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, runId: run.id, formatVersion: rs.version, exchangeFileId: f.id, rows: slips.length, total, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.wps.generated', 'wps_file', row.id, { runId: run.id, rows: slips.length, total: total.toFixed(2), sha256: f.sha256, format: rs.version });
      return { id: row.id, fileId: f.id, rows: slips.length, total: total.toFixed(2), sha256: f.sha256 };
    });
  }

  /** Basic monthly pay in force on a day (end-of-service gratuity is on basic). */
  private async basic(tx: Tx, org: string, employmentId: string, on: Date) {
    const comp = await tx.compensation.findFirst({ where: { organizationId: org, employmentId, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] }, orderBy: { validFrom: 'desc' } });
    const pkg = comp ? await tx.compensationPackage.findFirst({ where: { organizationId: org, changeId: comp.changeId } }) : null;
    const code = await tx.payComponent.findFirst({ where: { organizationId: org, code: 'basic' }, select: { id: true } });
    const line = pkg && code ? await tx.compensationLine.findFirst({ where: { organizationId: org, packageId: pkg.id, componentId: code.id } }) : null;
    return line?.monthly ?? D(0);
  }

  /** The month's end-of-service provision for a UAE entity: the gratuity accrued at the month's end less last month's. */
  async provisionEosb(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entity(tx, c, v, entityId, 'payroll.special.manage');
      if (e.country !== 'AE' || !(await tx.entityCountryPack.findFirst({ where: { organizationId: org, legalEntityId: entityId } }))) throw new ConflictException('Switch on the UAE country pack for this legal entity first.');
      const { to } = monthRange(month);
      const rs = inForce(await this.rules.published(), 'AE.EOSG', ['AE'], to);
      if (!rs) throw new ConflictException(`No published gratuity rule is in force on ${to}.`);
      const ems = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: entityId, joinedOn: { lte: asDate(to) }, OR: [{ exitedOn: null }, { exitedOn: { gte: asDate(to) } }] } });
      const prevMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
      const out = [];
      for (const em of ems) {
        const basic = await this.basic(tx, org, em.id, asDate(to));
        const years = serviceYearsBetween(dateOf(em.joinedOn), to);
        const accrued = eosg(rs, { basicMonthly: basic, years }).amount;
        const before = await tx.eosbProvision.findFirst({ where: { organizationId: org, employmentId: em.id, month: prevMonth } });
        const monthly = accrued.sub(before?.accrued ?? 0);
        const data = { basicMonthly: basic, serviceYears: D(years), accrued, monthly, ruleVersion: rs.version };
        await tx.eosbProvision.upsert({ where: { organizationId_employmentId_month: { organizationId: org, employmentId: em.id, month: asDate(`${month}-01`) } }, create: { organizationId: org, legalEntityId: entityId, employeeId: em.employeeId, employmentId: em.id, month: asDate(`${month}-01`), ...data }, update: data });
        out.push({ employeeId: em.employeeId, years, accrued: accrued.toFixed(2), monthly: monthly.toFixed(2) });
      }
      await audit(tx, c, 'payroll.eosb.provisioned', 'legal_entity', entityId, { month, people: out.length, total: out.reduce((t, x) => t.add(x.monthly), D(0)).toFixed(2) });
      return { month, rule: rs.version, rows: out, total: out.reduce((t, x) => t.add(x.monthly), D(0)).toFixed(2) };
    });
  }

  // ------------------------------------------------------------------------------------------ US: W-9 and 1099-NEC

  async saveW9(ctx: TenantContext, user: ScopeUser, dto: W9Dto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ids = await entitiesFor(tx, c, v, 'consultant.manage');
      await payScope(tx, ids);
      const k = await tx.consultant.findFirst({ where: { organizationId: org, id: dto.consultantId } });
      if (!k || !ids.includes(k.legalEntityId)) throw new NotFoundException('Not found');
      const e = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: k.legalEntityId } });
      if (e.country !== 'US') throw new BadRequestException('A W-9 is for contractors of a US legal entity.');
      const data = { tinKind: dto.tinKind, tinEnc: this.crypto.encrypt(`${org}:${k.id}:${dto.tin}`), tinHash: this.crypto.hmac('contractor.tin', `${org}:${dto.tin}`), tinLast4: dto.tin.slice(-4), legalName: dto.legalName, address: { street: dto.street, city: dto.city, state: dto.state, zip: dto.zip }, receivedOn: asDate(dto.receivedOn), updatedBy: v.userId!, updatedAt: new Date() };
      await tx.contractorTaxForm.upsert({ where: { organizationId_consultantId: { organizationId: org, consultantId: k.id } }, create: { organizationId: org, legalEntityId: k.legalEntityId, consultantId: k.id, ...data }, update: data });
      await audit(tx, c, 'payroll.w9.saved', 'consultant', k.id, { tinKind: dto.tinKind, last4: data.tinLast4 });
      return { saved: true, tin: `•••••${data.tinLast4}` };
    });
  }

  /** The year's payments per contractor (paid invoices by paid date) against the pack's threshold. */
  private async necRows(tx: Tx, org: string, entityId: string, year: number) {
    const rs = inForce(await this.rules.published(), 'US.1099', ['US'], `${year}-12-31`);
    if (!rs) throw new ConflictException(`No published 1099 rule is in force for ${year}.`);
    const paid = await tx.consultantInvoice.groupBy({ by: ['consultantId'], where: { organizationId: org, legalEntityId: entityId, status: 'paid', paidOn: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-31`) } }, _sum: { netPayable: true } });
    const forms = await tx.contractorTaxForm.findMany({ where: { organizationId: org, consultantId: { in: paid.map((p) => p.consultantId) } } });
    const ks = await tx.consultant.findMany({ where: { organizationId: org, id: { in: paid.map((p) => p.consultantId) } }, select: { id: true, name: true } });
    return {
      rs,
      rows: paid
        .map((p) => ({ consultantId: p.consultantId, name: ks.find((k) => k.id === p.consultantId)?.name ?? '', paid: (p._sum.netPayable ?? D(0)).toFixed(2), form: forms.find((f) => f.consultantId === p.consultantId) ?? null }))
        .map((r) => ({ ...r, due: f1099Due(rs, { paid: r.paid }).due })),
    };
  }

  async necSummary(ctx: TenantContext, user: ScopeUser, entityId: string, year: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.entity(tx, c, v, entityId, 'consultant.manage');
      const x = await this.necRows(tx, c.organizationId, entityId, year);
      return { year, threshold: String(x.rs.values.threshold), rule: x.rs.version, rows: x.rows.map(({ form, ...r }) => ({ ...r, w9: Boolean(form), tin: form ? `•••••${form.tinLast4}` : null })) };
    });
  }

  /** The 1099-NEC data file (box 1: nonemployee compensation) for contractors at or above the threshold; TINs only in the file. */
  async necFile(ctx: TenantContext, user: ScopeUser, entityId: string, year: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await this.entity(tx, c, v, entityId, 'consultant.manage');
      const pack = await tx.entityCountryPack.findFirst({ where: { organizationId: org, legalEntityId: entityId, country: 'US' } });
      if (!pack) throw new ConflictException('Switch on the US country pack for this legal entity first.');
      const x = await this.necRows(tx, org, entityId, year);
      const due = x.rows.filter((r) => r.due);
      const noW9 = due.filter((r) => !r.form);
      if (noW9.length) throw new ConflictException({ statusCode: 409, message: 'Get a W-9 from these contractors first.', problems: noW9.map((r) => r.name) });
      if (!due.length) throw new ConflictException(`No contractor was paid $${String(x.rs.values.threshold)} or more in ${year}.`);
      const ein = (pack.settings as Record<string, string>).ein;
      const rows = [['tax_year', 'payer_ein', 'payer_name', 'recipient_tin_type', 'recipient_tin', 'recipient_name', 'street', 'city', 'state', 'zip', 'box1_nonemployee_compensation'].join(',')];
      const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
      for (const r of due) {
        const a = r.form!.address as { street: string; city: string; state: string; zip: string };
        const tin = this.crypto.decrypt(r.form!.tinEnc).split(':').pop()!;
        rows.push([year, ein, q(e.name), r.form!.tinKind, tin, q(r.form!.legalName), q(a.street), q(a.city), a.state, a.zip, r.paid].join(','));
      }
      const data = Buffer.from(rows.join('\r\n') + '\r\n');
      const f = await this.exchange.generateIn(tx, c, { legalEntityId: entityId, kind: 'f1099nec', ownerType: 'legal_entity', ownerId: entityId, periodStart: null, fileName: `1099-nec-${year}.csv`, contentType: 'text/csv', data, rows: due.length, totals: { paid: due.reduce((t, r) => t.add(r.paid), D(0)).toFixed(2) }, by: v.userId! });
      await audit(tx, c, 'payroll.1099.generated', 'legal_entity', entityId, { year, rows: due.length, fileId: f.id, sha256: f.sha256, rule: x.rs.version });
      return { fileId: f.id, rows: due.length, sha256: f.sha256 };
    });
  }

  /** The recipient's copy (masked TIN) for one contractor and year. */
  async necCopy(ctx: TenantContext, user: ScopeUser, entityId: string, consultantId: string, year: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.entity(tx, c, v, entityId, 'consultant.manage');
      const x = await this.necRows(tx, c.organizationId, entityId, year);
      const r = x.rows.find((y) => y.consultantId === consultantId && y.due && y.form);
      if (!r) throw new NotFoundException('No 1099-NEC is due for this contractor and year.');
      const a = r.form!.address as { street: string; city: string; state: string; zip: string };
      const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: `1099-NEC ${year}` } });
      const parts: Buffer[] = [];
      doc.on('data', (b: Buffer) => parts.push(b));
      const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(parts))));
      doc.fontSize(16).text(`Form 1099-NEC (${year}) — copy B for the recipient`).moveDown();
      const ein = ((await tx.entityCountryPack.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId } }))?.settings as Record<string, string> | undefined)?.ein ?? '';
      doc.fontSize(10).text(`Payer: ${e.name}`).text(`Payer EIN: •••••${ein.slice(-4)}`).moveDown();
      doc.text(`Recipient: ${r.form!.legalName}`).text(`${a.street}, ${a.city}, ${a.state} ${a.zip}`).text(`Recipient TIN (${r.form!.tinKind}): •••••${r.form!.tinLast4}`).moveDown();
      doc.fontSize(12).text(`Box 1, nonemployee compensation: $${r.paid}`).moveDown();
      doc.fontSize(8).text('This is important tax information and is being furnished to the IRS (data prepared by YukthiX; filed by the payer).');
      doc.end();
      await audit(tx, c, 'payroll.1099.copy_downloaded', 'consultant', consultantId, { year });
      return { file: await done, name: `1099-nec-${year}-${r.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf` };
    });
  }
}
