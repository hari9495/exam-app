import { DESK } from '../desk/data';
import type { BinItem, KbArticle, KbArticleRow, KbBlock, KbSpace, KbTemplate } from '../desk/kb-types';
import type { LiveKb } from './helpdesk-kb-live';

// Sample `live` data for the HLP-04 stories of states the real knowledge base has (Kaveri Foods, IT desk) and for the
// tests. Not used by the app.

export const KB_SPACES: KbSpace[] = [
  {
    id: 'sp1', deskId: 'd-it', slug: 'it-help', name: 'IT help', audience: 'requesters', languages: ['en', 'hi'], status: 'active', version: 1, publicUrl: null, canAuthor: true, canPublish: true, canManage: true,
    categories: [
      { id: 'c1', parentId: null, name: 'Laptops', sortOrder: 0 },
      { id: 'c2', parentId: null, name: 'Network', sortOrder: 1 },
      { id: 'c3', parentId: 'c2', name: 'Wi-Fi', sortOrder: 0 },
    ],
  },
  { id: 'sp2', deskId: null, slug: 'help', name: 'Kaveri help centre', audience: 'public', languages: ['en'], status: 'active', version: 2, publicUrl: 'https://yukthix.example/yx/help/kaveri/help', canAuthor: true, canPublish: false, canManage: false, categories: [] },
];

export const KB_ROWS: KbArticleRow[] = [
  { id: 'a1', number: 12, spaceId: 'sp1', categoryId: 'c3', title: 'Wi-Fi keeps dropping', language: 'en', translationOfId: null, state: 'published', audience: 'requesters', featured: true, outdated: false, waitingReview: true, owner: 'Suresh Pillai', reviewDueOn: '2027-04-01T00:00:00Z', reviewOverdue: false, health: 78, updatedAt: '2026-10-07T09:00:00Z' },
  { id: 'a2', number: 14, spaceId: 'sp1', categoryId: 'c1', title: 'Reset your laptop password', language: 'en', translationOfId: null, state: 'draft', audience: 'requesters', featured: false, outdated: true, waitingReview: false, owner: 'Farah Khan', reviewDueOn: '2026-09-01T00:00:00Z', reviewOverdue: true, health: 31, updatedAt: '2026-10-06T09:00:00Z' },
];

export const KB_ARTICLE: KbArticle = {
  id: 'a1', number: 12, spaceId: 'sp1', categoryId: 'c3', slug: 'wi-fi-keeps-dropping', language: 'en', translationOfId: null, audience: 'requesters', state: 'published',
  title: 'Wi-Fi keeps dropping', summary: 'What to try when the office Wi-Fi drops.', bodyHtml: '<p>Forget the network and join again.</p>', seoTitle: null, seoDescription: null,
  publishedVersion: 1, publishedAt: '2026-09-01T09:00:00Z', publishAt: null, expiresAt: null, expiryAction: 'flag', reviewDueOn: '2027-04-01T00:00:00Z', featured: true, outdated: false, outdatedReason: null, keywords: 'wifi, wireless, network drops', assistantUse: true, version: 4, updatedAt: '2026-10-07T09:00:00Z',
  space: { id: 'sp1', deskId: 'd-it', slug: 'it-help', name: 'IT help', audience: 'requesters', languages: ['en', 'hi'], status: 'active', version: 1 },
  publicUrl: null, renderedHtml: '<p>Forget the network and join again.</p>', owner: { id: 'u1', name: 'Suresh Pillai' }, sourceTicket: { id: 't1', number: 1004 },
  stats: { views: 120, solved: 6, yes: 14, no: 2 }, health: 78, reviewOverdue: false, following: false, translations: [],
  versions: [
    { version: 2, title: 'Wi-Fi keeps dropping', summary: 'What to try when the office Wi-Fi drops.', bodyHtml: '<p>Forget the network, then join <b>Kaveri-Staff</b> again.</p>', note: 'New network name', author: 'Farah Khan', mine: false, submittedAt: '2026-10-07T09:00:00Z', reviewedBy: null, reviewedAt: null, reviewNote: null, publishedAt: null, createdAt: '2026-10-07T08:00:00Z', state: 'in_review' },
    { version: 1, title: 'Wi-Fi keeps dropping', summary: null, bodyHtml: '<p>Forget the network and join again.</p>', note: null, author: 'Suresh Pillai', mine: true, submittedAt: '2026-08-30T09:00:00Z', reviewedBy: 'Farah Khan', reviewedAt: '2026-09-01T09:00:00Z', reviewNote: null, publishedAt: '2026-09-01T09:00:00Z', createdAt: '2026-08-30T08:00:00Z', state: 'published' },
  ],
  canAuthor: true, canPublish: true,
};

