import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService, checkUpload } from '../documents/files.service';
import { PayrollIntakeService } from '../payroll/intake.service';
import { COMPANY_PAID, dupKey } from './checks';
import { headerIndex, mappingProblem, parseRows, readTable, scrub, suggestMatches, type CardMapping, type MatchCandidate } from './card-statement';
import type { CardImportDto, CardMappingDto } from './cards-dto';

// EXP-08 card statement import and matching (founder answer 3 Nov 2026, option A; M05 Q8).
//   import     finance uploads a CSV or Excel statement through the file service (type and size checked, virus scanned);
//              the bank's column mapping is saved per company and reused. Every row is checked first: one bad row and
//              nothing is saved. Only the last 4 digits of a card are kept; a file with full numbers is stored as a copy
//              cut to the last 4 digits. The same file (SHA-256) is refused; the same bank and period is refused unless
//              finance imports it as the next version (allowed while nothing on the old one is matched or explained).
//   match      suggestions (worked out on every read): the card's holder on file, the same currency, the amount within
//              expense.card.match_amount_within, the date within expense.card.match_days. Finance confirms or picks
//              another claim line of the holder. A company-card line is never reimbursed (M05 Q8); a matched personal
//              line on a claim not yet decided becomes a company-card line, so it is not paid twice.
//   chase      an unmatched debit is sent to its holder ("Ask employee", and every one left at "Close statement"), with
//              reminders on expense.card.reminder_days. The employee says business (a draft company-card line on a
//              claim, to add the receipt) or personal (recovered from salary in expense.card.recovery_instalments).
//   who        expense.payout.manage company-wide; never matching one's own card line. Employees see their own lines.
//              Every change and every view of a statement is audited.

