import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { Observable, from, switchMap } from 'rxjs';
import { TenantPrismaService } from '@exam-platform/shared';

type Tx = Prisma.TransactionClient;

// Answer 1050: while YukthiX has a company contained, its exports, bank-detail changes and payouts are held at the
// server. The holds are refused here (423, code COMPANY_CONTAINED) whatever screen or script asks.

export type Hold = 'export' | 'bank' | 'payout';

const WORDS: Record<Hold, string> = { export: 'Exports', bank: 'Bank-detail changes', payout: 'Payouts' };

export const containedError = (hold: Hold) =>
  new HttpException(
    { statusCode: 423, code: 'COMPANY_CONTAINED', hold, message: `${WORDS[hold]} are on hold: YukthiX has paused some actions to protect your company's data. Your admin has details.` },
    423,
  );

/** The company's open containment, or null (the company reads its own row; RLS). */
export function openContainment(tx: Tx, organizationId: string) {
  return tx.companyContainment.findFirst({ where: { organizationId, liftedAt: null }, select: { id: true, containedAt: true } });
}

export async function assertNotHeld(tx: Tx, organizationId: string, hold: Hold) {
  if (await openContainment(tx, organizationId)) throw containedError(hold);
}

/**
 * The routes each hold covers, by method and path (after /api/v1). Exports: every route with an export segment. Payouts:
 * making or releasing bank files and payout batches, and marking draws paid. Bank: the joiner's bank section; bank-detail
 * change requests and their approval are checked in ProfileService (the kind is in the record, not the path).
 */
export const HOLD_ROUTES: { hold: Hold; method: RegExp; path: RegExp }[] = [
  { hold: 'export', method: /^(GET|POST)$/, path: /(^|\/)exports?(\/|$)/ },
  { hold: 'export', method: /^POST$/, path: /\/journal\/export$/ },
  { hold: 'payout', method: /^POST$/, path: /^\/payroll\/(runs\/[^/]+\/bank-files|bank-files\/[^/]+\/release|runs\/[^/]+\/disbursements|payslips\/[^/]+\/expedite-bank)$/ },
  { hold: 'payout', method: /^POST$/, path: /^\/expenses\/payouts(\/[^/]+\/release)?$/ },
  { hold: 'payout', method: /^POST$/, path: /\/consultant-payouts(\/[^/]+\/release)?$/ },
  // The bank or payout file itself is a payout: it is what the bank pays from.
  { hold: 'payout', method: /^GET$/, path: /\/(expenses\/payouts|consultant-payouts)\/[^/]+\/file$/ },
  { hold: 'payout', method: /^POST$/, path: /\/ewa\/draws\/[^/]+\/paid$/ },
  { hold: 'bank', method: /^PUT$/, path: /\/sections\/bank$/ },
];

export const holdFor = (method: string, path: string): Hold | null => HOLD_ROUTES.find((r) => r.method.test(method) && r.path.test(path))?.hold ?? null;

/** Global: only a request that matches a hold route reads the company's containment (one indexed lookup). */
@Injectable()
export class ContainmentInterceptor implements NestInterceptor {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path.replace(/^\/api\/v1/, '');
    const hold = holdFor(req.method.toUpperCase(), path);
    if (!hold) return next.handle();
    const user = req.user as { organizationId?: string | null } | undefined;
    if (user?.organizationId) {
      const organizationId = user.organizationId;
      return from(this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) => assertNotHeld(tx, organizationId, hold))).pipe(switchMap(() => next.handle()));
    }
    // A joiner's portal has no staff sign-in: the company comes from the address. Only whether it is contained is read.
    const slug = path.match(/^\/portal\/join\/([^/]+)\//)?.[1];
    if (!slug) return next.handle();
    return from(
      this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
        const org = await tx.organization.findUnique({ where: { slug }, select: { id: true } });
        if (org) await assertNotHeld(tx, org.id, hold);
      }),
    ).pipe(switchMap(() => next.handle()));
  }
}
