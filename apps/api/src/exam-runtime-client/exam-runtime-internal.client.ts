import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

interface ForceSubmitResult {
  status: string;
}

interface NotifyMessageSentPayload {
  examId: string;
  attemptId: string;
  candidateId: string;
  sentAt: Date;
}

@Injectable()
export class ExamRuntimeInternalClient {
  async forceSubmit(attemptId: string): Promise<ForceSubmitResult> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/force-submit`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  async reanalyze(attemptId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/reanalyze`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }

  async settleIfExpired(attemptId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/settle-if-expired`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }

  async notifyMessageSent(payload: NotifyMessageSentPayload): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/v1/internal/monitoring/message-sent`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await this.throwIfNotOk(response);
  }

  private baseUrl(): string {
    return process.env.EXAM_RUNTIME_INTERNAL_URL as string;
  }

  private headers(): Record<string, string> {
    return { 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET as string };
  }

  private async throwIfNotOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    const body = await response.json().catch(() => ({ message: response.statusText }));
    if (response.status === 404) {
      throw new NotFoundException(body.message);
    }
    if (response.status === 400) {
      throw new BadRequestException(body.message);
    }
    throw new InternalServerErrorException(body.message ?? 'Exam runtime internal call failed');
  }
}
