import { EventSummary, escapeMrkdwn } from './event-summary';

// Slack Incoming Webhook body. Untrusted field values are escaped (& < >) before being
// interpolated into mrkdwn text — this neutralizes Slack's live markup: `<url|text>` links
// and `<!channel>`/`<!here>`/`<@U…>` mentions, which would otherwise render as clickable
// links / functional pings when built from attacker-controlled input (e.g. candidate name).
export function formatSlackMessage(summary: EventSummary): object {
  const fieldLines = summary.fields.map((f) => `*${f.label}:* ${escapeMrkdwn(f.value)}`).join('\n');
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
