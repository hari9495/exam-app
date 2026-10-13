import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { CandidateSearchService } from '../candidate-search/candidate-search.service';
import { MERGE_FIELDS, mergeBlock, type MergeChoice, type MergeField } from './talent-rules';

/**
 * Every table that points at a candidate, and how a merge treats it. The e2e test checks this list against the
 * database, so a new candidate table cannot be forgotten. 'move' re-points the rows at the kept candidate; the
 * others are handled in code below.
 */
export const CANDIDATE_TABLES = {
  agency_submissions: 'move',
  attempts: 'move',
  candidate_consents: 'move',
  candidate_emails: 'move',
  candidate_fit_assessments: 'move',
  candidate_profiles: 'resume',
  candidate_sms: 'move',
  candidate_whatsapp: 'move',
  drip_enrolments: 'unique',
  hris_export_deliveries: 'move',
  interviews: 'move',
  invitations: 'move',
  offers: 'move',
  pipeline_entries: 'unique',
  referrals: 'move',
  survey_responses: 'move',
  talent_pool_members: 'unique',
  candidate_merges: 'record',
  candidate_retention_actions: 'record',
} as const;

export interface DuplicatePair {
  a: { id: string; name: string; email: string; phone: string | null };
  b: { id: string; name: string; email: string; phone: string | null };
  reasons: ('phone' | 'name_phone' | 'resume')[];
  score: number | null;
}

