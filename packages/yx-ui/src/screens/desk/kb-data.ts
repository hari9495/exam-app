import { DESK } from './data';
import type { KnowledgeScreenProps } from './knowledge';
import type { BinItem, KbArticle, KbArticleRow, KbBlock, KbSpace, KbTemplate } from './kb-types';

// Sample knowledge data for stories and tests (Kaveri Foods, IT desk).

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
  publishedVersion: 1, publishedAt: '2026-09-01T09:00:00Z', publishAt: null, expiresAt: null, expiryAction: 'flag', reviewDueOn: '2027-04-01T00:00:00Z', featured: true, outdated: false, outdatedReason: null, version: 4, updatedAt: '2026-10-07T09:00:00Z',
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
/** Every prop a ready screen needs; tests and stories override what they look at. */
export const kbProps = (over: Partial<KnowledgeScreenProps> = {}): KnowledgeScreenProps => ({
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
  onLoadGaps: async () => ({ noResult: [{ query: 'vpn token', times: 7 }], noClick: [], noArticle: [{ desk: 'IT help desk', category: 'Printers', tickets: 5 }] }),
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
  onRetire: ok,
  onRepublish: ok,
  onDelete: ok,
  onFollow: ok,
  onFlag: ok,
  onSaveBlock: ok,
  onSaveTemplate: ok,
  ...over,
});
