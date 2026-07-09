import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

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
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/force-submit`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  async reanalyze(attemptId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/reanalyze`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }

  async settleIfExpiredBatch(attemptIds: string[]): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/settle-if-expired-batch`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptIds }),
    });
    await this.throwIfNotOk(response);
  }

  async notifyMessageSent(payload: NotifyMessageSentPayload): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/monitoring/message-sent`, {
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

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const timeoutMs = process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS
      ? parseInt(process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS, 10)
      : 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      throw new ServiceUnavailableException(
        isAbort
          ? `Exam runtime internal call to ${url} timed out after ${timeoutMs}ms`
          : `Exam runtime internal call to ${url} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
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
