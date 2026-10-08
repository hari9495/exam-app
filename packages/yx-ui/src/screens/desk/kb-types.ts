// Knowledge (SD-1.24, SD-1.25): the shapes the /desk/kb/* API returns (apps/api/src/service-desk/kb.service.ts).

export type KbAudience = 'agents' | 'requesters' | 'public';
export type KbLanguage = 'en' | 'hi' | 'ta' | 'te';
export type KbArticleState = 'draft' | 'in_review' | 'published' | 'retired';
export type KbVersionState = 'draft' | 'in_review' | 'approved' | 'sent_back' | 'published';

export interface KbCategory {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

export interface KbSpace {
  id: string;
  deskId: string | null;
  slug: string;
  name: string;
  audience: KbAudience;
  languages: string[];
  status: 'active' | 'off';
  version: number;
  publicUrl: string | null;
  canAuthor: boolean;
  canPublish: boolean;
  canManage: boolean;
  categories: KbCategory[];
}

export interface KbSpaceInput {
  name: string;
  slug: string;
  audience: KbAudience;
  languages: string[];
  deskId?: string;
  version?: number;
}

export interface KbArticleRow {
  id: string;
  number: number;
  spaceId: string;
  categoryId: string | null;
  title: string;
  language: string;
  translationOfId: string | null;
  state: KbArticleState;
  audience: KbAudience;
  featured: boolean;
  outdated: boolean;
  waitingReview: boolean;
  owner: string | null;
  reviewDueOn: string | null;
  reviewOverdue: boolean;
  health: number;
  updatedAt: string;
}

export interface KbVersion {
  version: number;
  title: string;
  summary: string | null;
  bodyHtml: string;
  note: string | null;
  author: string;
  mine: boolean;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  state: KbVersionState;
}

export interface KbArticle {
  id: string;
  number: number;
  spaceId: string;
  categoryId: string | null;
  slug: string;
  language: string;
  translationOfId: string | null;
  audience: KbAudience;
  state: KbArticleState;
  title: string;
  summary: string | null;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  expiryAction: 'flag' | 'hide';
  reviewDueOn: string | null;
  featured: boolean;
  outdated: boolean;
  outdatedReason: string | null;
  version: number;
  updatedAt: string;
  space: Omit<KbSpace, 'publicUrl' | 'canAuthor' | 'canPublish' | 'canManage' | 'categories'>;
  publicUrl: string | null;
  renderedHtml: string;
  owner: { id: string; name: string } | null;
  sourceTicket: { id: string; number: number } | null;
  stats: { views: number; solved: number; yes: number; no: number };
  health: number;
  reviewOverdue: boolean;
  following: boolean;
  translations: { id: string; language: string; state: KbArticleState; number: number }[];
  versions: KbVersion[];
  canAuthor: boolean;
  canPublish: boolean;
}

/** What PATCH /kb/articles/:id takes besides the article's version. Send only what changed. */
export interface KbArticleMeta {
  categoryId?: string | null;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  featured?: boolean;
  reviewDueOn?: string | null;
  publishAt?: string | null;
  expiresAt?: string | null;
  expiryAction?: 'flag' | 'hide';
  ownerUserId?: string;
}

export interface KbNewArticle {
  spaceId: string;
  title: string;
  summary?: string;
  categoryId?: string;
  language?: string;
  translationOfId?: string;
  templateId?: string;
}

export interface KbBlock {
  id: string;
  key: string;
  name: string;
  bodyHtml: string;
  version: number;
  updatedAt: string;
}

export interface KbTemplate {
  id: string;
  name: string;
  bodyHtml: string;
}

export interface KbGaps {
  noResult: { query: string; times: number }[];
  noClick: { query: string; times: number }[];
  noArticle: { desk: string; category: string | null; tickets: number }[];
}

export interface BinItem {
  id: string;
  kind: string;
  label: string;
  deskId: string | null;
  deletedAt: string;
  purgeAfter: string;
}

export interface KbFilters {
  search: string;
  state: KbArticleState | 'all';
  outdated: boolean;
}
