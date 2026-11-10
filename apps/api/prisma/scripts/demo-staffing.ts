import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { gstinCheckChar } from '../../src/expenses/checks';
import { gstSplit, lineAmount, pctToBp } from '../../src/staffing/billing-rules';
import { financialYear, toRupees } from '../../src/staffing/staffing-rules';
import { todayIst } from '../../src/org-structure/org-validation';
import { settingFor } from '../../src/people/probation';
import type { CompanyContext, Tx } from '../../src/org-structure/org-structure.service';

// Demo staffing (Kaveri Foods, demo-org; founder answer 701, 10 Nov 2026): the staffing desk pages had nothing to show.
// Adds one client with one rate-card line, one own-payroll placement on it, last month's approved weekly hours and one
// issued tax invoice for them, numbered from the default legal entity's series for this financial year (opened if
// missing). It never turns the desk on: the data shows only while Settings > Staffing desk is on. Adds only; each write
// is audited as coming from this script; safe to run again (it finds the demo client by name and fills only what is
// missing). Run from apps/api:
//   npx ts-node --transpile-only prisma/scripts/demo-staffing.ts
const prisma = new PrismaClient();
const CLIENT = 'Deccan Agro Processors';
const RATE = { role: 'Line operator', skill: 'Food packing line', location: 'Bengaluru', unit: 'hour', bill: 65000n, pay: 42000n };
const HOURS_CENTI = 4500; // 45 h a week
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Mondays of the month before `today` (a week counts in the month of its Monday, as the invoice draft does). */
function lastMonth(today: string) {
  const first = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const mondays: string[] = [];
  for (let d = new Date(first); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === 1) mondays.push(iso(d));
  return { from: iso(first), to: iso(end), mondays };
}

