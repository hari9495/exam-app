import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Candidate, Invitation } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  parseBulkInviteFile,
  detectFileKind,
  MAX_BULK_INVITE_SIZE_BYTES,
  MAX_BULK_INVITE_ROWS,
  BulkInviteRowError,
} from '../candidates/bulk-invite-parser';

const INVITATION_EXPIRY_DAYS = 7;

// Long enough that the signed logo link in a sent email practically never expires before
// someone opens it -- unlike BlobStorageService's default (evidence-review) TTL, which is
// signed fresh on every live page load, this URL is baked into static HTML at send time and
// the recipient may not open the email for days or weeks. 90 days comfortably outlasts a
// scheduled exam's availability window and any realistic delay in reading an invite.
export const EMAIL_LOGO_SAS_TTL_MS = 90 * 24 * 60 * 60_000;

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function resolveInvitationExpiry(exam: { schedulingEnabled: boolean; availabilityWindowEnd: Date | null }): Date {
  if (exam.schedulingEnabled && exam.availabilityWindowEnd) {
    return exam.availabilityWindowEnd;
  }
  return addDays(new Date(), INVITATION_EXPIRY_DAYS);
}

export interface AssessmentEmailOptions {
  candidateName: string;
  examTitle: string;
  durationMinutes: number;
  /** Scheduled start shown as "Date & Time" -- pass null for unscheduled exams. */
  availabilityWindowStart: Date | null;
  startLink: string;
  logoUrl: string | null;
  organizationName: string | null;
  /** First paragraph after the greeting. Invitations say "You have been invited...",
   *  walk-in registrations say "Thanks for registering..." -- everything else
   *  (Test Details, Start button, Before You Begin, rules, footer) is identical. */
  introHtml: string;
}

/**
 * Greets a candidate by first name only. `candidate.name` holds whatever was typed at
 * invite or walk-in time -- often the full legal name -- so "Dear Narendra Bhaskar Gudapati,"
 * reads like a form letter rather than a message to a person.
 *
 * Deliberately does NOT try to interpret "Surname, First": that convention shows up in bulk
 * CSV uploads, but guessing wrong greets someone by the wrong name entirely, which is worse
 * than being slightly formal. The trailing comma is stripped so such a name still renders
 * cleanly rather than as "Dear Gudapati,,".
 *
 * Falls back to the whole trimmed string if there is no usable first token, so the greeting
 * can never come out as "Dear ,".
 */
export function firstNameOf(fullName: string): string {
  const trimmed = (fullName ?? '').trim();
  const first = trimmed.split(/\s+/)[0]?.replace(/,+$/, '') ?? '';
  return first || trimmed;
}

/** The one branded assessment-email layout, shared by recruiter invitations and
 *  walk-in registrations so candidates always get the same instructions. */
export function buildAssessmentEmailHtml(options: AssessmentEmailOptions): string {
  const logoHtml = options.logoUrl ? `<p><img src="${options.logoUrl}" alt="Organization logo" height="40" /></p>` : '';
  const scheduleHtml = options.availabilityWindowStart
    ? `<p><strong>Date &amp; Time:</strong> ${options.availabilityWindowStart.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>`
    : '';
  return (
    `${logoHtml}<p>Dear ${firstNameOf(options.candidateName)},</p>` +
    `<p>${options.introHtml}</p>` +
    `<h3>Test Details</h3>${scheduleHtml}<p><strong>Duration:</strong> ${options.durationMinutes} minutes</p>` +
    `<p><a href="${options.startLink}" style="display:inline-block;padding:10px 20px;background:#2955a3;color:#ffffff;text-decoration:none;border-radius:4px;">Start Assessment</a></p>` +
    `<h3>Before You Begin</h3><ul>` +
    `<li>Use a laptop or desktop with a working webcam - this assessment uses camera-based monitoring, so make sure your camera is enabled and unobstructed before starting.</li>` +
    `<li>Use a stable internet connection and a supported browser (Chrome or Edge recommended).</li>` +
    `<li>Find a quiet, well-lit space free of interruptions for the full duration of the test.</li></ul>` +
    `<h3>Examination Rules &amp; Guidelines</h3><ul>` +
    `<li>Stay on the test window. Switching tabs, minimizing the window, or exiting full-screen mode is detected and counted as a violation.</li>` +
    `<li>Copy, paste, and right-click are disabled during the test and are also detected as violations.</li>` +
    `<li>Extended periods of inactivity may also be flagged.</li>` +
    `<li>On your first and second violation, your exam will pause and you can resume it yourself from an on-screen prompt - no need to contact anyone.</li>` +
    `<li>On your third violation, your exam will be blocked and can only be reopened by your recruiter, so please treat the first two warnings seriously.</li>` +
    `<li>If negative marking applies to this assessment, incorrect answers may be penalized - only answer when you are confident.</li></ul>` +
    // Do NOT tell candidates to reply: this goes out from the org's configured
    // emailFromAddress, which in production is a no-reply mailbox, so replies are
    // silently discarded and a candidate in trouble gets no help.
    `<p>If you run into any issues, please contact your recruiter or the person who arranged this assessment.</p>` +
    `<p>Best regards,<br/>${options.organizationName ?? 'The Hiring Team'}</p>` +
    `<p style="color:#666666;font-size:12px;">This message was sent from an unmonitored address - please do not reply to it.</p>`
  );
}

