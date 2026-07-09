import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { getProctoringEventSeverity } from './proctoring-severity';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';

interface AttemptQuestionOption {
  id: string;
  text: string;
}

interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  options: AttemptQuestionOption[];
}

interface AttemptSection {
  title: string;
  questions: AttemptQuestion[];
}

interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  isMarkedForReview: boolean;
}

interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: Date;
}

interface AttemptPreviewResponse {
  exam: { title: string; instructions: string | null; durationMinutes: number };
}

interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}

export type AttemptCurrentResponse = AttemptPreviewResponse | AttemptStateResponse;

@Injectable()
export class AttemptService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}

  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        return { exam: { title: exam.title, instructions: exam.instructions, durationMinutes: exam.durationMinutes } };
      }

      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      const sections = await this.loadSections(tx, exam.id, questionIds);
      const answers = await tx.answer.findMany({ where: { attemptId: settled.id } });

      const unreadMessages = await tx.candidateMessage.findMany({ where: { attemptId: settled.id, readAt: null } });
      if (unreadMessages.length > 0) {
        await tx.candidateMessage.updateMany({ where: { attemptId: settled.id, readAt: null }, data: { readAt: new Date() } });
      }

      return {
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        sections,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          isMarkedForReview: answer.isMarkedForReview,
        })),
        messages: unreadMessages.map((message) => ({ id: message.id, body: message.body, sentAt: message.sentAt })),
      };
    });
  }

  async start(session: CandidateSession, dto: StartAttemptDto = {}): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }

      const sections = await tx.examSection.findMany({
        where: { examId: exam.id },
        orderBy: { orderIndex: 'asc' },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      });
      const questionIds = sections.flatMap((section) => section.questions.map((link) => link.questionId));

      const attempt = await tx.attempt.create({
        data: {
          invitationId: invitation.id,
          candidateId: invitation.candidateId,
          examId: exam.id,
          questionOrderJson: JSON.stringify(questionIds),
          deviceFingerprint: dto.deviceFingerprint,
        },
      });
      this.monitoringGateway.emitAttemptStatus(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        status: attempt.status,
      });
      return { id: attempt.id, status: attempt.status };
    });
  }

  async answer(
    session: CandidateSession,
    dto: AnswerDto,
  ): Promise<{ questionId: string; selectedOptionIds: string[]; isMarkedForReview: boolean }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot answer — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId }, include: { options: true } });
      this.validateSelection(question, dto.selectedOptionIds);

      const isMarkedForReview = dto.markedForReview ?? false;
      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
        create: {
          attemptId: settled.id,
          questionId: dto.questionId,
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
        },
        update: {
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
          answeredAt: new Date(),
        },
      });

      return { questionId: dto.questionId, selectedOptionIds: dto.selectedOptionIds, isMarkedForReview };
    });
  }

  async reportProctoringEvent(
    session: CandidateSession,
    dto: ReportProctoringEventDto,
  ): Promise<{ id: string; eventType: string; severity: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          eventType: dto.eventType,
          severity: getProctoringEventSeverity(dto.eventType),
          metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
        },
      });
      this.monitoringGateway.emitProctoringFlag(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      });
      return { id: event.id, eventType: event.eventType, severity: event.severity };
    });
  }

  async submit(session: CandidateSession): Promise<{ status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        return { status: settled.status };
      }

      const finalized = await this.attemptSettlement.finalize(tx, exam, settled, 'submitted');
      return { status: finalized.status };
    });
  }

  private async resolveContext(invitationId: string) {
    const invitation = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: invitationId }, include: { exam: true } }),
    );
    if (!invitation || !invitation.exam) {
      throw new UnauthorizedException('Invalid candidate session');
    }
    return { organizationId: invitation.exam.organizationId, exam: invitation.exam, invitation };
  }

  private validateSelection(question: { type: string; options: { id: string }[] }, selectedOptionIds: string[]): void {
    const validIds = new Set(question.options.map((option) => option.id));
    if (selectedOptionIds.length === 0 || !selectedOptionIds.every((id) => validIds.has(id))) {
      throw new BadRequestException('One or more selected options do not belong to this question');
    }
    if ((question.type === 'single_mcq' || question.type === 'true_false') && selectedOptionIds.length !== 1) {
      throw new BadRequestException(`Question type "${question.type}" requires exactly one selected option`);
    }
  }

  private async loadSections(tx: Prisma.TransactionClient, examId: string, questionIds: string[]): Promise<AttemptSection[]> {
    const sections = await tx.examSection.findMany({
      where: { examId },
      orderBy: { orderIndex: 'asc' },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { question: { include: { options: true } } },
        },
      },
    });
    return sections.map((section) => ({
      title: section.title,
      questions: section.questions
        .filter((link) => questionIds.includes(link.questionId))
        .map((link) => ({
          id: link.question.id,
          text: link.question.text,
          type: link.question.type,
          marks: link.question.marks,
          options: link.question.options.map((option) => ({ id: option.id, text: option.text })),
        })),
    }));
  }
}
