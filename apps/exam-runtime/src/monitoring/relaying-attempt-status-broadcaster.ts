import { Injectable, Logger } from '@nestjs/common';
import { AttemptStatusBroadcaster } from './attempt-status-broadcaster';

// The internal app has no direct connection to any recruiter's WebSocket
// session — those connect to the public app's MonitoringGateway. This relays
// broadcast-worthy events back to the public app over HTTP, authenticated by
// the same shared secret as every other cross-app call in this codebase.
@Injectable()
export class RelayingAttemptStatusBroadcaster implements AttemptStatusBroadcaster {
  private readonly logger = new Logger(RelayingAttemptStatusBroadcaster.name);

  async emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): Promise<void> {
    await this.post('/api/v1/monitoring-relay/attempt-status', { examId, ...payload });
  }

  async emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): Promise<void> {
    await this.post('/api/v1/monitoring-relay/message-sent', { examId, ...payload, sentAt: payload.sentAt.toISOString() });
  }

  private async post(path: string, body: unknown): Promise<void> {
    const baseUrl = process.env.EXAM_RUNTIME_PUBLIC_URL as string;
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET as string },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      this.logger.error(`Broadcast relay call to ${path} failed with status ${response.status}`);
      throw new Error(`Broadcast relay call to ${path} failed with status ${response.status}`);
    }
  }
}