export interface BulkInviteResult {
  created: Invitation[];
  skipped: { candidateId: string; reason: string }[];
}

export interface BulkUploadInviteResult {
  created: Invitation[];
  skipped: { email: string; reason: string }[];
  errors: BulkInviteRowError[];
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  /**
   * @param advancedFromExamId set only by "Advance to Next Round", naming the exam the
   * candidates were advanced FROM, so that exam's results table can report whether the
   * invite it triggered actually reached them. Undefined for an ordinary bulk invite.
   */
  async bulkInvite(
    context: TenantContext,
    examId: string,
    candidateIds: string[],
    advancedFromExamId?: string,
    driveSessionId?: string,
  ): Promise<BulkInviteResult> {
    const uniqueCandidateIds = [...new Set(candidateIds)];

    const { exam, createdWithCandidate, skipped } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      if (exam.status !== 'published') {
        throw new BadRequestException(`Exam ${examId} must be published before candidates can be invited`);
      }

      const candidates = await tx.candidate.findMany({
        where: { id: { in: uniqueCandidateIds }, organizationId: context.organizationId as string },
      });
      const foundIds = new Set(candidates.map((c) => c.id));
      const missingIds = uniqueCandidateIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new NotFoundException(`One or more candidates were not found in this organization: ${missingIds.join(', ')}`);
      }

      const erasedIds = candidates.filter((c) => c.erasedAt !== null).map((c) => c.id);
      if (erasedIds.length > 0) {
        throw new BadRequestException(`One or more candidates have been erased and cannot be invited: ${erasedIds.join(', ')}`);
      }

      const liveInvitations = await tx.invitation.findMany({
        where: { examId, candidateId: { in: uniqueCandidateIds }, status: 'invited', expiresAt: { gt: new Date() } },
        select: { candidateId: true },
      });
      const alreadyInvitedIds = new Set(liveInvitations.map((i) => i.candidateId));

      const createdWithCandidate: { invitation: Invitation; candidate: Candidate }[] = [];
      const skipped: { candidateId: string; reason: string }[] = [];

      for (const candidate of candidates) {
        if (alreadyInvitedIds.has(candidate.id)) {
          skipped.push({ candidateId: candidate.id, reason: 'Candidate already has a live invitation for this exam' });
          continue;
        }
        const invitation = await tx.invitation.create({
          data: {
            examId,
            candidateId: candidate.id,
            token: generateToken(),
            expiresAt: resolveInvitationExpiry(exam),
            ...(advancedFromExamId ? { advancedFromExamId } : {}),
            ...(driveSessionId ? { driveSessionId } : {}),
          },
        });
        createdWithCandidate.push({ invitation, candidate });
      }

