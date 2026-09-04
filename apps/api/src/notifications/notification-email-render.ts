import type { NotificationTypeDef } from './notification-types';

export interface NotificationEmailInput {
  actorName: string | null;
  contextText: string | null;
  linkPath: string;
  appBaseUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Pure renderer: notification -> email subject + HTML. Reads no env/config —
 *  appBaseUrl is supplied by the caller (see candidate-email-render.ts for the base-URL source). */
export function renderNotificationEmail(
  typeDef: NotificationTypeDef | undefined,
  input: NotificationEmailInput,
): { subject: string; html: string } {
  const actorName = input.actorName ?? 'Someone';
  const link = `${input.appBaseUrl}${input.linkPath}`;
  const profileLink = `${input.appBaseUrl}/profile`;
  const footer = `<p style="color:#666666;font-size:12px;">Manage your notification emails: <a href="${escapeHtml(profileLink)}">${escapeHtml(profileLink)}</a></p>`;

  if (!typeDef) {
    const html =
      `<div><p>You have a new notification.</p>` +
      `<p><a href="${escapeHtml(link)}">View in app</a></p></div>` +
      footer;
    return { subject: 'You have a new notification', html };
  }

  const subject = `${actorName} — ${typeDef.label}`;
  const contextHtml = input.contextText ? `<p>${escapeHtml(input.contextText)}</p>` : '';
  const html =
    `<div>` +
    `<p>${escapeHtml(actorName)} — ${escapeHtml(typeDef.label)}</p>` +
    contextHtml +
    `<p><a href="${escapeHtml(link)}">View in app</a></p>` +
    `</div>` +
    footer;

  return { subject, html };
}
