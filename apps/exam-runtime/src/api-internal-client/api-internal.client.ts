import { Injectable, Logger } from '@nestjs/common';

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

@Injectable()
export class ApiInternalClient {
  private readonly logger = new Logger(ApiInternalClient.name);

  private baseUrl(): string {
    return process.env.API_INTERNAL_URL as string;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET as string };
  }

  async dispatchWebhook(organizationId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl()}/internal/webhooks/dispatch`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ organizationId, eventType, data }),
      });
      if (!response.ok) {
        this.logger.warn(`Webhook dispatch call to apps/api returned status ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Webhook dispatch call to apps/api failed: ${(error as Error).message}`);
    }
  }
}
