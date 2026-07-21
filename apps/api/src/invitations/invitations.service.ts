import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Candidate, Invitation } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
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

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function resolveInvitationExpiry(exam: { schedulingEnabled: boolean; availabilityWindowEnd: Date | null }): Date {
  if (exam.schedulingEnabled && exam.availabilityWindowEnd) {
    return exam.availabilityWindowEnd;
  }
  return addDays(new Date(), INVITATION_EXPIRY_DAYS);
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
  ) {}

  async bulkInvite(context: TenantContext, examId: string, candidateIds: string[]): Promise<BulkInviteResult> {
    const uniqueCandidateIds = [...new Set(candidateIds)];

    const { examTitle, createdWithCandidate, skipped } = await this.tenantPrisma.forTenant(context, async (tx) => {
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
          },
        });
        createdWithCandidate.push({ invitation, candidate });
      }

      return { examTitle: exam.title, createdWithCandidate, skipped };
    });

    // Fire-and-forget: email delivery is a notification side effect, not part of the
    // transactional outcome of inviting a candidate (the invitation + token already exist
    // in the DB and are returned below regardless of email success). Awaiting this inline
    // ties the HTTP response time to a real outbound network call (SMTP, or in dev/test,
    // Ethereal's test-account provisioning), which has been observed to take several
    // seconds on a cold start.
    for (const { invitation, candidate } of createdWithCandidate) {
      this.dispatchInvitationEmail(context, examTitle, invitation, candidate).catch((error) =>
        this.logger.error(`Failed to dispatch invitation email for candidate ${candidate.id}`, error as Error),
      );
    }

    if (createdWithCandidate.length > 0) {
      await this.audit.record(context, {
        actorUserId: null,
        action: 'invitation.created',
        entityType: 'invitation',
        metadata: { count: createdWithCandidate.length, examTitle },
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

  async list(context: TenantContext, examId: string): Promise<(Omit<Invitation, 'token'> & { candidate: Candidate; attempt: { id: string } | null })[]> {
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
          extraTimePercent: true,
          invitedAt: true,
          expiresAt: true,
          revokedAt: true,
          activeSessionFamilyId: true,
          candidate: true,
          attempt: { select: { id: true } },
        },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });
    });
  }

  async resend(context: TenantContext, invitationId: string): Promise<Invitation> {
    const { invitation, examTitle, candidate } = await this.tenantPrisma.forTenant(context, async (tx) => {
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
        data: { token: generateToken(), expiresAt: resolveInvitationExpiry(existing.exam) },
      });
      return { invitation: updated, examTitle: existing.exam.title, candidate: existing.candidate };
    });

    this.dispatchInvitationEmail(context, examTitle, invitation, candidate).catch((error) =>
      this.logger.error(`Failed to dispatch invitation email for invitation ${invitation.id}`, error as Error),
    );
    return invitation;
  }

  async updateAccommodation(context: TenantContext, invitationId: string, extraTimePercent: number): Promise<Invitation> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
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
    examTitle: string,
    invitation: Invitation,
    candidate: Candidate,
  ): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invite/${invitation.token}`;
    const organization = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.organization.findUnique({ where: { id: context.organizationId as string }, select: { logoPath: true } }),
    );
    const logoUrl = organization?.logoPath ? `${process.env.API_ORIGIN}/uploads/${organization.logoPath}` : null;
    const logoHtml = logoUrl ? `<p><img src="${logoUrl}" alt="Organization logo" height="40" /></p>` : '';
    const result = await this.emailService.send({
      to: candidate.email,
      subject: "You've been invited to an exam",
      html: `${logoHtml}<p>You have been invited to take "${examTitle}".</p><p><a href="${link}">${link}</a></p>`,
      organizationId: context.organizationId ?? undefined,
    });
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.notification.create({
        data: {
          invitationId: invitation.id,
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
        },
      }),
    );
  }
}