// Recruitment batch AT4 (M10-BUILD-DESIGN §7.2, rule YX-ATS-50, founder D10): possible duplicates and merge.
@Injectable()
export class CandidateMergeService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly search: CandidateSearchService,
  ) {}

  /** Possible duplicates: the same phone, or the same name with the same last 10 digits, plus résumé similarity. */
  async duplicates(ctx: TenantContext): Promise<DuplicatePair[]> {
    const rows = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.$queryRaw<{ a: string; b: string; same_phone: boolean }[]>`
      SELECT x.id::text AS a, y.id::text AS b, (x.phone_e164 IS NOT NULL AND x.phone_e164 = y.phone_e164) AS same_phone
      FROM candidates x JOIN candidates y ON y.organization_id = x.organization_id AND y.id > x.id
      WHERE x.organization_id = ${c.organizationId}::uuid
        AND x.erased_at IS NULL AND y.erased_at IS NULL AND x.merged_into_id IS NULL AND y.merged_into_id IS NULL
        AND x.deleted_at IS NULL AND y.deleted_at IS NULL
        AND ((x.phone_e164 IS NOT NULL AND x.phone_e164 = y.phone_e164)
          OR (lower(btrim(x.name)) = lower(btrim(y.name)) AND right(regexp_replace(x.phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(y.phone, '[^0-9]', '', 'g'), 10)
              AND length(regexp_replace(x.phone, '[^0-9]', '', 'g')) >= 10))
      LIMIT 200`);
    const pairs = new Map<string, { a: string; b: string; reasons: Set<DuplicatePair['reasons'][number]>; score: number | null }>();
    const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (const r of rows) pairs.set(key(r.a, r.b), { a: r.a, b: r.b, reasons: new Set([r.same_phone ? 'phone' : 'name_phone']), score: null });
    for (const p of (await this.search.findDuplicates(ctx, {})).pairs) {
      const k = key(p.a.candidateId, p.b.candidateId);
      const hit = pairs.get(k) ?? { a: p.a.candidateId, b: p.b.candidateId, reasons: new Set(), score: null };
      hit.reasons.add('resume');
      hit.score = p.score;
      pairs.set(k, hit);
    }
    const ids = [...new Set([...pairs.values()].flatMap((p) => [p.a, p.b]))];
    const people = await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.candidate.findMany({ where: { organizationId: c.organizationId, id: { in: ids }, erasedAt: null, mergedIntoId: null }, select: { id: true, name: true, email: true, phone: true } }));
    const byId = new Map(people.map((p) => [p.id, p]));
    return [...pairs.values()]
      .filter((p) => byId.has(p.a) && byId.has(p.b))
      .map((p) => ({ a: byId.get(p.a)!, b: byId.get(p.b)!, reasons: [...p.reasons], score: p.score }));
  }

  /**
   * Merges `mergedId` into `keptId`. The recruiter picks, field by field, which value stays. Everything the merged
   * candidate has moves to the kept one; when both applied to the same job, the merged candidate's application is
   * closed as "Merged" and stays on the tombstone. The tombstone points at the kept candidate. Audited, never undone.
   */
  merge(ctx: TenantContext, keptId: string, mergedId: string, choices: Partial<Record<MergeField, MergeChoice>>) {
    if (keptId === mergedId) throw new BadRequestException('Pick two different candidates.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const both = await tx.candidate.findMany({ where: { organizationId: org, id: { in: [keptId, mergedId] }, deletedAt: null } });
      const kept = both.find((x) => x.id === keptId);
      const merged = both.find((x) => x.id === mergedId);
      if (!kept || !merged) throw new NotFoundException('Candidate not found.');
      if (kept.erasedAt || kept.mergedIntoId) throw new ConflictException('The candidate to keep was erased or merged already.');
      const accepted = await tx.offer.count({ where: { organizationId: org, candidateId: mergedId, status: 'accepted' } });
      const block = mergeBlock({ erasedAt: merged.erasedAt, mergedIntoId: merged.mergedIntoId, legalHoldAt: merged.legalHoldAt, acceptedOffer: accepted > 0 });
      if (block) throw new ConflictException(block);
      const pick = Object.fromEntries(MERGE_FIELDS.map((f) => [f, choices[f] ?? 'kept'])) as Record<MergeField, MergeChoice>;

      const moved: Record<string, number> = {};
      // Same job: the merged candidate's application closes as "Merged" and stays behind; the rest move.
      const keptJobs = (await tx.pipelineEntry.findMany({ where: { organizationId: org, candidateId: keptId }, select: { jobId: true } })).map((e) => e.jobId);
      const closed = await tx.pipelineEntry.updateMany({ where: { organizationId: org, candidateId: mergedId, jobId: { in: keptJobs } }, data: { archivedAt: new Date(), rejectedReason: 'Merged' } });
      moved.pipeline_entries_closed = closed.count;
      moved.pipeline_entries = (await tx.pipelineEntry.updateMany({ where: { organizationId: org, candidateId: mergedId, jobId: { notIn: keptJobs } }, data: { candidateId: keptId } })).count;
      moved.drip_enrolments = await moveExcept(tx, 'drip_enrolments', 'campaign_id', mergedId, keptId);
      moved.talent_pool_members = await moveExcept(tx, 'talent_pool_members', 'pool_id', mergedId, keptId);
      for (const [table, how] of Object.entries(CANDIDATE_TABLES)) {
        if (how !== 'move') continue;
        moved[table] = await tx.$executeRaw`UPDATE ${Prisma.raw(`"${table}"`)} SET candidate_id = ${keptId}::uuid WHERE candidate_id = ${mergedId}::uuid`;
      }
      // Custom field answers: the kept candidate's answer wins where both have one.
      moved.custom_field_values = await tx.$executeRaw`
        UPDATE custom_field_values v SET entity_id = ${keptId}::uuid
        WHERE v.organization_id = ${org}::uuid AND v.entity_type = 'candidate' AND v.entity_id = ${mergedId}::uuid
          AND NOT EXISTS (SELECT 1 FROM custom_field_values k WHERE k.organization_id = v.organization_id AND k.entity_type = 'candidate' AND k.entity_id = ${keptId}::uuid AND k.definition_id = v.definition_id)`;

      // The chosen values.
      const data: Prisma.CandidateUpdateInput = {};
      if (pick.name === 'merged') data.name = merged.name;
      if (pick.phone === 'merged') data.phone = merged.phone;
      if (Object.keys(data).length) await tx.candidate.update({ where: { id: keptId }, data });
      if (pick.resume === 'merged') {
        const src = await tx.candidateProfile.findUnique({ where: { candidateId: mergedId } });
        if (src) {
          const { id: _id, candidateId: _c, organizationId: _o, createdAt: _cr, updatedAt: _u, ...fields } = src;
          await tx.candidateProfile.upsert({ where: { candidateId: keptId }, create: { ...fields, organizationId: org, candidateId: keptId }, update: fields });
          await tx.candidateProfile.delete({ where: { candidateId: mergedId } });
        }
      } else if (!(await tx.candidateProfile.findUnique({ where: { candidateId: keptId }, select: { id: true } }))) {
        // The kept candidate has no résumé: the merged one's comes along rather than being lost.
        moved.candidate_profiles = (await tx.candidateProfile.updateMany({ where: { candidateId: mergedId }, data: { candidateId: keptId } })).count;
      }

      // The tombstone points at the kept candidate (its portal link opens the kept one) and gives up its email.
      await tx.candidate.update({ where: { id: mergedId }, data: { mergedIntoId: keptId, status: 'merged', email: `merged-${mergedId}@merged.invalid` } });
      await tx.candidateMerge.create({ data: { organizationId: org, keptId, mergedId, mergedBy: c.userId ?? null, choices: pick, moved } });
      await recomputeGlobalStage(tx, org, keptId);
      await recomputeGlobalStage(tx, org, mergedId);
      await audit(tx, c, 'ats.candidate.merged', 'candidate', keptId, { mergedId, choices: pick, moved });
      await audit(tx, c, 'ats.candidate.merged_away', 'candidate', mergedId, { keptId });
      return { keptId, mergedId, choices: pick, moved };
    });
  }

  /** Both sides of a candidate's merge history (D10: both histories show the merge). */
  history(ctx: TenantContext, candidateId: string) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) => tx.candidateMerge.findMany({ where: { organizationId: c.organizationId, OR: [{ keptId: candidateId }, { mergedId: candidateId }] }, orderBy: { mergedAt: 'desc' } }));
  }
}

/** Re-points rows whose (key, candidate) pair is free on the kept candidate; the clashing ones stay behind. */
async function moveExcept(tx: Tx, table: 'drip_enrolments' | 'talent_pool_members', key: 'campaign_id' | 'pool_id', from: string, to: string): Promise<number> {
  return tx.$executeRaw`UPDATE ${Prisma.raw(`"${table}"`)} t SET candidate_id = ${to}::uuid WHERE t.candidate_id = ${from}::uuid
    AND NOT EXISTS (SELECT 1 FROM ${Prisma.raw(`"${table}"`)} k WHERE k.candidate_id = ${to}::uuid AND k.${Prisma.raw(key)} = t.${Prisma.raw(key)})`;
}
