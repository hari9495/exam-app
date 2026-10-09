'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { KnowledgeScreen, type BinItem, type DeskSummary, type KbArticle, type KbArticleRow, type KbBlock, type KbFilters, type KbGaps, type KbSpace, type KbTemplate } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

const id = encodeURIComponent;

// Service desk › Knowledge (HLP-04, SD-1.24 / SD-1.25): spaces, articles with four-eyes review, blocks, templates,
// content gaps and the recycle bin. ?article=<id> opens an article (notices link there). The API checks every rule.
function Knowledge() {
  const router = useRouter();
  const params = useSearchParams();
  const articleId = params.get('article');
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const writer = perms.has('desk.kb.author') || perms.has('desk.kb.publish');
  const spaces = useDesk<KbSpace[]>('/kb/spaces');
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [filters, setFilters] = useState<KbFilters>({ search: '', state: 'all', outdated: false });
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setQ(filters.search.trim()), 250);
    return () => clearTimeout(h);
  }, [filters.search]);
  const article = useDesk<KbArticle>(articleId ? `/kb/articles/${id(articleId)}` : null);
  useEffect(() => {
    if (article.data && article.data.spaceId !== spaceId) setSpaceId(article.data.spaceId);
    else if (!spaceId && !articleId && spaces.data?.length) setSpaceId(spaces.data[0].id);
  }, [article.data, spaces.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = new URLSearchParams({ ...(spaceId ? { spaceId } : {}), ...(filters.state !== 'all' ? { state: filters.state } : {}), ...(filters.outdated ? { outdated: 'true' } : {}), ...(q ? { search: q } : {}) });
  const articles = useDesk<KbArticleRow[]>(spaceId ? `/kb/articles?${query}` : null, { keepPrevious: true });
  const blocks = useDesk<KbBlock[]>(writer ? '/kb/blocks' : null);
  const templates = useDesk<KbTemplate[]>(writer ? '/kb/templates' : null);
  const bin = useDesk<BinItem[]>(perms.has('desk.kb.publish') || perms.has('desk.desk.create') || perms.has('desk.settings.manage') || perms.has('desk.ticket.view') ? '/recycle-bin' : null);
  const desks = useDesk<DeskSummary[]>('/desks');
  const write = useDeskWrite();
  const open = (a: string | null) => router.replace(a ? `/yx/desk/knowledge?article=${id(a)}` : '/yx/desk/knowledge');
  // A search answers from every state, so the state and out-of-date filters are applied here too.
  const rows = (articles.data ?? []).filter((r) => (filters.state === 'all' || r.state === filters.state) && (!filters.outdated || r.outdated));
  return (
    <KnowledgeScreen
      state={deskState(spaces)}
      onRetry={() => void spaces.refetch()}
      spaces={spaces.data ?? []}
      spaceId={spaceId}
      onSelectSpace={(s) => {
        setSpaceId(s);
        if (articleId) open(null);
      }}
      canCreateSpace={perms.has('desk.desk.create') || perms.has('desk.settings.manage')}
      desks={desks.data ?? []}
      articles={rows}
      filters={filters}
      onFilters={setFilters}
      articleId={articleId}
      article={article.data ?? null}
      articleState={deskState(article)}
      onOpenArticle={open}
      blocks={writer ? (blocks.data ?? []) : null}
      templates={writer ? (templates.data ?? []) : null}
      canSeeGaps={perms.has('desk.report.view') || perms.has('desk.kb.publish')}
      canMakeTask={perms.has('desk.task.work')}
      onLoadGaps={(from, to) => apiFetch(`/desk/kb/gaps?from=${id(from)}&to=${id(to)}`, {}, token) as Promise<KbGaps>}
      onGapTask={async (deskId, text) => {
        await write('/kb/gaps/task', 'POST', { deskId, query: text.slice(0, 150) });
      }}
      bin={bin.data ?? null}
      onRestore={async (b) => {
        await write(`/recycle-bin/${id(b)}/restore`, 'POST');
      }}
      onSaveSpace={async (s, input) => {
        const r = await write<{ id: string }>(s ? `/kb/spaces/${id(s)}` : '/kb/spaces', s ? 'PATCH' : 'POST', input);
        setSpaceId(r.id);
      }}
      onSaveCategory={async (s, c, input) => {
        await write(c ? `/kb/spaces/${id(s)}/categories/${id(c)}` : `/kb/spaces/${id(s)}/categories`, c ? 'PATCH' : 'POST', input);
      }}
      onDeleteCategory={async (s, c) => {
        await write(`/kb/spaces/${id(s)}/categories/${id(c)}`, 'DELETE');
      }}
      onReorderCategories={async (s, ids) => {
        await write(`/kb/spaces/${id(s)}/categories/order`, 'PUT', { ids });
      }}
      onCreateArticle={(input) => write<{ id: string }>('/kb/articles', 'POST', input)}
      onSaveDraft={(a, input) => write<{ version: number }>(`/kb/articles/${id(a)}/versions`, 'POST', input)}
      onSubmit={async (a, version) => {
        await write(`/kb/articles/${id(a)}/submit`, 'POST', { version });
      }}
      onReview={async (a, input) => {
        await write(`/kb/articles/${id(a)}/review`, 'POST', input);
      }}
      onUpdateMeta={async (a, version, change) => {
        await write(`/kb/articles/${id(a)}`, 'PATCH', { version, ...change });
      }}
      onRetire={async (a) => {
        await write(`/kb/articles/${id(a)}/retire`, 'POST');
      }}
      onRepublish={async (a) => {
        await write(`/kb/articles/${id(a)}/republish`, 'POST');
      }}
      onDelete={async (a) => {
        await write(`/kb/articles/${id(a)}`, 'DELETE');
      }}
      onFollow={async (a, follow) => {
        await write(`/kb/articles/${id(a)}/follow`, 'POST', { follow });
      }}
      onFlag={async (a, reason) => {
        await write(`/kb/articles/${id(a)}/flag`, 'POST', { reason });
      }}
      onSaveBlock={async (b, input) => {
        await write(b ? `/kb/blocks/${id(b)}` : '/kb/blocks', b ? 'PATCH' : 'POST', input);
      }}
      onSaveTemplate={async (t, input) => {
        await write(t ? `/kb/templates/${id(t)}` : '/kb/templates', t ? 'PATCH' : 'POST', input);
      }}
      onSearchUsers={perms.has('desk.member.manage') ? (s) => apiFetch(`/desk/users?search=${id(s)}`, {}, token) : undefined}
    />
  );
}

export default function YxDeskKnowledgePage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Knowledge />
    </Suspense>
  );
}
