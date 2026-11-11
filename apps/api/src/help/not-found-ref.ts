import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

// Answer 947: a short reference on every Not found answer, that support can look up (who, when, which address). It is
// written in the asking person's own company with only what they asked for, so it reads the same whether the record is
// missing or belongs to another company: it never says whether anything exists.

// No 0/O or 1/I: read out over the phone without mistakes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NOT_FOUND_CODE = /^NF-[A-HJ-NP-Z2-9]{6}$/;

export const newNotFoundCode = () => `NF-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

/** The address as asked, without the query (search words stay out of the record), at most 300 characters. */
export const refPath = (url: string) => (url.split('?')[0] ?? '').slice(0, 300) || '/';

/**
 * Saves a reference for this person in their company and returns it. Answer 974: kept for the company's
 * help.not_found.keep_days (90 by default), then deleted nightly by NotFoundRetentionService.
 */
export async function mintNotFoundRef(tenantPrisma: TenantPrismaService, ctx: TenantContext, path: string): Promise<string | null> {
  if (!ctx.organizationId) return null;
  for (let tries = 0; tries < 3; tries++) {
    const code = newNotFoundCode();
    try {
      await tenantPrisma.forTenant(ctx, (tx) => tx.notFoundRef.create({ data: { organizationId: ctx.organizationId!, code, userId: ctx.userId ?? null, path: refPath(path) } }));
      return code;
    } catch (e) {
      // A clash with an earlier code in this company: draw again.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  }
  return null;
}
