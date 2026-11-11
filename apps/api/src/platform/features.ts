import { Prisma } from '@prisma/client';
import { CompanyContext } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { SETTINGS } from '../org-structure/settings-registry';

type Tx = Prisma.TransactionClient;

/** The feature switches (answer 1049). Each guards a feature that already has a company setting. */
export const FEATURES = ['help.tours', 'help.whats_new', 'access.requests', 'policy.ai_writer'] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * The one place the app decides whether a feature is on for a company (answer 1049): off when YukthiX killed it for
 * everyone; else the company's override, or the default for every company; and, under that, the company's own setting
 * (off stays off). The screens learn it from the API answers that use this.
 */
export async function featureOn(tx: Tx, c: CompanyContext, key: Feature): Promise<boolean> {
  const flag = await tx.featureFlag.findUnique({ where: { key } });
  if (!flag) return false;
  if (flag.killedAt) return false;
  const override = await tx.featureFlagOverride.findUnique({ where: { organizationId_flagKey: { organizationId: c.organizationId, flagKey: key } } });
  if (!(override ? override.isOn : flag.defaultOn)) return false;
  if (!flag.settingKey || !(flag.settingKey in SETTINGS)) return true;
  return (await settingFor(tx, c, flag.settingKey as keyof typeof SETTINGS & string, { legalEntityId: '' })) === 'on';
}