const KEYS = ['expense.payout.manage'] as const;
const MIME = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;
export const CARD_MAX_MB = 5;
const LIVE = ['draft', 'submitted', 'sent_back', 'approved', 'partly_approved'];
const UNDECIDED = ['draft', 'submitted', 'sent_back'];
const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(asDate(d).getTime() + n * 86_400_000));
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const nameOf = (e: { givenName: string; familyName: string | null; preferredName?: string | null }) => [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ');
const dmy = (d: Date | string) => new Date(typeof d === 'string' ? asDate(d) : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const csvCell = (x: string) => (/[",\n]/.test(x) || /^[=+\-@]/.test(x) ? `"${x.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : x);

type Line = Prisma.ExpenseCardLineGetPayload<object>;
type Statement = Prisma.ExpenseCardStatementGetPayload<object>;
type Candidate = MatchCandidate & { claimId: string; text: string; payMode: string; claimStatus: string };

@Injectable()
export class ExpenseCardsService {
  private readonly logger = new Logger(ExpenseCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly intake: PayrollIntakeService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...KEYS]);
  }

  /** Card statements are company-wide: expense.payout.manage for the whole company, never while acting for someone. */
  private async finance(tx: Tx, org: string, v: Viewer) {
    if (v.actingForOther || !tenantWide(v, 'expense.payout.manage')) throw new ForbiddenException('Card statements need expense.payout.manage for the whole company.');
    const me = v.userId ? await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }) : null;
    return me?.id ?? null;
  }

  private async myEmployee(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) throw new ForbiddenException('Only employees explain their card lines.');
    const me = await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } });
    if (!me) throw new ForbiddenException('Only employees explain their card lines.');
    return me.id;
  }

  private async rules(tx: Tx, c: CompanyContext) {
    return { within: await settingFor(tx, c, 'expense.card.match_amount_within', ANY_ENTITY), days: Number(await settingFor(tx, c, 'expense.card.match_days', ANY_ENTITY)), recoveryInstalments: Number(await settingFor(tx, c, 'expense.card.recovery_instalments', ANY_ENTITY)) };
  }

  private async tell(org: string, users: string[], text: string) {
    const to = [...new Set(users)];
    // Amounts stay in the app (P04 Q6): the mail only says there is something to look at.
    if (to.length)
      await this.notifications
        .notifySystem({ organizationId: org, isSuperAdmin: false }, to, 'expense.card.update', { entityType: 'expense_card_line', entityId: org, contextText: text, linkPath: '/yx/expenses/card-lines' }, { subject: 'Expenses: a company card line needs you', html: '<p>A line on your company card statement needs you in YukthiX.</p>' })
        .catch(() => undefined);
  }

  private async usersOf(tx: Tx, org: string, employeeIds: string[]) {
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(employeeIds)] } }, select: { userId: true } });
    return rows.map((r) => r.userId).filter((u): u is string => Boolean(u));
  }

  // ------------------------------------------------------------------------------------------ import

  /** Step 1: the file's column headings and a few rows (full card numbers cut), and the bank's saved mapping. */
  async preview(ctx: TenantContext, user: ScopeUser, file: { originalname: string; buffer: Buffer } | undefined, bankName?: string) {
    const v = await this.viewer(user);
    const table = await this.readChecked(file);
    return inCompany(this.tenantPrisma, ctx, async (tx) => {
      await this.finance(tx, ctx.organizationId!, v);
      const head = headerIndex(table);
      if (head < 0) throw new BadRequestException('The file has no heading row. Check that it is the statement export from the bank.');
      const columns = table[head].map((x) => x.trim()).filter(Boolean);
      const sample = table
        .slice(head + 1)
        .filter((r) => r.some((x) => x.trim()))
        .slice(0, 5)
        .map((r) => table[head].map((h, i) => (h.trim() ? scrub(r[i] ?? '').text : null)).filter((x): x is string => x !== null));
      const saved = bankName ? await this.mappingOf(tx, ctx.organizationId!, bankName) : null;
      return { fileName: file!.originalname, columns, sample, rows: table.slice(head + 1).filter((r) => r.some((x) => x.trim())).length, mapping: saved ? { bankName: saved.bankName, columns: saved.columns as unknown as CardMapping, version: saved.version } : null };
    });
  }

  private async readChecked(file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the statement file.');
    const check = await checkUpload(file.originalname, file.buffer, MIME, CARD_MAX_MB);
    if (!check.ok) throw new BadRequestException({ statusCode: 400, code: 'FILE_REFUSED', message: `${file.originalname} was not added. ${check.reason}` });
    try {
      return await readTable(file.originalname, file.buffer);
    } catch (e) {
      throw new BadRequestException({ statusCode: 400, code: 'FILE_REFUSED', message: (e as Error).message });
    }
  }

  private mappingOf(tx: Tx, org: string, bankName: string) {
    return tx.expenseCardMapping.findFirst({ where: { organizationId: org, bankName: { equals: bankName, mode: 'insensitive' } } });
  }

  /** The banks with a saved mapping, for the bank list on the upload step. */
  async banks(tx: Tx, org: string) {
    return (await tx.expenseCardMapping.findMany({ where: { organizationId: org }, orderBy: { bankName: 'asc' }, select: { bankName: true, columns: true, version: true } })).map((m) => ({ bankName: m.bankName, mapping: m.columns as unknown as CardMapping, version: m.version }));
  }

  async importStatement(ctx: TenantContext, user: ScopeUser, file: { originalname: string; buffer: Buffer } | undefined, dto: CardImportDto) {
    const v = await this.viewer(user);
    const table = await this.readChecked(file);
    const mapping = clean(dto.mapping);
    const problem = mappingProblem(mapping);
    if (problem) throw new BadRequestException(problem);
    const parsed = parseRows(table, mapping);
    if (parsed.problems.length) {
      const n = parsed.problems.filter((p) => p.rowNo > 0).length;
      throw new BadRequestException({ statusCode: 400, code: 'ROWS_TO_FIX', message: n ? `${n} ${n === 1 ? 'row needs' : 'rows need'} fixing. Nothing was imported. Fix the file and upload it again.` : `${parsed.problems[0].problems[0]} Nothing was imported.`, problems: parsed.problems.slice(0, 200), total: n });
    }
    const hash = sha256(file!.buffer);
    const dates = parsed.rows.map((r) => r.txnOn).sort();
    const [from, to] = [dates[0], dates[dates.length - 1]];
    const out = await inCompany(
      this.tenantPrisma,
      ctx,
      async (tx, c) => {
        const org = c.organizationId;
        await this.finance(tx, org, v);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${org}:card-statement`}))`;
        const same = await tx.expenseCardStatement.findFirst({ where: { organizationId: org, fileSha256: hash } });
        if (same) throw new ConflictException({ statusCode: 409, code: 'DUPLICATE_STATEMENT', message: `This file was already imported on ${dmy(same.createdAt)} (${same.bankName}, ${dmy(same.periodFrom)} to ${dmy(same.periodTo)}). Nothing was imported.`, statementId: same.id });
        const old = await tx.expenseCardStatement.findFirst({ where: { organizationId: org, bankName: { equals: dto.bankName, mode: 'insensitive' }, periodFrom: asDate(from), periodTo: asDate(to), status: { not: 'replaced' } } });
        if (old && !dto.replace)
          throw new ConflictException({ statusCode: 409, code: 'SAME_PERIOD', message: `${old.bankName} already has a statement for ${dmy(old.periodFrom)} to ${dmy(old.periodTo)} (version ${old.revision}). Import this file as version ${old.revision + 1} to replace it, or choose another file.`, statementId: old.id, revision: old.revision });
        if (old) {
          const done = await tx.expenseCardLine.count({ where: { organizationId: org, statementId: old.id, status: { in: ['matched', 'personal'] } } });
          if (done) throw new ConflictException({ statusCode: 409, code: 'SAME_PERIOD', message: `Version ${old.revision} already has ${done} matched or explained ${done === 1 ? 'line' : 'lines'}, so it cannot be replaced. Nothing was imported.`, statementId: old.id, revision: old.revision });
          await tx.expenseCardStatement.update({ where: { id: old.id }, data: { status: 'replaced', version: { increment: 1 } } });
          await tx.expenseCardLine.updateMany({ where: { organizationId: org, statementId: old.id, status: { in: ['open', 'to_chase', 'refund'] } }, data: { status: 'replaced', version: { increment: 1 } } });
          await audit(tx, c, 'expense.card.statement.replaced', 'expense_card_statement', old.id, { revision: old.revision });
        }
        // The bank's mapping, saved for next time (a change is a new version of it).
        let saved = await this.mappingOf(tx, org, dto.bankName);
        if (!saved) {
          saved = await tx.expenseCardMapping.create({ data: { organizationId: org, bankName: dto.bankName, columns: mapping as unknown as Prisma.InputJsonValue, createdBy: v.userId, updatedBy: v.userId } });
          await audit(tx, c, 'expense.card.mapping.created', 'expense_card_mapping', saved.id, { bankName: dto.bankName });
        } else if (JSON.stringify(saved.columns) !== JSON.stringify(mapping)) {
          await audit(tx, c, 'expense.card.mapping.changed', 'expense_card_mapping', saved.id, { bankName: saved.bankName, before: saved.columns, after: mapping, version: saved.version + 1 });
          saved = await tx.expenseCardMapping.update({ where: { id: saved.id }, data: { columns: mapping as unknown as Prisma.InputJsonValue, updatedBy: v.userId, version: { increment: 1 } } });
        }
        // The file is kept through the file service; with full card numbers in it, only a copy cut to the last 4 digits.
        const keep = parsed.fullNumbers ? { name: `${file!.originalname.replace(/\.[^.]+$/, '')}-last4-only.csv`, data: Buffer.from(table.map((r) => r.map((x) => csvCell(scrub(x).text)).join(',')).join('\n') + '\n') } : { name: file!.originalname, data: file!.buffer };
        const stored = await this.files.storeIn(tx, c, { area: 'expense-card', name: keep.name, data: keep.data, allowedMime: MIME, maxMb: CARD_MAX_MB, via: 'staff' });
        const debit = parsed.rows.filter((r) => r.direction === 'debit').reduce((t, r) => t.add(r.amount), D(0));
        const credit = parsed.rows.filter((r) => r.direction === 'credit').reduce((t, r) => t.add(r.amount), D(0));
        const st = await tx.expenseCardStatement.create({
          data: { organizationId: org, bankName: saved.bankName, mappingId: saved.id, revision: old ? old.revision + 1 : 1, replacesId: old?.id ?? null, periodFrom: asDate(from), periodTo: asDate(to), fileId: stored.id, fileName: file!.originalname.slice(0, 200), fileSha256: hash, rowCount: parsed.rows.length, debitTotal: debit, creditTotal: credit, fullNumbersDropped: parsed.fullNumbers, importedBy: v.userId! },
        });
        const holders = await this.holders(tx, org, saved.bankName);
        await tx.expenseCardLine.createMany({
          data: parsed.rows.map((r) => {
            const h = r.last4 ? (holders.get(r.last4) ?? []) : [];
            return { organizationId: org, statementId: st.id, rowNo: r.rowNo, txnOn: asDate(r.txnOn), description: r.description, merchant: r.merchant, amount: r.amount, direction: r.direction, currency: r.currency, cardLast4: r.last4, employeeId: h.length === 1 ? h[0] : null, status: r.direction === 'credit' ? 'refund' : 'open' };
          }),
        });
        await audit(tx, c, 'expense.card.statement.imported', 'expense_card_statement', st.id, { bankName: st.bankName, revision: st.revision, from, to, rows: parsed.rows.length, fullNumbersDropped: parsed.fullNumbers, fileId: stored.id });
        return { id: st.id, fileId: stored.id, fullNumbersDropped: parsed.fullNumbers };
      },
      { timeout: 60_000 },
    );
    void this.files.scan(ctx.organizationId!, out.fileId).catch(() => undefined);
    return { id: out.id, fullNumbersDropped: out.fullNumbersDropped };
  }

  /** last 4 digits → the employees with that card of this bank on file. */
  private async holders(tx: Tx, org: string, bankName: string) {
    const cards = await tx.expenseCard.findMany({ where: { organizationId: org, removedAt: null, bankName: { equals: bankName, mode: 'insensitive' } }, select: { last4: true, employeeId: true } });
    const out = new Map<string, string[]>();
    for (const x of cards) out.set(x.last4, [...(out.get(x.last4) ?? []), x.employeeId]);
    return out;
  }

  // ------------------------------------------------------------------------------------------ read

  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.finance(tx, org, v);
      const rows = await tx.expenseCardStatement.findMany({ where: { organizationId: org }, orderBy: [{ periodTo: 'desc' }, { revision: 'desc' }], take: 100 });
      const counts = rows.length ? await tx.expenseCardLine.groupBy({ by: ['statementId', 'status'], where: { organizationId: org, statementId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }) : [];
      const n = (id: string, s: string) => counts.find((x) => x.statementId === id && x.status === s)?._count._all ?? 0;
      return {
        statements: rows.map((s) => ({ ...this.head(s), open: n(s.id, 'open'), toChase: n(s.id, 'to_chase') })),
        banks: await this.banks(tx, org),
        rules: await this.rules(tx, c),
      };
    });
  }

  private head(s: Statement) {
    return { id: s.id, bankName: s.bankName, revision: s.revision, periodFrom: iso(s.periodFrom), periodTo: iso(s.periodTo), fileName: s.fileName, rowCount: s.rowCount, debitTotal: s.debitTotal.toFixed(2), creditTotal: s.creditTotal.toFixed(2), fullNumbersDropped: s.fullNumbersDropped, status: s.status, note: s.note, version: s.version, importedAt: s.createdAt.toISOString() };
  }

  /** Claim lines that could be this statement's: the holders', company-card or (claim not yet decided) personal. */
  private async candidates(tx: Tx, org: string, employeeIds: string[], from: string, to: string, days: number): Promise<Candidate[]> {
    if (!employeeIds.length) return [];
    const claims = await tx.expenseClaim.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, status: { in: LIVE } }, select: { id: true, employeeId: true, title: true, currency: true, status: true } });
    if (!claims.length) return [];
    const byId = new Map(claims.map((x) => [x.id, x]));
    const lines = await tx.expenseLine.findMany({
      where: { organizationId: org, claimId: { in: claims.map((x) => x.id) }, removedAt: null, payMode: { in: ['company_card', 'personal'] }, spentOn: { gte: asDate(addDays(from, -Math.max(days, 31))), lte: asDate(addDays(to, Math.max(days, 31))) } },
      select: { id: true, claimId: true, lineNo: true, spentOn: true, claimed: true, merchant: true, payMode: true, receiptCurrency: true, receiptAmount: true },
      take: 5000,
    });
    const taken = new Set((await tx.expenseCardLine.findMany({ where: { organizationId: org, matchedLineId: { in: lines.map((l) => l.id) } }, select: { matchedLineId: true } })).map((x) => x.matchedLineId));
    return lines
      .map((l) => ({ l, claim: byId.get(l.claimId)! }))
      .filter(({ l, claim }) => !taken.has(l.id) && (l.payMode === 'company_card' || UNDECIDED.includes(claim.status)))
      .map(({ l, claim }) => ({
        id: l.id,
        claimId: l.claimId,
        employeeId: claim.employeeId,
        spentOn: iso(l.spentOn),
        amount: (l.receiptAmount ?? l.claimed).toFixed(2),
        currency: l.receiptCurrency ?? claim.currency,
        merchant: l.merchant,
        payMode: l.payMode,
        claimStatus: claim.status,
        text: `${claim.title} · line ${l.lineNo}${l.merchant ? ` · ${l.merchant}` : ''}`,
      }));
  }

  /** The matched claim line of each line still standing (a removed line or a rejected claim opens the card line again). */
  private async matchedTexts(tx: Tx, org: string, ids: string[]) {
    if (!ids.length) return new Map<string, { claimId: string; text: string; live: boolean }>();
    const lines = await tx.expenseLine.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, claimId: true, lineNo: true, merchant: true, removedAt: true } });
    const claims = new Map((await tx.expenseClaim.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.claimId) } }, select: { id: true, title: true, status: true } })).map((x) => [x.id, x]));
    return new Map(lines.map((l) => [l.id, { claimId: l.claimId, text: `${claims.get(l.claimId)?.title ?? 'Claim'} · line ${l.lineNo}${l.merchant ? ` · ${l.merchant}` : ''}`, live: !l.removedAt && LIVE.includes(claims.get(l.claimId)?.status ?? '') }]));
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.finance(tx, org, v);
      const s = await tx.expenseCardStatement.findFirst({ where: { organizationId: org, id } });
      if (!s) throw new NotFoundException('No such statement.');
      const lines = await tx.expenseCardLine.findMany({ where: { organizationId: org, statementId: id }, orderBy: { rowNo: 'asc' } });
      const rules = await this.rules(tx, c);
      const holders = await this.holders(tx, org, s.bankName);
      const people = [...new Set([...holders.values()].flat().concat(lines.map((l) => l.employeeId).filter((x): x is string => Boolean(x))))];
      const cands = await this.candidates(tx, org, people, iso(s.periodFrom), iso(s.periodTo), rules.days);
      const matched = await this.matchedTexts(tx, org, lines.map((l) => l.matchedLineId).filter((x): x is string => Boolean(x)));
      const holdersOf = (l: Line) => (l.employeeId ? [l.employeeId] : l.cardLast4 ? (holders.get(l.cardLast4) ?? []) : []);
      const open = (l: Line) => l.status === 'open' || l.status === 'to_chase' || (l.status === 'matched' && !matched.get(l.matchedLineId!)?.live);
      const sug = suggestMatches(
        lines.filter(open).map((l) => ({ id: l.id, txnOn: iso(l.txnOn), amount: l.amount.toFixed(2), currency: l.currency, direction: l.direction as 'debit', merchant: l.merchant ?? l.description, holders: holdersOf(l) })),
        cands,
        rules,
      );
      const names = new Map((await tx.employee.findMany({ where: { organizationId: org, id: { in: people } }, select: { id: true, givenName: true, familyName: true, preferredName: true } })).map((e) => [e.id, nameOf(e)]));
      const byCand = new Map(cands.map((x) => [x.id, x]));
      await audit(tx, c, 'expense.card.statement.viewed', 'expense_card_statement', s.id, {});
      return {
        statement: this.head(s),
        rules,
        lines: lines.map((l) => {
          const m = l.matchedLineId ? matched.get(l.matchedLineId) : undefined;
          const gone = l.status === 'matched' && !m?.live;
          const sg = sug.get(l.id) ? byCand.get(sug.get(l.id)!)! : null;
          const hs = holdersOf(l);
          return {
            id: l.id,
            rowNo: l.rowNo,
            txnOn: iso(l.txnOn),
            description: l.description,
            merchant: l.merchant,
            amount: l.amount.toFixed(2),
            direction: l.direction,
            currency: l.currency,
            cardLast4: l.cardLast4,
            holders: hs.map((h) => ({ id: h, name: names.get(h) ?? 'Employee' })),
            status: gone ? 'open' : l.status,
            matchGone: gone,
            matchedTo: m && !gone ? { lineId: l.matchedLineId, claimId: m.claimId, text: m.text } : null,
            suggestion: sg ? { lineId: sg.id, claimId: sg.claimId, text: sg.text, amount: sg.amount, spentOn: sg.spentOn } : null,
            chasedOn: l.chasedOn ? iso(l.chasedOn) : null,
            own: Boolean(me && hs.includes(me)),
            version: l.version,
          };
        }),
        candidates: cands.map((x) => ({ lineId: x.id, claimId: x.claimId, employeeId: x.employeeId, text: x.text, amount: x.amount, currency: x.currency, spentOn: x.spentOn, payMode: x.payMode })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ finance actions

  private async lineOr404(tx: Tx, org: string, statementId: string, lineId: string, version: number) {
    const s = await tx.expenseCardStatement.findFirst({ where: { organizationId: org, id: statementId } });
    const l = s ? await tx.expenseCardLine.findFirst({ where: { organizationId: org, id: lineId, statementId } }) : null;
    if (!s || !l) throw new NotFoundException('No such card line.');
    if (s.status === 'replaced' || l.status === 'replaced') throw new ConflictException('This statement was replaced by a newer version. Open the newer one.');
    if (l.direction !== 'debit') throw new ConflictException('A refund is not matched or chased.');
    if (l.version !== version) throw new ConflictException('Someone else changed this card line. Reload the statement.');
    return { s, l };
  }

  /** Finance confirms a suggestion or picks another claim line of the card's holder. */
  async match(ctx: TenantContext, user: ScopeUser, statementId: string, lineId: string, claimLineId: string, version: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.finance(tx, org, v);
      const { s, l } = await this.lineOr404(tx, org, statementId, lineId, version);
      if (l.status === 'personal') throw new ConflictException('The employee said this was personal spend; it is being recovered from salary.');
      const target = await tx.expenseLine.findFirst({ where: { organizationId: org, id: claimLineId, removedAt: null } });
      const claim = target ? await tx.expenseClaim.findFirst({ where: { organizationId: org, id: target.claimId } }) : null;
      if (!target || !claim || !LIVE.includes(claim.status)) throw new NotFoundException('No such claim line.');
      const holders = l.employeeId ? [l.employeeId] : l.cardLast4 ? ((await this.holders(tx, org, s.bankName)).get(l.cardLast4) ?? []) : [];
      if (!holders.includes(claim.employeeId)) throw new BadRequestException('Match the line to a claim of the card holder. Link the card to the employee first.');
      if (me && claim.employeeId === me) throw new ForbiddenException('Someone else matches your own card lines.');
      if (target.payMode === 'company_paid') throw new BadRequestException('That line was paid by the company directly, not by card.');
      if (target.payMode === 'personal') {
        // Not paid twice: a personal line becomes a company-card line, only while the claim is not decided yet.
        if (!UNDECIDED.includes(claim.status)) throw new ConflictException('That line is already approved to be paid to the employee. Ask the employee instead.');
        await this.toCompanyCard(tx, c, claim.id, target.id, l.id);
      }
      try {
        await tx.expenseCardLine.update({ where: { id: l.id }, data: { status: 'matched', matchedLineId: target.id, matchedBy: v.userId, matchedAt: new Date(), employeeId: claim.employeeId, version: { increment: 1 } } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That claim line is already matched to another card line.');
        throw e;
      }
      await audit(tx, c, 'expense.card.line.matched', 'expense_card_statement', s.id, { cardLineId: l.id, claimLineId: target.id, before: l.matchedLineId, cardAmount: l.amount.toFixed(2), claimAmount: (target.receiptAmount ?? target.claimed).toFixed(2) });
      return { ok: true };
    });
  }

  /** A personal line found on the card statement becomes a company-card line (never paid to the employee). */
  private async toCompanyCard(tx: Tx, c: CompanyContext, claimId: string, lineId: string, cardLineId: string) {
    await tx.expenseLine.update({ where: { id: lineId }, data: { payMode: 'company_card', version: { increment: 1 } } });
    const sum = await tx.expenseLine.aggregate({ where: { organizationId: c.organizationId, claimId, removedAt: null, payMode: { notIn: COMPANY_PAID } }, _sum: { claimed: true } });
    await tx.expenseClaim.update({ where: { id: claimId }, data: { claimedTotal: sum._sum.claimed ?? 0, version: { increment: 1 } } });
    await audit(tx, c, 'expense.line.paid_by_card', 'expense_claim', claimId, { lineId, cardLineId });
  }

  /** "Ask employee": the card line goes to its holder to explain. */
  async chase(ctx: TenantContext, user: ScopeUser, statementId: string, lineId: string, version: number) {
    const v = await this.viewer(user);
    const tellTo = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.finance(tx, org, v);
      const { s, l } = await this.lineOr404(tx, org, statementId, lineId, version);
      if (l.status !== 'open' && !(l.status === 'matched' && !(await this.matchedTexts(tx, org, [l.matchedLineId!])).get(l.matchedLineId!)?.live)) throw new ConflictException('This line is already matched, explained or with the employee.');
      if (!l.employeeId) throw new BadRequestException(l.cardLast4 ? `Card ending ${l.cardLast4} is not linked to one employee. Link the card first.` : 'This line has no card number. Match it by hand.');
      await tx.expenseCardLine.update({ where: { id: l.id }, data: { status: 'to_chase', matchedLineId: null, chasedOn: asDate(todayIst()), remindersSent: 0, version: { increment: 1 } } });
      await audit(tx, c, 'expense.card.line.chased', 'expense_card_statement', s.id, { cardLineId: l.id, employeeId: l.employeeId });
      return this.usersOf(tx, org, [l.employeeId]);
    });
    await this.tell(ctx.organizationId!, tellTo, 'A company card line needs you to explain it');
    return { ok: true };
  }

  /** Close: every debit not matched goes to its holder; a line whose card is linked to nobody must be linked first. */
  async close(ctx: TenantContext, user: ScopeUser, statementId: string, version: number, note?: string) {
    const v = await this.viewer(user);
    const tellTo = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.finance(tx, org, v);
      const s = await tx.expenseCardStatement.findFirst({ where: { organizationId: org, id: statementId } });
      if (!s) throw new NotFoundException('No such statement.');
      if (s.status !== 'open') throw new ConflictException(s.status === 'closed' ? 'This statement is already closed.' : 'This statement was replaced by a newer version.');
      if (s.version !== version) throw new ConflictException('Someone else changed this statement. Reload it.');
      const open = await tx.expenseCardLine.findMany({ where: { organizationId: org, statementId, status: 'open', direction: 'debit' } });
      const nobody = open.filter((l) => !l.employeeId);
      if (nobody.length) throw new ConflictException({ statusCode: 409, code: 'CARDS_TO_LINK', message: `${nobody.length} ${nobody.length === 1 ? 'line has a card' : 'lines have a card'} not linked to one employee. Link the cards or match the lines first.`, lineIds: nobody.map((l) => l.id) });
      await tx.expenseCardLine.updateMany({ where: { organizationId: org, id: { in: open.map((l) => l.id) }, status: 'open' }, data: { status: 'to_chase', chasedOn: asDate(todayIst()), remindersSent: 0, version: { increment: 1 } } });
      await tx.expenseCardStatement.update({ where: { id: s.id }, data: { status: 'closed', note: note || null, closedBy: v.userId, closedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'expense.card.statement.closed', 'expense_card_statement', s.id, { chased: open.length, note: note ?? null });
      return this.usersOf(tx, org, open.map((l) => l.employeeId!));
    });
    await this.tell(ctx.organizationId!, tellTo, 'Company card lines need you to explain them');
    return { ok: true, chased: tellTo.length };
  }

  /** Registers an employee's card (bank and last 4 digits); lines of open statements with that card get the holder. */
  async linkCard(ctx: TenantContext, user: ScopeUser, dto: { employeeId: string; bankName: string; last4: string }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.finance(tx, org, v);
      const e = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId }, select: { id: true } });
      if (!e) throw new NotFoundException('No such employee.');
      const had = await tx.expenseCard.findFirst({ where: { organizationId: org, employeeId: e.id, last4: dto.last4, removedAt: null, bankName: { equals: dto.bankName, mode: 'insensitive' } } });
      if (had) throw new ConflictException('This card is already on file for this employee.');
      const card = await tx.expenseCard.create({ data: { organizationId: org, employeeId: e.id, bankName: dto.bankName, last4: dto.last4, createdBy: v.userId } });
      await audit(tx, c, 'expense.card.linked', 'expense_card', card.id, { employeeId: e.id, bankName: dto.bankName, last4: dto.last4 });
      const holders = (await this.holders(tx, org, dto.bankName)).get(dto.last4) ?? [];
      const sts = await tx.expenseCardStatement.findMany({ where: { organizationId: org, status: { not: 'replaced' }, bankName: { equals: dto.bankName, mode: 'insensitive' } }, select: { id: true } });
      // One holder: the lines are theirs. Two people with the same last 4 digits: finance matches by hand.
      const n = await tx.expenseCardLine.updateMany({ where: { organizationId: org, statementId: { in: sts.map((x) => x.id) }, cardLast4: dto.last4, status: 'open' }, data: { employeeId: holders.length === 1 ? e.id : null, version: { increment: 1 } } });
      return { id: card.id, lines: n.count };
    });
  }

  /** Employees whose name or employee code starts with the text (for linking a card). */
  async people(ctx: TenantContext, user: ScopeUser, q: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.finance(tx, org, v);
      const codes = await tx.employment.findMany({ where: { organizationId: org, employeeCode: { startsWith: q, mode: 'insensitive' }, exitedOn: null }, select: { employeeId: true }, take: 20 });
      const rows = await tx.employee.findMany({
        where: { organizationId: org, OR: [{ givenName: { startsWith: q, mode: 'insensitive' } }, { familyName: { startsWith: q, mode: 'insensitive' } }, { preferredName: { startsWith: q, mode: 'insensitive' } }, { id: { in: codes.map((x) => x.employeeId) } }] },
        select: { id: true, givenName: true, familyName: true, preferredName: true },
        take: 20,
        orderBy: { givenName: 'asc' },
      });
      const jobs = await tx.employment.findMany({ where: { organizationId: org, employeeId: { in: rows.map((r) => r.id) } }, select: { employeeId: true, employeeCode: true, exitedOn: true }, orderBy: { joinedOn: 'desc' } });
      return rows.map((r) => ({ id: r.id, name: nameOf(r), code: jobs.find((j) => j.employeeId === r.id)?.employeeCode ?? null }));
    });
  }

  // ------------------------------------------------------------------------------------------ the employee

  /** My card lines to explain, each with its best suggestion among my claim lines. */
  async mine(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.myEmployee(tx, org, v);
      const lines = await tx.expenseCardLine.findMany({ where: { organizationId: org, employeeId: me, status: 'to_chase' }, orderBy: [{ txnOn: 'asc' }, { rowNo: 'asc' }], take: 200 });
      const sts = new Map((await tx.expenseCardStatement.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.statementId))] } }, select: { id: true, bankName: true, periodFrom: true, periodTo: true } })).map((s) => [s.id, s]));
      const rules = await this.rules(tx, c);
      const dates = lines.map((l) => iso(l.txnOn)).sort();
      const cands = dates.length ? await this.candidates(tx, org, [me], dates[0], dates[dates.length - 1], rules.days) : [];
      const sug = suggestMatches(lines.map((l) => ({ id: l.id, txnOn: iso(l.txnOn), amount: l.amount.toFixed(2), currency: l.currency, direction: 'debit' as const, merchant: l.merchant ?? l.description, holders: [me] })), cands, rules);
      return {
        lines: lines.map((l) => {
          const s = sts.get(l.statementId)!;
          const sg = sug.get(l.id) ? cands.find((x) => x.id === sug.get(l.id)) : undefined;
          return { id: l.id, txnOn: iso(l.txnOn), description: l.description, merchant: l.merchant, amount: l.amount.toFixed(2), currency: l.currency, cardLast4: l.cardLast4, bankName: s.bankName, periodFrom: iso(s.periodFrom), periodTo: iso(s.periodTo), suggestion: sg ? { claimId: sg.claimId, text: sg.text } : null, version: l.version };
        }),
        recoveryInstalments: Number(await settingFor(tx, c, 'expense.card.recovery_instalments', ANY_ENTITY)),
      };
    });
  }

  /** Business: a draft company-card line on my claim (I add the receipt). Personal: recovered from my salary. */
  async explain(ctx: TenantContext, user: ScopeUser, lineId: string, choice: 'business' | 'personal', version: number) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.myEmployee(tx, org, v);
      const l = await tx.expenseCardLine.findFirst({ where: { organizationId: org, id: lineId, employeeId: me } });
      if (!l) throw new NotFoundException('No such card line.');
      if (l.status !== 'to_chase') throw new ConflictException('This line is already explained or matched.');
      if (l.version !== version) throw new ConflictException('This line changed. Reload the page.');
      const s = await tx.expenseCardStatement.findFirstOrThrow({ where: { organizationId: org, id: l.statementId } });
      const today = todayIst();
      const job = await tx.employeeAssignment.findFirst({ where: { organizationId: org, employeeId: me, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] }, orderBy: { validFrom: 'desc' }, select: { employmentId: true, legalEntityId: true } });
      if (!job) throw new ConflictException('You have no current job, so finance settles this line with you.');
      const currency = (await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: job.legalEntityId }, select: { currency: true } })).currency;
      if (l.currency !== currency) throw new ConflictException(`This line is in ${l.currency}. Add it to a claim yourself with the receipt and the rate, or ask finance.`);
      if (choice === 'personal') {
        const n = Number(await settingFor(tx, c, 'expense.card.recovery_instalments', ANY_ENTITY));
        const first = addDays(`${today.slice(0, 7)}-01`, 32).slice(0, 7);
        const loan = await this.intake.expenseLoan(tx, c, { sourceRef: `card:${l.id}`, employeeId: me, amount: l.amount.toFixed(2), instalments: n, firstMonth: first, reason: `Personal spend on the company card: ${l.description}`.slice(0, 300), by: v.userId! });
        await tx.expenseCardLine.update({ where: { id: l.id }, data: { status: 'personal', recoveryLoanId: loan.id, explainedBy: v.userId, explainedAt: new Date(), version: { increment: 1 } } });
        await audit(tx, c, 'expense.card.line.personal', 'expense_card_statement', s.id, { cardLineId: l.id, loanId: loan.id, instalments: n, firstMonth: first });
        return { choice, instalments: n, firstMonth: first, emi: loan.emi };
      }
      // A claim line of mine that matches by the company's rules is used; otherwise a new draft line.
      const rules = await this.rules(tx, c);
      const cands = await this.candidates(tx, org, [me], iso(l.txnOn), iso(l.txnOn), rules.days);
      const hit = suggestMatches([{ id: l.id, txnOn: iso(l.txnOn), amount: l.amount.toFixed(2), currency: l.currency, direction: 'debit', merchant: l.merchant ?? l.description, holders: [me] }], cands, rules).get(l.id);
      const found = hit ? cands.find((x) => x.id === hit)! : null;
      if (found) {
        if (found.payMode === 'personal') await this.toCompanyCard(tx, c, found.claimId, found.id, l.id);
        await tx.expenseCardLine.update({ where: { id: l.id }, data: { status: 'matched', matchedLineId: found.id, matchedBy: v.userId, matchedAt: new Date(), explainedBy: v.userId, explainedAt: new Date(), version: { increment: 1 } } });
        await audit(tx, c, 'expense.card.line.business', 'expense_card_statement', s.id, { cardLineId: l.id, claimId: found.claimId, lineId: found.id, existing: true });
        return { choice, claimId: found.claimId, lineId: found.id, existing: true };
      }
      const on = iso(l.txnOn);
      const title = `Company card, ${l.txnOn.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
      const claim =
        (await tx.expenseClaim.findFirst({ where: { organizationId: org, employeeId: me, status: 'draft', title } })) ??
        (await tx.expenseClaim.create({ data: { organizationId: org, employeeId: me, employmentId: job.employmentId, legalEntityId: job.legalEntityId, title, currency, createdBy: v.userId } }));
      const cats = await tx.expenseCategory.findMany({ where: { organizationId: org, active: true, kind: { in: ['spend', 'company_paid_only'] } }, select: { code: true }, orderBy: { code: 'asc' } });
      const cat = cats.find((x) => x.code === 'other') ?? cats[0];
      if (!cat) throw new ConflictException('Expenses are not set up yet: there is no expense category.');
      const lineNo = ((await tx.expenseLine.aggregate({ where: { organizationId: org, claimId: claim.id }, _max: { lineNo: true } }))._max.lineNo ?? 0) + 1;
      const line = await tx.expenseLine.create({
        data: { organizationId: org, claimId: claim.id, lineNo, categoryCode: cat.code, spentOn: l.txnOn, merchant: (l.merchant ?? l.description).slice(0, 120), payMode: 'company_card', claimed: l.amount, dupKey: dupKey(me, on, l.amount.toFixed(2)), origin: 'card', originRef: `card:${l.id}`, confirmed: false },
      });
      await tx.expenseClaim.update({ where: { id: claim.id }, data: { version: { increment: 1 } } });
      await tx.expenseCardLine.update({ where: { id: l.id }, data: { status: 'matched', matchedLineId: line.id, matchedBy: v.userId, matchedAt: new Date(), explainedBy: v.userId, explainedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'expense.card.line.business', 'expense_card_statement', s.id, { cardLineId: l.id, claimId: claim.id, lineId: line.id });
      return { choice, claimId: claim.id, lineId: line.id, existing: false };
    });
  }

  // ------------------------------------------------------------------------------------------ reminders (daily)

  async remindAll(today = todayIst()) {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM expense_card_lines WHERE status = 'to_chase'`);
    for (const { id } of orgs) await this.remindOrg(id, today).catch((e: Error) => this.logger.warn(`card reminders ${id}: ${e.message}`));
  }

  /** Reminders on the company's schedule (days after the line was sent); each one once (safe to run again). */
  async remindOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const users = await this.tenantPrisma.forTenant(c, async (tx) => {
      const raw = await settingFor(tx, c, 'expense.card.reminder_days', ANY_ENTITY);
      const plan = raw === 'off' ? [] : raw.split(',').map(Number);
      if (!plan.length) return [];
      const due: string[] = [];
      for (const l of await tx.expenseCardLine.findMany({ where: { organizationId: org, status: 'to_chase', chasedOn: { not: null }, remindersSent: { lt: plan.length } } })) {
        const days = Math.round((asDate(today).getTime() - l.chasedOn!.getTime()) / 86_400_000);
        if (days < plan[l.remindersSent]) continue;
        const n = await tx.expenseCardLine.updateMany({ where: { id: l.id, remindersSent: l.remindersSent }, data: { remindersSent: { increment: 1 } } });
        if (n.count && l.employeeId) due.push(l.employeeId);
      }
      return this.usersOf(tx, org, due);
    });
    await this.tell(org, users, 'Reminder: company card lines still need you to explain them');
    return users.length;
  }
}

/** The mapping as stored: only the fields given, trimmed. */
function clean(m: CardMappingDto): CardMapping {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(m)) if (typeof val === 'string' && val.trim()) out[k] = val.trim();
  return out as unknown as CardMapping;
}
