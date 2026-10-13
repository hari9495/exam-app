// M10 recruitment (M10-BUILD-DESIGN §17, founder D2): scoped YukthiX hiring keys, and the older hiring-product keys
// they stand in for. The older keys keep working; a holder of an `ats.*` key passes the matching older check too.

export const ATS_KEYS = [
  'ats.headcount.manage',
  'ats.requisition.raise',
  'ats.job.manage',
  'ats.candidate.view',
  'ats.candidate.manage',
  'ats.interview.schedule',
  'ats.assessment.view',
  'ats.offer.manage',
  'ats.offer.compensation.view',
  'ats.referral.manage',
  'ats.agency.manage',
  'ats.report.view',
  'ats.candidate.data_rights',
] as const;

/** Older key → the `ats.*` keys that satisfy it. */
export const LEGACY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'pipeline:manage': ['ats.job.manage', 'ats.candidate.manage'],
  'pipelines:configure': ['ats.job.manage'],
  'candidate:manage': ['ats.candidate.manage'],
  'candidate:view': ['ats.candidate.view', 'ats.candidate.manage'],
  'results:view': ['ats.candidate.view', 'ats.candidate.manage', 'ats.assessment.view'],
  'interview:view_assigned': ['ats.interview.schedule'],
  'candidate:data_rights': ['ats.candidate.data_rights'],
};

/** The keys to look up so that `keys` can be satisfied directly or through an alias. */
export const withAliasSources = (keys: readonly string[]) => [...new Set([...keys, ...keys.flatMap((k) => LEGACY_ALIASES[k] ?? [])])];