export const KB_BLOCKS: KbBlock[] = [{ id: 'b1', key: 'contact-it', name: 'Contact IT', bodyHtml: '<p>Still stuck? Call 4040.</p>', version: 1, updatedAt: '2026-10-01T09:00:00Z' }];
export const KB_TEMPLATES: KbTemplate[] = [{ id: 'tp1', name: 'How-to', bodyHtml: '<h2>Before you start</h2><h2>Steps</h2>' }];
export const KB_BIN: BinItem[] = [{ id: 'bin1', kind: 'kb_article', label: 'KB-9 Old VPN guide', deskId: 'd-it', deletedAt: '2026-10-05T09:00:00Z', purgeAfter: '2026-11-04T09:00:00Z' }];

const ok = async () => {};
/** Every `live` field a ready page needs; tests and stories override what they look at. */
export const liveKb = (over: Partial<LiveKb> = {}): LiveKb => ({
  state: 'ready',
  spaces: KB_SPACES,
  spaceId: 'sp1',
  onSelectSpace: () => {},
  canCreateSpace: true,
  desks: [DESK],
  articles: KB_ROWS,
  filters: { search: '', state: 'all', outdated: false },
  onFilters: () => {},
  articleId: null,
  article: null,
  onOpenArticle: () => {},
  blocks: KB_BLOCKS,
  templates: KB_TEMPLATES,
  canSeeGaps: true,
  canMakeTask: true,
  onLoadGaps: async () => ({ noResult: [{ query: 'vpn token', times: 7 }], noClick: [], noArticle: [{ desk: 'IT help desk', category: 'Printers', tickets: 5 }], ledToTickets: [{ articleId: 'a12', number: 12, title: 'Connect to the office VPN from home', tickets: 4 }], searchesToTickets: [{ query: 'form 16 not visible', tickets: 3 }, { query: 'gratuity', tickets: 1 }] }),
  onGapTask: ok,
  bin: KB_BIN,
  onRestore: ok,
  onSaveSpace: ok,
  onSaveCategory: ok,
  onDeleteCategory: ok,
  onReorderCategories: ok,
  onCreateArticle: async () => ({ id: 'a9' }),
  onSaveDraft: async () => ({ version: 3 }),
  onSubmit: ok,
  onReview: ok,
  onUpdateMeta: ok,
  onMarkReviewed: async () => ({ reviewDueOn: '2027-10-29' }),
  onRetire: ok,
  onRepublish: ok,
  onDelete: ok,
  onFollow: ok,
  onFlag: ok,
  onSaveBlock: ok,
  onSaveTemplate: ok,
  ...over,
});

/** The same article as its own author sees it before anyone reviewed it (a draft, no publish rights). */
export const KB_DRAFT: KbArticle = {
  ...KB_ARTICLE,
  id: 'a2', number: 14, state: 'draft', title: 'Reset your laptop password', publishedVersion: null, publishedAt: null, featured: false, keywords: null, reviewDueOn: null, sourceTicket: null,
  stats: { views: 0, solved: 0, yes: 0, no: 0 }, health: 50, canPublish: false,
  versions: [{ version: 1, title: 'Reset your laptop password', summary: null, bodyHtml: '<p>Press Ctrl + Alt + Del, then Change a password.</p>', note: null, author: 'Farah Khan', mine: true, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null, publishedAt: null, createdAt: '2026-10-06T08:00:00Z', state: 'draft' }],
};
/** Published, its review date passed (YX-GRO-07: checked every 12 months). */
export const KB_REVIEW_DUE: KbArticle = { ...KB_ARTICLE, reviewDueOn: '2026-09-01T00:00:00Z', reviewOverdue: true, health: 52, versions: KB_ARTICLE.versions.slice(1) };
export const openKb = (article: KbArticle, over: Partial<LiveKb> = {}): LiveKb => liveKb({ articleId: article.id, article, ...over });
