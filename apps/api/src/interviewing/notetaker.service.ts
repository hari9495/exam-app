import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AiInvocationService } from '../ai/ai-invocation.service';
import { audit, inCompany, type CompanyContext, type Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { ScorecardsService, type Viewer } from './scorecards.service';
import { draftScorecard, type DraftItem } from './notetaker-draft.client';
import { biasAuditBlock, noticeBlock } from '../hiring/bias-audit';

export type ConsentValue = 'given' | 'declined' | 'waiting';
export interface NotetakerParticipant {
  /** 'candidate' or the panellist's user id. */
  key: string;
  name: string;
  role: 'Candidate' | 'Interviewer' | 'Hiring manager';
  consent: ConsentValue;
  /** The viewer answers for this row (their own row, or the candidate's when they may record it). */
  canAnswer: boolean;
}

/** Everyone consented: the only state in which a transcript is kept or an AI draft is made. */
export const everyoneConsented = (ps: { consent: ConsentValue }[]) => ps.length > 0 && ps.every((p) => p.consent === 'given');

// HIR-25 interview notetaker (founder decision 2). Off by default (company setting hiring.notetaker.enabled). Consent
// from every participant comes first: the candidate (recorded by a panellist or recruiter, with who recorded it) and
// each panellist (only themselves). Anyone declining, or taking consent back, means no transcript: any transcript and
// every draft for the interview are deleted at once. No recording provider is connected (provider: to decide), so a
// panellist adds the transcript (upload). The AI draft (setting hiring.notetaker.ai_draft, off) goes through the
// company's AI (AiInvocationService) and is a suggestion: the panellist confirms or changes every rating and submits
// their own scorecard (POST interviews/:id/scorecard/submit), nothing is submitted by itself. Every action is audited,
// never the transcript or the draft text. Transcripts and drafts are kept for hiring.notetaker.keep_days (default 90)
// and go with the candidate erase.
@Injectable()
export class NotetakerService {
  private readonly logger = new Logger(NotetakerService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly scorecards: ScorecardsService,
    private readonly ai: AiInvocationService,
  ) {}

  private async settings(tx: Tx, c: CompanyContext) {
    const s = (k: 'hiring.notetaker.enabled' | 'hiring.notetaker.ai_draft') => settingFor(tx, c, k, { legalEntityId: '' });
    return { enabled: (await s('hiring.notetaker.enabled')) === 'on', aiDraft: (await s('hiring.notetaker.ai_draft')) === 'on' };
  }

  /** The interview (404 for another company), the viewer's access (403 off the panel), the participants and their answers. */
  /** HIR-23 and answer 474: why the AI draft cannot run for this interview's application (bias audit, NYC notice), or null. */
  private async aiStop(tx: Tx, c: CompanyContext, entryId: string, jobId: string): Promise<string | null> {
    const tool = 'The AI draft scorecard';
    const audit = await biasAuditBlock(tx, c, jobId, tool);
    if (audit) return audit;
    const entry = await tx.pipelineEntry.findFirst({ where: { organizationId: c.organizationId, id: entryId }, select: { jobId: true, createdAt: true, alternativeRequestedAt: true } });
    return entry ? noticeBlock(tx, c, entry, tool) : null;
  }

  private async state(tx: Tx, c: CompanyContext, interviewId: string, v: Viewer) {
    const { iv, template } = await this.scorecards.load(tx, c, interviewId);
    const who = await this.scorecards.access(iv, v);
    const rows = await tx.interviewNotetakerConsent.findMany({ where: { organizationId: c.organizationId, interviewId } });
    const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: iv.panelists.map((p) => p.userId) } }, select: { id: true, name: true, email: true } });
    const answer = (key: string): ConsentValue => (rows.find((r) => r.participant === key)?.consent as ConsentValue | undefined) ?? 'waiting';
    const participants: NotetakerParticipant[] = [
      { key: 'candidate', name: iv.pipelineEntry.candidate.name, role: 'Candidate', consent: answer('candidate'), canAnswer: true },
      ...iv.panelists.map((p) => {
        const u = users.find((x) => x.id === p.userId);
        return { key: p.userId, name: u?.name || u?.email || 'A panellist', role: (p.userId === iv.pipelineEntry.job.hiringManagerId ? 'Hiring manager' : 'Interviewer') as NotetakerParticipant['role'], consent: answer(p.userId), canAnswer: p.userId === v.userId };
      }),
    ];
    return { iv, template, who, participants, ...(await this.settings(tx, c)) };
  }

  async view(ctx: TenantContext, interviewId: string, v: Viewer) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.state(tx, c, interviewId, v);
      const transcript = await tx.interviewTranscript.findUnique({ where: { interviewId }, select: { createdAt: true, uploadedBy: true, text: true, organizationId: true } });
      const by = transcript ? await tx.user.findFirst({ where: { organizationId: c.organizationId, id: transcript.uploadedBy }, select: { name: true, email: true } }) : null;
      const myDraft = s.who.isPanelist ? await tx.interviewScorecardDraft.findUnique({ where: { interviewId_panelistUserId: { interviewId, panelistUserId: v.userId } }, select: { id: true } }) : null;
      const mine = s.who.isPanelist ? await tx.scorecard.findUnique({ where: { interviewId_panelistUserId: { interviewId, panelistUserId: v.userId } }, select: { status: true } }) : null;
      return {
        enabled: s.enabled,
        aiDraft: s.aiDraft,
        // No recording or transcription provider is contracted yet: transcripts are added by a panellist.
        provider: null as string | null,
        participants: s.participants,
        recording: s.enabled && everyoneConsented(s.participants),
        isPanelist: s.who.isPanelist,
        transcript: transcript ? { addedAt: transcript.createdAt, addedBy: by?.name || by?.email || 'Someone', characters: transcript.text.length } : null,
        myDraft: Boolean(myDraft),
        submitted: mine?.status === 'submitted',
        cancelled: s.iv.status === 'cancelled',
        // HIR-23: why the AI draft cannot run for this job (NYC, bias audit overdue), shown before anyone presses Draft.
        aiBlocked: s.aiDraft ? await this.aiStop(tx, c, s.iv.pipelineEntryId, s.iv.pipelineEntry.jobId) : null,
      };
    });
  }

  /** A participant's answer: a panellist answers for themselves; the candidate's answer is recorded by the panel or a recruiter. */
  async consent(ctx: TenantContext, interviewId: string, v: Viewer, participant: 'me' | 'candidate', consent: 'given' | 'declined') {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.state(tx, c, interviewId, v);
      if (!s.enabled) throw new ConflictException('The interview notetaker is off for your company. An admin can turn it on in Settings › Hiring.');
      if (s.iv.status === 'cancelled') throw new ConflictException('This interview was cancelled.');
      if (participant === 'me' && !s.who.isPanelist) throw new ForbiddenException('Only people on the panel give their own consent.');
      const key = participant === 'me' ? v.userId : 'candidate';
      await tx.interviewNotetakerConsent.upsert({
        where: { interviewId_participant: { interviewId, participant: key } },
        create: { organizationId: c.organizationId, interviewId, participant: key, consent, recordedBy: v.userId },
        update: { consent, recordedBy: v.userId, decidedAt: new Date() },
      });
      // A "no" (also a later one) means no transcript and no drafts, at once.
      const removed = consent === 'declined' ? await this.dropRecording(tx, c.organizationId, interviewId) : 0;
      await audit(tx, c, 'ats.notetaker.consent', 'interview', interviewId, { participant: participant === 'me' ? 'panellist' : 'candidate', consent, removed });
    }).then(() => this.view(ctx, interviewId, v));
  }

  /** Deletes the interview's transcript and every draft (consent taken back, or erase). */
  private async dropRecording(tx: Tx, organizationId: string, interviewId: string) {
    const t = await tx.interviewTranscript.deleteMany({ where: { organizationId, interviewId } });
    const d = await tx.interviewScorecardDraft.deleteMany({ where: { organizationId, interviewId } });
    return t.count + d.count;
  }

  /** The manual path while no provider is connected: a panellist adds the transcript, only when everyone consented. */
  async addTranscript(ctx: TenantContext, interviewId: string, v: Viewer, text: string) {
    const body = text.replace(/\u0000/g, '').trim();
    if (!body) throw new BadRequestException('The transcript is empty.');
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.state(tx, c, interviewId, v);
      if (!s.enabled) throw new ConflictException('The interview notetaker is off for your company. An admin can turn it on in Settings › Hiring.');
      if (!s.who.isPanelist) throw new ForbiddenException('Only people on the panel add the transcript.');
      if (!everyoneConsented(s.participants)) throw new ConflictException(`No recording without everyone's consent. Waiting or declined: ${s.participants.filter((p) => p.consent !== 'given').map((p) => p.name).join(', ')}.`);
      await tx.interviewTranscript.upsert({
        where: { interviewId },
        create: { organizationId: c.organizationId, interviewId, text: body, source: 'upload', uploadedBy: v.userId },
        update: { text: body, source: 'upload', uploadedBy: v.userId, createdAt: new Date() },
      });
      // Drafts made from an earlier transcript no longer match it.
      await tx.interviewScorecardDraft.deleteMany({ where: { organizationId: c.organizationId, interviewId } });
      await audit(tx, c, 'ats.notetaker.transcript_added', 'interview', interviewId, { characters: body.length });
    });
    return this.view(ctx, interviewId, v);
  }

  /** The panellist's AI draft from the consented transcript (a suggestion; nothing is submitted). */
  async draft(ctx: TenantContext, interviewId: string, v: Viewer) {
    const input = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.state(tx, c, interviewId, v);
      if (!s.enabled || !s.aiDraft) throw new ConflictException('AI drafting is off for your company. Fill the scorecard yourself.');
      if (!s.who.isPanelist) throw new ForbiddenException('Only people on the panel draft their own scorecard.');
      if (!everyoneConsented(s.participants)) throw new ConflictException("No AI notes without everyone's consent. Fill the scorecard yourself.");
      if (!s.template?.items.length) throw new ConflictException('No scorecard is set for this interview. Ask the recruiter to pick one.');
      const mine = await tx.scorecard.findUnique({ where: { interviewId_panelistUserId: { interviewId, panelistUserId: v.userId } }, select: { status: true } });
      if (mine?.status === 'submitted') throw new ConflictException('You already submitted this scorecard; it cannot change.');
      const t = await tx.interviewTranscript.findUnique({ where: { interviewId }, select: { text: true } });
      if (!t) throw new ConflictException('Add the transcript first.');
      // HIR-23: a New York City job with the bias audit overdue gets no AI draft (a plain refusal, never a silent skip).
      const blocked = await this.aiStop(tx, c, s.iv.pipelineEntryId, s.iv.pipelineEntry.jobId);
      if (blocked) throw new ConflictException(`${blocked} Fill the scorecard yourself.`);
      return { jobTitle: s.iv.pipelineEntry.job.title, scaleMax: s.template.scaleMax, skills: s.template.items.map((i) => ({ id: i.id, label: i.label, guidance: i.guidance })), transcript: t.text };
    });
    let items: DraftItem[];
    try {
      items = await this.ai.run(ctx, { source: 'interview_draft', sourceId: interviewId }, (p) => draftScorecard(input, p));
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ForbiddenException || (e as { status?: number }).status === 429) throw e;
      this.logger.warn(`notetaker draft for ${interviewId}: ${(e as Error).message}`);
      throw new BadGatewayException('The AI draft did not work. Try again, or fill the scorecard yourself.');
    }
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await tx.interviewScorecardDraft.upsert({
        where: { interviewId_panelistUserId: { interviewId, panelistUserId: v.userId } },
        create: { organizationId: c.organizationId, interviewId, panelistUserId: v.userId, items: items as unknown as Prisma.InputJsonValue },
        update: { items: items as unknown as Prisma.InputJsonValue, createdAt: new Date() },
      });
      await audit(tx, c, 'ats.notetaker.drafted', 'interview', interviewId, { ratings: items.length });
    });
    return this.myDraft(ctx, interviewId, v);
  }

  /** The panellist's own draft (nobody else's): the review page. */
  async myDraft(ctx: TenantContext, interviewId: string, v: Viewer) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.state(tx, c, interviewId, v);
      if (!s.who.isPanelist) throw new ForbiddenException('Only people on the panel draft their own scorecard.');
      const d = await tx.interviewScorecardDraft.findUnique({ where: { interviewId_panelistUserId: { interviewId, panelistUserId: v.userId } } });
      if (!d) throw new NotFoundException('There is no draft for you on this interview.');
      return { interviewId, candidate: s.iv.pipelineEntry.candidate.name, jobTitle: s.iv.pipelineEntry.job.title, scaleMax: s.template?.scaleMax ?? 5, items: d.items as unknown as DraftItem[], createdAt: d.createdAt };
    });
  }
}

/**
 * HIR-25 retention: transcripts and drafts older than the company's days (hiring.notetaker.keep_days, default 90) are
 * deleted, for every company (run daily with the candidate retention sweep). Returns how many rows went.
 */
export async function purgeNotetaker(tx: Tx, now: Date): Promise<number> {
  const days = (table: string) => Prisma.sql`DELETE FROM ${Prisma.raw(table)} t WHERE t.created_at < ${now}::timestamptz - make_interval(days => COALESCE(
      (SELECT (s.value #>> '{}')::int FROM settings s WHERE s.organization_id = t.organization_id AND s.key = 'hiring.notetaker.keep_days' AND s.scope_type = 'tenant' LIMIT 1), 90))`;
  return (await tx.$executeRaw(days('interview_transcripts'))) + (await tx.$executeRaw(days('interview_scorecard_drafts')));
}
