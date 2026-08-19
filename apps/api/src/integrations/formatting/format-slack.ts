import { EventSummary } from './event-summary';

// Slack Incoming Webhook body. Untrusted values live only in `text` string fields.
export function formatSlackMessage(summary: EventSummary): object {
  const fieldLines = summary.fields.map((f) => `*${f.label}:* ${f.value}`).join('\n');
  return {
    text: summary.title,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: summary.title } },
      { type: 'section', text: { type: 'mrkdwn', text: fieldLines } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'View in console' }, url: summary.url },
        ],
      },
    ],
  };
}
