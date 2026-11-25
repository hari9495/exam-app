// Sample `live` data for the HLP-01 stories of states only the real record has (known issues, an article open, the chat
// offer and WhatsApp / SMS help, no access) and for the tests. Not used by the app.
import { MY_BANNERS, RAISE_DESKS } from '../desk/data';
import { DEV_OUTBOX, MY_CHANNELS } from '../desk/esm-data';
import type { KbArticleView, KbHome } from '../desk/help-kb';
import type { MyTicketRow } from '../desk/types';
import type { LiveHelp } from './helpdesk-live';

const ok = async () => undefined;

export const HELP_HOME: KbHome = {
  spaces: [{ id: 's1', slug: 'pay-help', name: 'Pay help', categories: [{ id: 'c1', parentId: null, name: 'Payslips' }, { id: 'c2', parentId: null, name: 'Network' }] }],
  featured: [
    { id: 'a1', number: 12, title: 'Why is there loss of pay on my payslip?', summary: 'How LOP days are counted and how to raise a query.' },
    { id: 'a2', number: 14, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff with your work login.' },
  ],
  articles: [
    { id: 'a1', number: 12, title: 'Why is there loss of pay on my payslip?', summary: 'How LOP days are counted and how to raise a query.', categoryId: 'c1', spaceId: 's1' },
    { id: 'a2', number: 14, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff with your work login.', categoryId: 'c2', spaceId: 's1' },
  ],
};

export const HELP_ARTICLE: KbArticleView = { id: 'a1', number: 12, title: 'Why is there loss of pay on my payslip?', summary: 'How LOP days are counted and how to raise a query.', bodyHtml: '<p>Loss of pay is counted for days absent without approved leave. Check your attendance for the month, then raise a query if a day is wrong.</p>', language: 'en', languages: ['en', 'hi'], fallback: false, updatedAt: '2026-10-08T10:00:00Z' };

export const HELP_TICKETS: MyTicketRow[] = [
  { id: 't1', number: 'IT-1001', subject: 'VPN keeps disconnecting from home', desk: 'IT help desk', status: 'In progress', systemState: 'open', private: false, role: 'requester', createdAt: '2026-10-07T04:30:00Z', updatedAt: '2026-10-08T05:10:00Z', clock: { usedMinutes: 410, targetMinutes: 480, paused: false } },
  { id: 't5', number: 'HR-1001', subject: 'LOP on my September payslip', desk: 'HR help desk', status: 'Waiting on you', systemState: 'pending', private: true, role: 'requester', createdAt: '2026-10-07T00:30:00Z', updatedAt: '2026-10-07T00:30:00Z', clock: { usedMinutes: 300, targetMinutes: 960, paused: true } },
  { id: 't7', number: 'IT-0998', subject: 'Laptop battery drains fast', desk: 'IT help desk', status: 'Solved', systemState: 'solved', private: false, role: 'requester', createdAt: '2026-09-30T04:30:00Z', updatedAt: '2026-10-06T04:30:00Z', resolvedAt: '2026-10-06T04:30:00Z', closesOn: '2026-10-09T04:30:00Z', reopenUntil: '2099-10-13T04:30:00Z', rating: null, canRate: true, ratingReasons: ['Quick help', 'Solved my problem', 'Friendly and clear', 'Slow', 'Not solved', 'Had to explain again'] },
];

export function liveHelp(over: Partial<LiveHelp> = {}): LiveHelp {
  return {
    state: 'ready',
    onRetry: () => undefined,
    desks: RAISE_DESKS,
    tickets: HELP_TICKETS,
    onRaise: async () => ({ id: 'n1', number: 'IT-1009' }),
    onUpload: ok,
    onOpen: () => undefined,
    onRate: ok,
    kb: { home: HELP_HOME, onSearch: async () => [HELP_HOME.featured[0]], onArticle: async () => HELP_ARTICLE, onFeedback: ok, onSolved: ok },
    articleHref: (n) => `#article-${n}`,
    banners: [],
    onMeToo: ok,
    privacy: { requests: [], onAsk: ok, onDownload: ok },
    chatPrompt: null,
    channels: null,
    ...over,
  };
}

export const HELP_BANNERS = MY_BANNERS;
export const HELP_CHAT = { prompt: { text: 'Questions about your payslip? Chat with us.', desk: 'HR help desk', afterSeconds: 0 }, onChat: () => undefined, onDismiss: () => undefined };
export const HELP_CHANNELS = { channels: { ...MY_CHANNELS, devTransport: true }, onJoinCode: async () => ({ code: 'KF7Q2M9X', text: 'JOIN KF7Q2M9X', expiresInMinutes: 15 }), onUnlink: ok, dev: { outbox: DEV_OUTBOX, onSend: ok } };