(async () => {
  const log: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
    const org = (await tx.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } })).id;
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org}, true)`;
    const c = { organizationId: org, isSuperAdmin: false } as CompanyContext;
    const audit = (action: string, type: string, id: string, meta: object) =>
      tx.$executeRaw`INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (gen_random_uuid(), ${org}::uuid, ${action}, ${type}, ${id}, ${JSON.stringify({ ...meta, source: 'demo set-up script, founder answer 701, 10 Nov 2026' })}, now())`;
    const today = todayIst();
    const month = lastMonth(today);

    // 1. The client (Karnataka, so the invoice is intra-state: CGST and SGST).
    let client = await tx.staffingClient.findFirst({ where: { organizationId: org, name: CLIENT } });
    if (!client) {
      const g14 = '29AAFCD4321K1Z';
      client = await tx.staffingClient.create({ data: { organizationId: org, name: CLIENT, legalName: `${CLIENT} Pvt Ltd`, gstin: g14 + gstinCheckChar(g14), state: 'IN-KA', billingAddress: '14 Peenya Industrial Area, Bengaluru 560058', status: 'active', paymentTermsDays: 30, contractStart: day(month.from), invoiceGrouping: 'month' } });
      await audit('staffing.client.created', 'staffing_client', client.id, { name: client.name, gstin: client.gstin, state: client.state });
      log.push(`client "${CLIENT}" added`);
    }

    // 2. One rate-card line from the first of last month.
    let rate = await tx.staffingRate.findFirst({ where: { organizationId: org, clientId: client.id }, orderBy: { validFrom: 'asc' } });
    if (!rate) {
      rate = await tx.staffingRate.create({ data: { organizationId: org, clientId: client.id, lineId: randomUUID(), role: RATE.role, skill: RATE.skill, location: RATE.location, unit: RATE.unit, billRatePaise: RATE.bill, payRatePaise: RATE.pay, otMultiplier: new Prisma.Decimal(await settingFor(tx as Tx, c, 'staffing.ot_multiplier', { legalEntityId: '' })), holidayMultiplier: new Prisma.Decimal(await settingFor(tx as Tx, c, 'staffing.holiday_multiplier', { legalEntityId: '' })), validFrom: day(month.from) } });
      await audit('staffing.rate.added', 'staffing_client', client.id, { lineId: rate.lineId, role: rate.role, bill: toRupees(rate.billRatePaise), pay: toRupees(rate.payRatePaise), validFrom: month.from });
      log.push(`rate line "${RATE.role}" added (bill ${toRupees(RATE.bill)}, pay ${toRupees(RATE.pay)} an hour)`);
    }

    // 3. One own-payroll placement: an active employee with no active placement elsewhere.
    let placement = await tx.staffingPlacement.findFirst({ where: { organizationId: org, clientId: client.id } });
    if (!placement) {
      const busy = (await tx.staffingPlacement.findMany({ where: { organizationId: org, status: 'active', employeeId: { not: null } }, select: { employeeId: true } })).map((p) => p.employeeId!);
      const job = await tx.employment.findFirst({ where: { organizationId: org, exitedOn: null, employeeId: { notIn: busy } }, orderBy: { createdAt: 'asc' }, select: { employeeId: true } });
      if (!job) throw new Error('demo-org has no free active employee to place.');
      const e = await tx.employee.findUniqueOrThrow({ where: { id: job.employeeId }, select: { givenName: true, familyName: true, preferredName: true } });
      const name = [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ');
      const endOn = iso(new Date(Date.UTC(Number(month.from.slice(0, 4)), Number(month.from.slice(5, 7)) + 5, 0)));
      placement = await tx.staffingPlacement.create({ data: { organizationId: org, clientId: client.id, lineId: rate.lineId, supply: 'own', employeeId: job.employeeId, workerName: name, startOn: day(month.from), endOn: day(endOn) } });
      await audit('staffing.placement.created', 'staffing_placement', placement.id, { supply: 'own', startOn: month.from, endOn });
      log.push(`placement of ${name} added (${month.from} to ${endOn})`);
    }

    // 4. Last month's weekly hours, approved.
    const have = new Set((await tx.staffingHours.findMany({ where: { organizationId: org, placementId: placement.id }, select: { weekStart: true } })).map((h) => iso(h.weekStart)));
    for (const w of month.mondays.filter((m) => !have.has(m))) {
      const h = await tx.staffingHours.create({ data: { organizationId: org, placementId: placement.id, clientId: client.id, weekStart: day(w), hoursCenti: HOURS_CENTI, status: 'approved', decidedAt: new Date(), note: 'Demo hours' } });
      await audit('staffing.hours.approved', 'staffing_hours', h.id, { weekStart: w, hours: String(HOURS_CENTI / 100) });
    }
    if (month.mondays.some((m) => !have.has(m))) log.push(`approved hours for ${month.mondays.filter((m) => !have.has(m)).length} weeks of ${month.from.slice(0, 7)}`);

    // 5. One issued invoice for those hours (the series of the default legal entity for this year, opened if missing).
    if (await tx.staffingInvoice.findFirst({ where: { organizationId: org, clientId: client.id, kind: 'staffing' } })) return void log.push(log.length ? 'invoice already there' : 'everything already there, nothing to do');
    const entity = await tx.legalEntity.findFirst({ where: { organizationId: org, isDefault: true, archivedAt: null, gstin: { not: null } }, select: { id: true, gstin: true } });
    if (!entity?.gstin) throw new Error('demo-org has no default legal entity with a GSTIN.');
    const fy = financialYear(today);
    let series = await tx.staffingInvoiceSeries.findFirst({ where: { organizationId: org, gstin: entity.gstin, financialYear: fy } });
    if (!series) {
      series = await tx.staffingInvoiceSeries.create({ data: { organizationId: org, legalEntityId: entity.id, gstin: entity.gstin, financialYear: fy, prefix: 'KFS/', nextNumber: 1 } });
      await audit('staffing.invoice_series.created', 'staffing_invoice_series', series.id, { gstin: entity.gstin, fy, prefix: series.prefix, next: 1 });
    }
    const hours = await tx.staffingHours.findMany({ where: { organizationId: org, placementId: placement.id, status: 'approved', invoiceId: null, weekStart: { gte: day(month.from), lte: day(month.to) } } });
    const qty = hours.reduce((s, h) => s + h.hoursCenti, 0);
    const taxable = lineAmount(qty, rate.billRatePaise);
    const codes = (await tx.statutoryRuleSet.findFirstOrThrow({ where: { statute: 'GST.STATE_CODES', jurisdiction: 'IN', status: 'published' }, orderBy: { validFrom: 'desc' } })).values as Record<string, string>;
    const gstPct = ((await tx.statutoryRuleSet.findFirstOrThrow({ where: { statute: 'GST.STAFFING_RATE', jurisdiction: 'IN', status: 'published' }, orderBy: { validFrom: 'desc' } })).values as { gstPct: string }).gstPct;
    const supplierState = codes[entity.gstin.slice(0, 2)]!;
    const t = gstSplit(taxable, pctToBp(gstPct)!, supplierState !== client.state);
    const up = await tx.staffingInvoiceSeries.update({ where: { id: series.id }, data: { nextNumber: { increment: 1 } } });
    const number = `${series.prefix}${up.nextNumber - 1}`;
    const einvoice = (await settingFor(tx as Tx, c, 'staffing.einvoice.applies', { legalEntityId: '' })) === 'on';
    const inv = await tx.staffingInvoice.create({
      data: {
        organizationId: org, clientId: client.id, seriesId: series.id, kind: 'staffing', number, status: 'issued', periodStart: day(month.from), periodEnd: day(month.to), invoiceDate: day(today),
        supplierState, placeOfSupply: client.state, gstPct, taxablePaise: taxable, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total, irn: einvoice ? 'pending' : 'not_needed', issuedAt: new Date(),
        lines: { create: [{ organizationId: org, placementId: placement.id, description: `${placement.workerName} · ${rate.role} · ${qty / 100} h`, qtyCenti: qty, ratePaise: rate.billRatePaise, amountPaise: taxable, position: 1 }] },
      },
    });
    await tx.staffingHours.updateMany({ where: { id: { in: hours.map((h) => h.id) } }, data: { invoiceId: inv.id } });
    await audit('staffing.invoice.issued', 'staffing_invoice', inv.id, { number, total: toRupees(t.total) });
    log.push(`invoice ${number} issued for ${month.from.slice(0, 7)} (total ${toRupees(t.total)})`);
  });
  console.log(log.join('\n'));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
