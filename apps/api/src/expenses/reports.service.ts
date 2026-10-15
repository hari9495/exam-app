import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { openBalance } from './travel';

// Expenses batch E5 (M05-BUILD-DESIGN §13.5, §15 F13, §21.5 XP-5.06; EXP-09): finance's reports, each as columns and
// rows (and CSV). Read with expense.report.view, company-wide or for the legal entities it is granted for.
//   gst-input            lines with GST details, in the GSTR-2B column order, with the input-credit status (§13.5)
//   summary              approved spend by category
//   unpaid               approved claims not yet paid
//   advance-ageing       open advance balances by age
//   over-limit           approved lines that went over a limit, with the reason given
//   approver-patterns    one approver approving 3+ flagged or over-limit claims of the same person in 90 days (F13)

export const REPORTS = ['summary', 'unpaid', 'advance-ageing', 'over-limit', 'gst-input', 'approver-patterns'] as const;
export type ReportKind = (typeof REPORTS)[number];
type Column = { key: string; label: string };
export type Report = { kind: ReportKind; from: string; to: string; columns: Column[]; rows: Record<string, string | number | null>[] };

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const DONE = ['approved', 'partly_approved'];

/** CSV with a guard against spreadsheet formulas in any cell (=, +, -, @ at the start). */
export function toCsv(r: Pick<Report, 'columns' | 'rows'>): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [r.columns.map((c) => cell(c.label)).join(','), ...r.rows.map((row) => r.columns.map((c) => cell(row[c.key])).join(','))].join('\r\n') + '\r\n';
}

