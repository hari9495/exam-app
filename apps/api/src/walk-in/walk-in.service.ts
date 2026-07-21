import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { generateToken, resolveInvitationExpiry } from '../invitations/invitations.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';

export interface WalkInExamOption {
  id: string;
  title: string;
  durationMinutes: number;
}

@Injectable()
export class WalkInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  private async resolveOrg(orgSlug: string): Promise<{ id: string }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) {
      throw new NotFoundException(`Organization "${orgSlug}" not found`);
    }
    return org;
  }

  async listExams(orgSlug: string): Promise<WalkInExamOption[]> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: { organizationId: org.id, status: 'published', walkInEnabled: true },
        select: { id: true, title: true, durationMinutes: true },
        orderBy: { title: 'asc' },
      }),
    );
  }

  async register(orgSlug: string, dto: RegisterWalkInDto): Promise<{ token: string }> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };

    const invitation = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: dto.examId, organizationId: org.id } });
      if (!exam || exam.status !== 'published' || !exam.walkInEnabled) {
        throw new BadRequestException('This exam is not currently open for walk-in registration');
      }

      const existingCandidate = await tx.candidate.findFirst({ where: { organizationId: org.id, email: dto.email } });
      const candidate = existingCandidate
        ? await tx.candidate.update({ where: { id: existingCandidate.id }, data: { name: dto.name, phone: dto.phone } })
        : await tx.candidate.create({
            data: { organizationId: org.id, email: dto.email, name: dto.name, phone: dto.phone },
          });

      const liveInvitation = await tx.invitation.findFirst({
        where: { examId: exam.id, candidateId: candidate.id, status: 'invited', expiresAt: { gt: new Date() } },
      });
      if (liveInvitation) {
        return liveInvitation;
      }
      return tx.invitation.create({
        data: {
          examId: exam.id,
          candidateId: candidate.id,
          token: generateToken(),
          expiresAt: resolveInvitationExpiry(exam),
          source: 'walk_in',
        },
      });
    });

    await this.audit.record(context, {
      actorUserId: null,
      action: 'invitation.created',
      entityType: 'invitation',
      metadata: { count: 1, source: 'walk_in' },
    });
    await this.webhooks.enqueue(org.id, 'invitation.created', {
      id: invitation.id,
      examId: invitation.examId,
      candidateId: invitation.candidateId,
      status: invitation.status,
    });

    return { token: invitation.token };
  }
}