      return { exam, createdWithCandidate, skipped };
    });

    // Fire-and-forget: email delivery is a notification side effect, not part of the
    // transactional outcome of inviting a candidate (the invitation + token already exist
    // in the DB and are returned below regardless of email success). Awaiting this inline
    // ties the HTTP response time to a real outbound network call (SMTP, or in dev/test,
    // Ethereal's test-account provisioning), which has been observed to take several
    // seconds on a cold start.
    for (const { invitation, candidate } of createdWithCandidate) {
      this.dispatchInvitationEmail(context, exam, invitation, candidate).catch((error) =>
        this.logger.error(`Failed to dispatch invitation email for candidate ${candidate.id}`, error as Error),
      );
    }

    if (createdWithCandidate.length > 0) {
      await this.audit.record(context, {
        actorUserId: null,
        action: 'invitation.created',
        entityType: 'invitation',
        metadata: { count: createdWithCandidate.length, examTitle: exam.title },
      });
      for (const { invitation } of createdWithCandidate) {
        await this.webhooks.enqueue(context.organizationId as string, 'invitation.created', {
          id: invitation.id,
          examId: invitation.examId,
          candidateId: invitation.candidateId,
          status: invitation.status,
        });
      }
    }

    return { created: createdWithCandidate.map((c) => c.invitation), skipped };
  }

  async bulkUploadAndInvite(context: TenantContext, examId: string, file: Express.Multer.File): Promise<BulkUploadInviteResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const kind = detectFileKind(file.originalname);
    if (!kind) {
      throw new BadRequestException('File must be a .csv or .xlsx file');
    }
    if (file.size > MAX_BULK_INVITE_SIZE_BYTES) {
      throw new BadRequestException('File must be 5MB or smaller');
    }

    const exam = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } }),
    );
    if (!exam) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }
    if (exam.status !== 'published') {
      throw new BadRequestException(`Exam ${examId} must be published before candidates can be invited`);
    }

    // parseBulkInviteFile parses per-row data issues (bad email, missing name) into
    // BulkInviteRowError entries, but a structurally malformed CSV (unmatched quotes,
    // etc.) makes the underlying csv-parse call throw directly instead. Without this
    // catch, that throw would escape as a plain Error and Nest's default handler would
    // turn it into an unhandled 500 rather than a clean 4xx.
    let rows: Awaited<ReturnType<typeof parseBulkInviteFile>>['rows'];
    let parseErrors: BulkInviteRowError[];
    try {
      ({ rows, errors: parseErrors } = await parseBulkInviteFile(file.buffer, kind));
    } catch (error) {
      throw new BadRequestException(`Unable to parse file: ${error instanceof Error ? error.message : 'invalid file'}`);
    }
    if (rows.length + parseErrors.length > MAX_BULK_INVITE_ROWS) {
      throw new BadRequestException(
        `File must contain at most ${MAX_BULK_INVITE_ROWS} candidates (found ${rows.length + parseErrors.length})`,
      );
    }

    const candidateIds: string[] = [];
    const emailByCandidateId = new Map<string, string>();

    await this.tenantPrisma.forTenant(context, async (tx) => {
      for (const row of rows) {
        const existing = await tx.candidate.findFirst({
          where: { organizationId: context.organizationId as string, email: row.email },
        });
        let candidateId: string;
        if (existing) {
          const updated = await tx.candidate.update({
            where: { id: existing.id },
            data: { name: row.name, phone: row.phone },
          });
          candidateId = updated.id;
        } else {
          const created = await tx.candidate.create({
            data: {
              organizationId: context.organizationId as string,
              email: row.email,
              name: row.name,
              phone: row.phone,
            },
          });
          candidateId = created.id;
        }
        candidateIds.push(candidateId);
        emailByCandidateId.set(candidateId, row.email);
      }
    });

    const inviteResult = await this.bulkInvite(context, examId, candidateIds);

    return {
      created: inviteResult.created,
      skipped: inviteResult.skipped.map((s) => ({ email: emailByCandidateId.get(s.candidateId) ?? s.candidateId, reason: s.reason })),
      errors: parseErrors,
    };
  }

  async list(
    context: TenantContext,
    examId: string,
  ): Promise<(Omit<Invitation, 'token'> & { candidate: Candidate; attempt: { id: string; status: string } | null })[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      return tx.invitation.findMany({
        where: { examId },
        select: {
          id: true,
          examId: true,
          candidateId: true,
          status: true,
          source: true,
          emailStatus: true,
          advancedFromExamId: true,
          resendCount: true,
          extraTimePercent: true,
          invitedAt: true,
          expiresAt: true,
          revokedAt: true,
          activeSessionFamilyId: true,
          driveSessionId: true,
          candidate: true,
          attempt: { select: { id: true, status: true } },
        },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });
    });
  }

  async resend(context: TenantContext, actorUserId: string, invitationId: string): Promise<Invitation> {
    const { invitation, exam, candidate } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
        include: { exam: true, candidate: true },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.status !== 'invited') {
        throw new BadRequestException(`Invitation ${invitationId} cannot be resent from status "${existing.status}"`);
      }
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          token: generateToken(),
          expiresAt: resolveInvitationExpiry(existing.exam),
          emailStatus: 'pending',
          resendCount: { increment: 1 },
        },
      });
      return { invitation: updated, exam: existing.exam, candidate: existing.candidate };
    });

    this.dispatchInvitationEmail(context, exam, invitation, candidate).catch((error) =>
      this.logger.error(`Failed to dispatch invitation email for invitation ${invitation.id}`, error as Error),
    );
    await this.audit.record(context, {
      actorUserId,
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: invitation.id,
      metadata: { examTitle: exam.title, candidateEmail: candidate.email },
    });
    return invitation;
  }

  async updateAccommodation(
    context: TenantContext,
    actorUserId: string,
    invitationId: string,
    extraTimePercent: number,
  ): Promise<Invitation> {
    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
        include: { attempt: true },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.attempt) {
        throw new BadRequestException(`Invitation ${invitationId} already has an attempt — extra time can no longer be changed`);
      }
      return tx.invitation.update({ where: { id: invitationId }, data: { extraTimePercent } });
    });
    // Fairness-sensitive: granting extra time must be auditable.
    await this.audit.record(context, {
      actorUserId,
      action: 'invitation.accommodation_updated',
      entityType: 'invitation',
      entityId: invitationId,
      metadata: { extraTimePercent },
    });
    return updated;
  }

  async revoke(context: TenantContext, actorUserId: string, invitationId: string): Promise<Invitation> {
    const { invitation, didRevoke } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.status === 'revoked') {
        return { invitation: existing, didRevoke: false };
      }
      const updated = await tx.invitation.update({ where: { id: invitationId }, data: { status: 'revoked', revokedAt: new Date() } });
      return { invitation: updated, didRevoke: true };
    });
    if (didRevoke) {
      await this.audit.record(context, {
        actorUserId,
        action: 'invitation.revoked',
        entityType: 'invitation',
        entityId: invitationId,
      });
    }
    return invitation;
  }

  private async dispatchInvitationEmail(
    context: TenantContext,
    exam: { title: string; durationMinutes: number; schedulingEnabled: boolean; availabilityWindowStart: Date | null },
    invitation: Invitation,
    candidate: Candidate,
  ): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/start?token=${invitation.token}`;
    const organization = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.organization.findUnique({ where: { id: context.organizationId as string }, select: { logoPath: true, name: true } }),
    );
    // The storage container is private -- an unsigned logoPath 403s in an email client, which
    // has no session/cookie to fall back on the way a logged-in browser tab would. Sign it with
    // a long TTL (see EMAIL_LOGO_SAS_TTL_MS) since this HTML is static from the moment it's sent.
    const logoUrl = (await this.blobStorage.signIfOurs(organization?.logoPath ?? null, EMAIL_LOGO_SAS_TTL_MS)) as string | null;
    const html = buildAssessmentEmailHtml({
      candidateName: candidate.name,
      examTitle: exam.title,
      durationMinutes: exam.durationMinutes,
      availabilityWindowStart: exam.schedulingEnabled ? exam.availabilityWindowStart : null,
      startLink: link,
      logoUrl,
      organizationName: organization?.name ?? null,
      // This is an invitation to SIT the exam. The previous wording ("Congratulations! Your
      // registration ... has been successfully completed") read as if the assessment itself
      // was already done, so candidates had no idea they still had to take it.
      introHtml: `You have been invited to take the <strong>${exam.title}</strong> assessment. Everything you need is below - use the button to begin when you are ready.`,
    });
    const result = await this.emailService.send({
      to: candidate.email,
      subject: `Your ${exam.title} assessment - invitation and instructions`,
      html,
      organizationId: context.organizationId ?? undefined,
    });
    await this.tenantPrisma.forTenant(context, async (tx) => {
      await tx.notification.create({
        data: {
          invitationId: invitation.id,
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
        },
      });
      // Settles the transient 'pending' set when the invite/resend was created -- this is
      // the only place emailStatus moves off 'pending', so the recruiter UI's "In queue"
      // badge clears once the send actually resolves, not before.
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { emailStatus: result.success ? 'sent' : 'failed' },
      });
    });
  }
}
