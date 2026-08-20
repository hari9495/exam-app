import { EventSummary, escapeMrkdwn } from './event-summary';

// Teams incoming-webhook Adaptive Card. Values live only in TextBlock/Fact string fields.
// FactSet values render as plain text in the Teams client (no markdown parsing), but Fact
// values are escaped (& < >) anyway as cheap defense-in-depth / consistency with Slack.
export function formatTeamsMessage(summary: EventSummary): object {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: summary.title, wrap: true },
            {
              type: 'FactSet',
              facts: summary.fields.map((f) => ({ title: f.label, value: escapeMrkdwn(f.value) })),
            },
          ],
          actions: [{ type: 'Action.OpenUrl', title: 'View in console', url: summary.url }],
        },
      },
    ],
  };
}
