import { EventSummary } from './event-summary';

// Teams incoming-webhook Adaptive Card. Values live only in TextBlock/Fact string fields.
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
              facts: summary.fields.map((f) => ({ title: f.label, value: f.value })),
            },
          ],
          actions: [{ type: 'Action.OpenUrl', title: 'View in console', url: summary.url }],
        },
      },
    ],
  };
}
