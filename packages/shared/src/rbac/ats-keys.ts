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
  // HIR-11 (founder answer 202): recruiting costs, for HR and recruiters.
  'ats.costs.manage',
  // Settings 6.1 Hiring (founder answer 302 and the 6.1 build): change the company's hiring settings.
  'ats.settings.manage',
  // Staffing desk slice 1 (HIR-14, HIR-15, Settings 6.2): account managers, and recruiters who read clients and bill rates.
  'ats.staffing.manage',
  'ats.staffing.view',
  // Staffing desk slice 3 (HIR-18, HIR-19): finance: client invoices, credit notes, receipts and TDS, vendor invoices.
  'ats.staffing.billing',
] as const;

// Assessments AS-0 (founder answer 2003): YukthiX keys for tests. The older exam keys keep working; a holder of an
// `asmt.*` key (company-wide) passes the matching older check too.
export const ASMT_KEYS = [
  // Write and change questions in the question bank.
  'asmt.bank.manage',
  // Build, publish and send tests.
  'asmt.test.manage',
  // Watch tests live: message, unblock, end an attempt, excuse proctoring.
  'asmt.proctor',
  // Mark answers, finish marking and release results.
  'asmt.evaluate',
  // Read test results (a Hiring manager: only candidates of their own jobs).
  'asmt.results.view',
  // The company's assessment settings (certificate template; Settings 6.5 later).
  'assessments.settings.manage',
] as const;

/** Older key → the `ats.*` keys that satisfy it. */
export const LEGACY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'pipeline:manage': ['ats.job.manage', 'ats.candidate.manage'],
  'pipelines:configure': ['ats.job.manage'],
  'candidate:manage': ['ats.candidate.manage'],
  'candidate:view': ['ats.candidate.view', 'ats.candidate.manage'],
  // Security fix (assessments audit, 13 Nov 2026): candidate view alone (the Interview coordinator) never reads test results.
  'results:view': ['ats.candidate.manage', 'ats.assessment.view', 'asmt.results.view'],
  // AS-0 (2003): the YukthiX assessment keys answer for the older exam keys.
  'exam:manage': ['asmt.test.manage'],
  'question_bank:manage': ['asmt.bank.manage'],
  'question_bank:view': ['asmt.bank.manage'],
  'interview:view_assigned': ['ats.interview.schedule'],
  'candidate:data_rights': ['ats.candidate.data_rights'],
};

/** The keys to look up so that `keys` can be satisfied directly or through an alias. */
export const withAliasSources = (keys: readonly string[]) => [...new Set([...keys, ...keys.flatMap((k) => LEGACY_ALIASES[k] ?? [])])];
