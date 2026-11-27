import { buildNotificationEmailFooter, escapeHtml } from './notification-email-render';

// T2-G 84b (answer 2743, GLPI 9 "notification templates per language"): the Hindi template of each self-service
// notification. A person who reads Hindi (ui-locale.ts) gets these as the email's subject and first line, with the
// notice's own detail line and link; any kind without a Hindi template keeps its English email.
// !! NEEDS A NATIVE HINDI READER BEFORE GO-LIVE !! Plain, polite (आप) standard Hindi, written by the builder.

export const HINDI_TEMPLATES: Readonly<Record<string, string>> = {
  'approval.requested': 'एक अनुरोध आपकी मंज़ूरी का इंतज़ार कर रहा है',
  'approval.approved': 'आपका अनुरोध मंज़ूर हो गया है',
  'approval.rejected': 'आपका अनुरोध मंज़ूर नहीं हुआ',
  'approval.step_skipped': 'मंज़ूरी का एक चरण छोड़ दिया गया',
  'approval.cancelled': 'मंज़ूरी का एक अनुरोध रद्द हो गया',
  'leave.reminder': 'आपकी छुट्टी के बारे में एक याद',
  'leave.holiday_added': 'आपके अवकाश कैलेंडर में एक छुट्टी जोड़ी गई',
  'leave.holiday_removed': 'आपके अवकाश कैलेंडर से एक छुट्टी हटाई गई',
  'leave.block': 'कुछ दिनों में छुट्टी नहीं ली जा सकती',
  'leave.colleague_away': 'आपको नामित करने वाले एक सहकर्मी छुट्टी पर रहेंगे (केवल तारीखें)',
  'time.roster.published': 'आने वाले दिनों की आपकी शिफ़्ट जारी हुई या बदली',
  'time.open_shift': 'एक खुली शिफ़्ट ली जा सकती है',
  'time.timesheet.line': 'आपकी टाइमशीट के घंटे मंज़ूर हुए, घटाए गए या लौटाए गए',
  'document.requested': 'HR ने आपसे एक दस्तावेज़ अपलोड करने को कहा है',
  'helpdesk.request.stage': 'आपका अनुरोध अगले चरण में पहुँच गया है',
  'helpdesk.policy.to_acknowledge': 'कंपनी की एक नीति पढ़कर स्वीकार करनी है',
};

/** The Hindi email for a notification kind (null: no Hindi template, keep the English one). */
export function hindiEmail(type: string, contextText: string | null | undefined, linkPath: string, appBaseUrl: string): { subject: string; html: string } | null {
  const line = HINDI_TEMPLATES[type];
  if (!line) return null;
  const link = `${appBaseUrl}${linkPath}`;
  const html =
    `<div lang="hi"><p>${escapeHtml(line)}</p>` +
    (contextText ? `<p>${escapeHtml(contextText)}</p>` : '') +
    `<p><a href="${escapeHtml(link)}">YukthiX में देखें</a></p></div>` +
    buildNotificationEmailFooter(appBaseUrl).replace('Manage your notification emails:', 'अपने सूचना ईमेल यहाँ बदलें:');
  return { subject: line, html };
}
