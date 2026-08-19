import { INTEGRATION_EVENT_LABELS, IntegrationEventType } from '@exam-platform/shared';

export interface EventSummary {
  title: string;
  fields: { label: string; value: string }[];
  url: string;
}

// Optional payload keys -> field label, appended in this order when present.
const OPTIONAL_FIELDS: { key: string; label: string }[] = [
  { key: 'examTitle', label: 'Exam' },
  { key: 'roleTitle', label: 'Role' },
  { key: 'slotTime', label: 'When' },
  { key: 'score', label: 'Score' },
  { key: 'reason', label: 'Reason' },
  { key: 'source', label: 'Source' },
];

export function buildEventSummary(
  eventType: IntegrationEventType,
  payload: Record<string, unknown>,
  baseUrl: string,
): EventSummary {
  const subject = String(payload.subject ?? '');
  const fields: EventSummary['fields'] = [{ label: 'Candidate', value: subject }];
  for (const { key, label } of OPTIONAL_FIELDS) {
    const v = payload[key];
    if (v !== undefined && v !== null && String(v).length > 0) {
      fields.push({ label, value: String(v) });
    }
  }
  const path = String(payload.linkPath ?? '');
  return { title: INTEGRATION_EVENT_LABELS[eventType], fields, url: `${baseUrl}${path}` };
}