@Injectable()
export class ExpenseReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async report(ctx: TenantContext, user: ScopeUser, kind: ReportKind, from?: string, to?: string, entityId?: string | null): Promise<Report> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['expense.report.view']);
    if (!v.grants.has('expense.report.view') || v.actingForOther) throw new ForbiddenException('You cannot see expense reports.');
    const end = to ?? todayIst();
    const start = from ?? `${end.slice(0, 8)}01`;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const reach = tenantWide(v, 'expense.report.view') ? (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id) : (v.scopes.get('expense.report.view') ?? []).filter((s) => s.type === 'legal_entity' && s.id).map((s) => s.id as string);
      const entities = reach.filter((id) => !entityId || id === entityId);
      const base = { kind, from: start, to: end };
      const range = { gte: asDate(start), lt: new Date(asDate(end).getTime() + 86_400_000) };
      const claims = { organizationId: org, legalEntityId: { in: entities } };
      if (kind === 'summary') {
        const rows = await tx.$queryRaw<{ category: string; claims: number; lines: number; claimed: string; approved: string }[]>`
          SELECT l.category_code AS category, count(DISTINCT c.id)::int AS claims, count(*)::int AS lines, sum(l.claimed)::text AS claimed, sum(COALESCE(l.approved, l.claimed))::text AS approved
          FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
          WHERE l.organization_id = ${org}::uuid AND c.legal_entity_id = ANY(${entities}::uuid[]) AND l.removed_at IS NULL AND l.pay_mode <> 'company_paid'
            AND c.status IN ('approved', 'partly_approved') AND c.decided_at >= ${range.gte} AND c.decided_at < ${range.lt}
          GROUP BY l.category_code ORDER BY l.category_code`;
        const cats = new Map((await tx.expenseCategory.findMany({ where: { organizationId: org } })).map((x) => [x.code, x.name]));
        return { ...base, columns: [{ key: 'category', label: 'Category' }, { key: 'claims', label: 'Claims' }, { key: 'lines', label: 'Bills' }, { key: 'claimed', label: 'Claimed' }, { key: 'approved', label: 'Approved' }], rows: rows.map((r) => ({ ...r, category: cats.get(r.category) ?? r.category, claimed: D(r.claimed).toFixed(2), approved: D(r.approved).toFixed(2) })) };
      }
      if (kind === 'unpaid') {
        const rows = await tx.expenseClaim.findMany({ where: { ...claims, status: { in: DONE }, paymentStatus: { in: ['approved_unpaid', 'in_payroll', 'payout_queued', 'payment_failed'] } }, orderBy: { decidedAt: 'asc' } });
        const people = await this.names(tx, org, rows.map((r) => r.employeeId));
        return { ...base, columns: [{ key: 'person', label: 'Person' }, { key: 'claim', label: 'Claim' }, { key: 'approvedOn', label: 'Approved on' }, { key: 'currency', label: 'Currency' }, { key: 'netPayable', label: 'To pay' }, { key: 'status', label: 'Payment' }], rows: rows.map((r) => ({ person: people.get(r.employeeId) ?? '', claim: r.title, approvedOn: r.decidedAt ? iso(r.decidedAt) : null, currency: r.currency, netPayable: (r.netPayable ?? D(0)).toFixed(2), status: r.paymentStatus })) };
      }
      if (kind === 'advance-ageing') {
        const advs = await tx.expenseAdvance.findMany({ where: { ...claims, status: { in: ['paid', 'to_fnf'] } }, orderBy: { paidOn: 'asc' } });
        const people = await this.names(tx, org, advs.map((r) => r.employeeId));
        const rows = [];
        for (const a of advs) {
          const done = await tx.advanceSettlement.findMany({ where: { organizationId: org, advanceId: a.id }, select: { amount: true } });
          const open = openBalance(a.amount, done.map((d) => d.amount));
          if (open.lte(0)) continue;
          const days = Math.round((asDate(end).getTime() - a.paidOn!.getTime()) / 86_400_000);
          rows.push({ person: people.get(a.employeeId) ?? '', advance: a.purpose, currency: a.currency, open: open.toFixed(2), paidOn: iso(a.paidOn!), settleBy: a.settleBy ? iso(a.settleBy) : null, days, bucket: days <= 30 ? '0–30 days' : days <= 60 ? '31–60 days' : days <= 90 ? '61–90 days' : 'Over 90 days', overdue: a.overdueOn ? 'Yes' : 'No' });
        }
        return { ...base, columns: [{ key: 'person', label: 'Person' }, { key: 'advance', label: 'Advance' }, { key: 'currency', label: 'Currency' }, { key: 'open', label: 'Open balance' }, { key: 'paidOn', label: 'Paid on' }, { key: 'settleBy', label: 'Settle by' }, { key: 'days', label: 'Days open' }, { key: 'bucket', label: 'Age' }, { key: 'overdue', label: 'Overdue' }], rows };
      }
      if (kind === 'over-limit') {
        const rows = await tx.$queryRaw<{ employee_id: string; title: string; line_no: number; category: string; spent_on: Date; claimed: string; over_by: string; justification: string | null }[]>`
          SELECT c.employee_id::text, c.title, l.line_no, l.category_code AS category, l.spent_on, l.claimed::text, l.policy_result->>'overBy' AS over_by, l.justification
          FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
          WHERE l.organization_id = ${org}::uuid AND c.legal_entity_id = ANY(${entities}::uuid[]) AND l.removed_at IS NULL AND l.policy_result->>'outcome' = 'over_justify'
            AND c.status IN ('approved', 'partly_approved') AND c.decided_at >= ${range.gte} AND c.decided_at < ${range.lt}
          ORDER BY l.spent_on`;
        const people = await this.names(tx, org, rows.map((r) => r.employee_id));
        return { ...base, columns: [{ key: 'person', label: 'Person' }, { key: 'claim', label: 'Claim' }, { key: 'line', label: 'Bill' }, { key: 'category', label: 'Category' }, { key: 'spentOn', label: 'Date' }, { key: 'claimed', label: 'Claimed' }, { key: 'overBy', label: 'Over by' }, { key: 'why', label: 'Reason given' }], rows: rows.map((r) => ({ person: people.get(r.employee_id) ?? '', claim: r.title, line: r.line_no, category: r.category, spentOn: iso(r.spent_on), claimed: D(r.claimed).toFixed(2), overBy: r.over_by, why: r.justification })) };
      }
      if (kind === 'gst-input') {
        const lines = await tx.$queryRaw<{ entity: string; claim: string; supplier_gstin: string; merchant: string | null; invoice_no: string | null; invoice_date: Date | null; spent_on: Date; place_of_supply: string | null; taxable_value: string | null; igst: string | null; cgst: string | null; sgst: string | null; cess: string | null; claimed: string; itc_status: string | null; billed_to_gstin: string | null; einvoice_irn: string | null }[]>`
          SELECT e.name AS entity, c.title AS claim, l.supplier_gstin, l.merchant, l.invoice_no, l.invoice_date, l.spent_on, l.place_of_supply, l.taxable_value::text, l.igst::text, l.cgst::text, l.sgst::text, l.cess::text, l.claimed::text, l.itc_status, l.billed_to_gstin, l.einvoice_irn
          FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id JOIN legal_entities e ON e.organization_id = c.organization_id AND e.id = c.legal_entity_id
          WHERE l.organization_id = ${org}::uuid AND c.legal_entity_id = ANY(${entities}::uuid[]) AND l.removed_at IS NULL AND l.supplier_gstin IS NOT NULL
            AND c.status IN ('approved', 'partly_approved') AND COALESCE(l.invoice_date, l.spent_on) >= ${asDate(start)} AND COALESCE(l.invoice_date, l.spent_on) <= ${asDate(end)}
          ORDER BY e.name, l.supplier_gstin, COALESCE(l.invoice_date, l.spent_on)`;
        const n = (x: string | null) => D(x ?? 0);
        // GSTR-2B (B2B) column order first, then what finance needs to reconcile it (§13.5).
        const columns = [
          { key: 'gstin', label: 'GSTIN of supplier' },
          { key: 'name', label: 'Trade/Legal name' },
          { key: 'invoiceNo', label: 'Invoice number' },
          { key: 'type', label: 'Invoice type' },
          { key: 'invoiceDate', label: 'Invoice Date' },
          { key: 'value', label: 'Invoice Value' },
          { key: 'pos', label: 'Place of supply' },
          { key: 'reverse', label: 'Supply Attract Reverse Charge' },
          { key: 'rate', label: 'Rate (%)' },
          { key: 'taxable', label: 'Taxable Value' },
          { key: 'igst', label: 'Integrated Tax' },
          { key: 'cgst', label: 'Central Tax' },
          { key: 'sgst', label: 'State/UT Tax' },
          { key: 'cess', label: 'Cess' },
          { key: 'irn', label: 'IRN' },
          { key: 'itc', label: 'ITC status' },
          { key: 'billedTo', label: 'Billed to GSTIN' },
          { key: 'entity', label: 'Legal entity' },
          { key: 'claim', label: 'Claim' },
        ];
        return {
          ...base,
          columns,
          rows: lines.map((l) => {
            const tax = n(l.igst).add(n(l.cgst)).add(n(l.sgst));
            const taxable = n(l.taxable_value);
            return {
              gstin: l.supplier_gstin,
              name: l.merchant,
              invoiceNo: l.invoice_no,
              type: 'Regular',
              invoiceDate: iso(l.invoice_date ?? l.spent_on),
              value: D(l.claimed).toFixed(2),
              pos: l.place_of_supply,
              reverse: 'N',
              rate: taxable.gt(0) ? tax.div(taxable).mul(100).toDecimalPlaces(2).toString() : null,
              taxable: l.taxable_value ? taxable.toFixed(2) : null,
              igst: l.igst ? n(l.igst).toFixed(2) : null,
              cgst: l.cgst ? n(l.cgst).toFixed(2) : null,
              sgst: l.sgst ? n(l.sgst).toFixed(2) : null,
              cess: l.cess ? n(l.cess).toFixed(2) : null,
              irn: l.einvoice_irn,
              itc: l.itc_status,
              billedTo: l.billed_to_gstin,
              entity: l.entity,
              claim: l.claim,
            };
          }),
        };
      }
      // approver-patterns (F13): who approved what for whom, never a block.
      const since = new Date(asDate(end).getTime() - 90 * 86_400_000);
      const rows = await tx.$queryRaw<{ approver: string; employee_id: string; n: number }[]>`
        SELECT a.actor_user_id::text AS approver, c.employee_id::text, count(DISTINCT c.id)::int AS n
        FROM wf_actions a JOIN expense_claims c ON c.organization_id = a.organization_id AND c.wf_request_id = a.request_id
        WHERE a.organization_id = ${org}::uuid AND c.legal_entity_id = ANY(${entities}::uuid[]) AND a.action = 'approve' AND a.actor_user_id IS NOT NULL
          AND a.created_at >= ${since} AND a.created_at < ${range.lt} AND c.status IN ('approved', 'partly_approved')
          AND (c.risk <> 'none' OR EXISTS (SELECT 1 FROM expense_lines l WHERE l.organization_id = c.organization_id AND l.claim_id = c.id AND l.policy_result->>'outcome' = 'over_justify'))
        GROUP BY a.actor_user_id, c.employee_id HAVING count(DISTINCT c.id) >= 3 ORDER BY n DESC`;
      const people = await this.names(tx, org, rows.map((r) => r.employee_id));
      const approvers = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.approver) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      return { ...base, from: iso(since), columns: [{ key: 'approver', label: 'Approver' }, { key: 'person', label: 'Person' }, { key: 'claims', label: 'Flagged or over-limit claims approved (90 days)' }], rows: rows.map((r) => ({ approver: approvers.get(r.approver) ?? '', person: people.get(r.employee_id) ?? '', claims: r.n })) };
    });
  }

  private async names(tx: Tx, org: string, employeeIds: string[]) {
    const emps = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(employeeIds)] } }, select: { id: true, personId: true } });
    const persons = await tx.person.findMany({ where: { organizationId: org, id: { in: emps.map((e) => e.personId) } } });
    return new Map(
      emps.map((e) => {
        const p = persons.find((x) => x.id === e.personId);
        return [e.id, p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : ''];
      }),
    );
  }
}
