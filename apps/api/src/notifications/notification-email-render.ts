import type { NotificationTypeDef } from './notification-types';

export interface NotificationEmailInput {
  actorName: string | null;
  contextText: string | null;
  linkPath: string;
  appBaseUrl: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shared footer, reused by callers that render their own HTML body (e.g. the approval-template
 *  render branch in notifications.service.ts) so every notification email keeps one look. */
export function buildNotificationEmailFooter(appBaseUrl: string): string {
  const profileLink = `${appBaseUrl}/profile`;
  return `<p style="color:#666666;font-size:12px;">Manage your notification emails: <a href="${escapeHtml(profileLink)}">${escapeHtml(profileLink)}</a></p>`;
}

/** Pure renderer: notification -> email subject + HTML. Reads no env/config —
 *  appBaseUrl is supplied by the caller (see candidate-email-render.ts for the base-URL source). */
export function renderNotificationEmail(
  typeDef: NotificationTypeDef | undefined,
  input: NotificationEmailInput,
): { subject: string; html: string } {
  const actorName = input.actorName ?? 'Someone';
  const link = `${input.appBaseUrl}${input.linkPath}`;
  const footer = buildNotificationEmailFooter(input.appBaseUrl);

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
