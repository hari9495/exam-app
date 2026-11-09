import type { BlobStorageService, TenantPrismaService } from '@exam-platform/shared';
import { careersLayout } from '../hiring/careers-rules';
import { SETTINGS } from '../org-structure/settings-registry';

export interface PublicBrand {
  orgName: string;
  orgLogo: string | null;
  careersSlug: string | null;
  accent: string | null;
  /** Careers answer 356: the company hides "Powered by YukthiX" (company setting brand.white_label, default off). */
  whiteLabel: boolean;
}

/**
 * The company's public face on the candidate pages (status, candidate page, offer, interview: careers answer 362): name,
 * logo (a signed address), careers link, accent colour and white-label. Nothing internal. Read without a tenant context
 * (the caller resolved the company from a link token).
 */
export async function publicBrand(tenantPrisma: TenantPrismaService, blob: BlobStorageService, organizationId: string): Promise<PublicBrand> {
  const ctx = { organizationId, isSuperAdmin: true };
  const { org, wl } = await tenantPrisma.forTenant(ctx, async (tx) => ({
    org: await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, logoPath: true, careersEnabled: true, careersHeadline: true, careersIntro: true, careersConfig: true } }),
    wl: await tx.setting.findFirst({ where: { organizationId, key: 'brand.white_label', scopeType: 'tenant' }, select: { value: true } }),
  }));
  if (!org) return { orgName: '', orgLogo: null, careersSlug: null, accent: null, whiteLabel: false };
  return {
    orgName: org.name,
    orgLogo: org.logoPath ? ((await blob.signIfOurs(org.logoPath)) as string | null) : null,
    careersSlug: org.careersEnabled ? org.slug : null,
    accent: careersLayout(org.careersConfig, org).accent,
    whiteLabel: (wl?.value ?? SETTINGS['brand.white_label']!.default) === 'on',
  };
}
