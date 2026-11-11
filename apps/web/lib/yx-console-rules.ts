'use client';

import type { LiveRuleDetail, LiveRuleRow, RuleUpdateInput } from '@yukthix/ui/console';

// Console C-1 (answers 1041 to 1044): the rule store's paths and the copy of a version as a new draft.
export const RULES = '/statutory/rule-sets';
export const rulePath = (id: string) => `${RULES}/${encodeURIComponent(id)}`;

/** In review or sent back, newest first (the review queue). */
export const reviewQueue = (rows: LiveRuleRow[]) =>
  rows.filter((r) => r.state === 'in review' || r.state === 'changes requested').sort((a, b) => (b.sentForReviewAt ?? '').localeCompare(a.sentForReviewAt ?? ''));

/** What I may publish: in review and drafted by someone else (answer 1041). */
export const publishable = (rows: LiveRuleRow[], me: string | undefined) => rows.filter((r) => r.state === 'in review' && r.draftedBy !== me);

/** The body that drafts a copy of a version under a new version name. */
export const copyBody = (d: LiveRuleDetail, version: string): RuleUpdateInput & { statute: string; jurisdiction: string; version: string } => ({
  statute: d.statute,
  jurisdiction: d.jurisdiction,
  version,
  validFrom: d.validFrom,
  ...(d.validTo ? { validTo: d.validTo } : {}),
  values: d.values,
  source: d.source,
  lawVersion: d.lawVersion ?? 'OLD-ACT',
  verify: d.verify,
  golden: d.golden,
  changeNote: `Copied from ${d.version}.`,
});
