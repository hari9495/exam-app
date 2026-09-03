import { EventSummary } from './event-summary';
import { IntegrationEventType } from '@exam-platform/shared';

// Generic webhook payload for Zapier/Make/n8n/custom consumers: raw structured JSON (no mrkdwn
// escaping — these values are JSON, not Slack markup). Fields are keyed by their label so Zapier
// can map them directly.
export function formatWebhookMessage(eventType: IntegrationEventType, summary: EventSummary): object {
  return {
    event: eventType,
    title: summary.title,
    url: summary.url,
    data: Object.fromEntries(summary.fields.map((f) => [f.label, f.value])),
  };
}
