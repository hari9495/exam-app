// HLP-04 Knowledge base editor, live (Helpdesk design wiring, round 4): the designed KbEditorScreen in helpdesk.tsx
// renders this when the page passes `live`. An open article takes the design's layout (header with the status and
// Preview / Save draft / Publish, the review-due banner, title and answer, the "Where it shows", "How it's doing" and
// "Versions" rail); the list of articles and the knowledge set-up (spaces, categories, blocks, templates, content gaps,
// recycle bin) are drawn in the same look. Four eyes: an author sends a version for review, a publisher who did not
// write it publishes it. The server checks every rule again; article text is cleaned by its allow-list.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Plus } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { PageBanner, useToast } from '../../components/notify';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { RichTextEditor, STYLE_TOOLS } from '../../components/editor';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { Breadcrumbs, Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { MessageBody, when } from '../desk/desk-kit';
import type { DeskSummary, LoadState } from '../desk/types';
import type { BinItem, KbArticle, KbArticleMeta, KbArticleRow, KbArticleState, KbAudience, KbBlock, KbCategory, KbFilters, KbGaps, KbNewArticle, KbSpace, KbSpaceInput, KbTemplate, KbVersion, KbVersionState } from '../desk/kb-types';
import { Facts, OpsDesk, Workspace } from './ops-kit';

export const AUDIENCE_LABEL: Record<KbAudience, string> = { agents: 'Agents only', requesters: 'People who ask this desk', public: 'Public help centre' };
const LANGUAGE_LABEL: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu' };
const LANGUAGES = ['en', 'hi', 'ta', 'te'];
export const ARTICLE_STATE_LABEL: Record<KbArticleState, string> = { draft: 'Draft', in_review: 'Waiting for review', published: 'Published', retired: 'Retired' };
const ARTICLE_TONE: Record<KbArticleState, BadgeTone> = { draft: 'neutral', in_review: 'warning', published: 'success', retired: 'neutral' };
export const VERSION_STATE_LABEL: Record<KbVersionState, string> = { draft: 'Draft', in_review: 'Waiting for review', approved: 'Approved, waits for its publish time', sent_back: 'Sent back', published: 'Published' };
const VERSION_TONE: Record<KbVersionState, BadgeTone> = { draft: 'neutral', in_review: 'warning', approved: 'info', sent_back: 'danger', published: 'success' };
const healthTone = (n: number): BadgeTone => (n >= 70 ? 'success' : n >= 40 ? 'warning' : 'danger');
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ARTICLE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const KEYWORDS = /^[\p{L}\p{M}\p{N} ,'&/-]*$/u;
/** Help H-1: app addresses such as /yx/time/leave, separated with commas (up to 20). */
const PAGE = /^\/yx(\/[a-z0-9][a-z0-9-]*){0,8}$/;
export const pagesOf = (text: string) => [...new Set(text.split(',').map((p) => p.trim().replace(/\/+$/, '')).filter(Boolean))];
export const pagesProblem = (text: string) => {
  const list = pagesOf(text);
  if (list.length > 20) return 'At most 20 pages.';
  const bad = list.find((p) => !PAGE.test(p));
  return bad ? `${bad} is not an app address. Use one like /yx/time/leave.` : null;
};
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const dateText = (iso: string | null) => (iso ? formatDate(new Date(`${iso.slice(0, 10)}T00:00:00`)) : '—');
/** ISO time → the value of an <input type="datetime-local"> in this browser's time zone. */
const localInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** The tree in reading order: each category, then its sections, then their sub-sections. */
export function categoryTree(cats: KbCategory[]): { cat: KbCategory; depth: number; path: string }[] {
  const out: { cat: KbCategory; depth: number; path: string }[] = [];
  const walk = (parentId: string | null, depth: number, path: string) => {
    for (const c of cats.filter((x) => x.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      const p = path ? `${path} › ${c.name}` : c.name;
      out.push({ cat: c, depth, path: p });
      if (depth < 2) walk(c.id, depth + 1, p);
    }
  };
  walk(null, 0, '');
  return out;
}

/** The status the design's header shows: review due wins over published. */
export function articleStatus(a: Pick<KbArticle, 'state' | 'reviewOverdue'>): { label: string; tone: BadgeTone } {
  if (a.state === 'published' && a.reviewOverdue) return { label: 'Review due', tone: 'warning' };
  return { label: ARTICLE_STATE_LABEL[a.state], tone: ARTICLE_TONE[a.state] };
}

export type KbTab = 'articles' | 'categories' | 'blocks' | 'templates' | 'gaps' | 'search-words' | 'bin';
export type KbDialog = 'new-article' | 'new-space' | 'edit-space' | 'preview' | 'compare' | 'details' | 'publish' | 'send-back' | 'flag' | 'delete';

export interface LiveKb {
  state: LoadState;
  onRetry?: () => void;
  spaces: KbSpace[];
  spaceId: string | null;
  onSelectSpace: (id: string) => void;
  /** desk.desk.create (company-wide spaces) or desk.settings.manage (spaces of the desks one runs). */
  canCreateSpace: boolean;
  desks: DeskSummary[];
  articles: KbArticleRow[];
  articlesState?: 'ready' | 'loading' | 'error';
  filters: KbFilters;
  onFilters: (f: KbFilters) => void;
  articleId: string | null;
  article: KbArticle | null;
  articleState?: LoadState;
  onOpenArticle: (id: string | null) => void;
  /** null: this person cannot read blocks / templates (authors and publishers only). */
  blocks: KbBlock[] | null;
  templates: KbTemplate[] | null;
  /** desk.report.view or desk.kb.publish. */
  canSeeGaps: boolean;
  /** desk.task.work. */
  canMakeTask: boolean;
  onLoadGaps: (from: string, to: string) => Promise<KbGaps>;
  onGapTask: (deskId: string, query: string) => Promise<void>;
  /**
   * Answers 1642, 1681: the company's search words that mean the same, on their own tab (the company's Service Desk
   * owner, desk.desk.create); null or absent: not shown.
   */
  searchWords?: { value: string; starter: string; onSave: (text: string) => Promise<unknown> } | null;
  /** null: no recycle bin for this person. */
  bin: BinItem[] | null;
  onRestore: (id: string) => Promise<void>;
  onSaveSpace: (id: string | null, input: KbSpaceInput) => Promise<void>;
  onSaveCategory: (spaceId: string, id: string | null, input: { name: string; parentId?: string; sortOrder?: number }) => Promise<void>;
  onDeleteCategory: (spaceId: string, id: string) => Promise<void>;
  onReorderCategories: (spaceId: string, ids: string[]) => Promise<void>;
  onCreateArticle: (input: KbNewArticle) => Promise<{ id: string }>;
  onSaveDraft: (id: string, input: { title: string; summary?: string; bodyHtml: string; note?: string; version: number }) => Promise<{ version: number }>;
  onSubmit: (id: string, version: number) => Promise<void>;
  onReview: (id: string, input: { version: number; approve: boolean; note?: string }) => Promise<void>;
  onUpdateMeta: (id: string, version: number, change: KbArticleMeta) => Promise<void>;
  onMarkReviewed: (id: string, version: number) => Promise<{ reviewDueOn: string }>;
  onRetire: (id: string) => Promise<void>;
  onRepublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onFollow: (id: string, follow: boolean) => Promise<void>;
  onFlag: (id: string, reason: string) => Promise<void>;
  onSaveBlock: (id: string | null, input: { key: string; name: string; bodyHtml: string; version?: number }) => Promise<void>;
  onSaveTemplate: (id: string | null, input: { name: string; bodyHtml: string }) => Promise<void>;
  /** Colleagues to make owner (offered when given). */
  onSearchUsers?: (q: string) => Promise<{ id: string; name: string | null; email: string }[]>;
  ticketHref?: (id: string) => string;
  /** Stories and tests only: what is open on first render. */
  start?: { tab?: KbTab; dialog?: KbDialog; compare?: number };
}

export function LiveKbEditor({ live }: { live: LiveKb }) {
  if (live.state === 'no-access')
    return (
      <OpsDesk area="helpdesk" active="Knowledge base">
        <PageHeader title="Knowledge base" />
        <NoAccessState what="the knowledge base" grantedBy="your Service Desk admin" note="Agents read and write articles; publishers check them before they go live." />
      </OpsDesk>
    );
  if (live.state === 'loading' || live.state === 'error')
    return (
      <OpsDesk area="helpdesk" active="Knowledge base">
        <PageHeader title="Knowledge base" />
        {live.state === 'loading' ? (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading the knowledge base">
            <Skeleton height={48} />
            <Skeleton height={240} />
          </div>
        ) : (
          <ErrorState title="We couldn't load the knowledge base." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
        )}
      </OpsDesk>
    );
  return live.articleId ? <ArticlePage live={live} /> : <KbHome live={live} />;
}

// ---------------------------------------------------------------- the knowledge base: articles and set-up

function KbHome({ live }: { live: LiveKb }) {
  const [tab, setTab] = useState<KbTab>(live.start?.tab ?? 'articles');
  const [dialog, setDialog] = useState<KbDialog | null>(live.start?.dialog ?? null);
  const space = live.spaces.find((s) => s.id === live.spaceId) ?? null;
  const writer = live.blocks !== null;
  const canPublishSomewhere = live.spaces.some((s) => s.canPublish);
  return (
    <OpsDesk area="helpdesk" active="Knowledge base">
      <PageHeader
        title="Knowledge base"
        description="Answers for your agents and the people you help. A second person checks every change before it goes live."
        facts={space ? `${live.articles.length} ${live.articles.length === 1 ? 'article' : 'articles'} in ${space.name} · ${AUDIENCE_LABEL[space.audience]}` : undefined}
        actions={
          <>
            {live.canCreateSpace && (
              <Button icon={Plus} onClick={() => setDialog('new-space')}>
                New space
              </Button>
            )}
            {space?.canAuthor && (
              <Button variant="primary" icon={Plus} onClick={() => setDialog('new-article')}>
                New article
              </Button>
            )}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as KbTab)}>
        <TabsList aria-label="Knowledge base">
          <TabsTrigger value="articles">Articles</TabsTrigger>
          {space && (space.canPublish || space.canManage) && <TabsTrigger value="categories">Categories</TabsTrigger>}
          {writer && <TabsTrigger value="blocks">Blocks</TabsTrigger>}
          {writer && <TabsTrigger value="templates">Templates</TabsTrigger>}
          {live.canSeeGaps && <TabsTrigger value="gaps">Content gaps</TabsTrigger>}
          {live.searchWords && <TabsTrigger value="search-words">Search words</TabsTrigger>}
          {live.bin && <TabsTrigger value="bin">Recycle bin</TabsTrigger>}
        </TabsList>
        <TabsContent value="articles">
          {live.spaces.length === 0 ? (
            <EmptyState title="No spaces yet." description={live.canCreateSpace ? 'Add a space to start writing articles.' : 'Ask your Service Desk admin to add one.'} />
          ) : (
            <ArticlesTable live={live} space={space} onEditSpace={() => setDialog('edit-space')} />
          )}
        </TabsContent>
        {space && (space.canPublish || space.canManage) && (
          <TabsContent value="categories">
            <CategoriesCard key={space.id} live={live} space={space} />
          </TabsContent>
        )}
        {writer && (
          <TabsContent value="blocks">
            <SnippetsCard kind="block" items={live.blocks ?? []} canEdit={canPublishSomewhere} onSave={(id, i, v) => live.onSaveBlock(id, { key: i.key ?? '', name: i.name, bodyHtml: i.bodyHtml, ...(v !== undefined ? { version: v } : {}) })} />
          </TabsContent>
        )}
        {writer && (
          <TabsContent value="templates">
            <SnippetsCard kind="template" items={live.templates ?? []} canEdit={canPublishSomewhere} onSave={(id, i) => live.onSaveTemplate(id, { name: i.name, bodyHtml: i.bodyHtml })} />
          </TabsContent>
        )}
        {live.canSeeGaps && (
          <TabsContent value="gaps">
            <GapsCard live={live} />
          </TabsContent>
        )}
        {live.searchWords && (
          <TabsContent value="search-words">
            <SearchWordsCard key={live.searchWords.value} {...live.searchWords} />
          </TabsContent>
        )}
        {live.bin && (
          <TabsContent value="bin">
            <BinCard items={live.bin} onRestore={live.onRestore} />
          </TabsContent>
        )}
      </Tabs>
      {(dialog === 'new-space' || (dialog === 'edit-space' && space)) && (
        <SpaceDrawer
          space={dialog === 'edit-space' ? space! : undefined}
          desks={live.desks}
          onClose={() => setDialog(null)}
          onSave={async (i) => {
            await live.onSaveSpace(dialog === 'edit-space' ? space!.id : null, i);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'new-article' && space && (
        <NewArticleDrawer
          space={space}
          templates={live.templates ?? []}
          onClose={() => setDialog(null)}
          onSave={async (i) => {
            const a = await live.onCreateArticle(i);
            setDialog(null);
            live.onOpenArticle(a.id);
          }}
        />
      )}
    </OpsDesk>
  );
}

function ArticlesTable({ live, space, onEditSpace }: { live: LiveKb; space: KbSpace | null; onEditSpace: () => void }) {
  const f = live.filters;
  const cats = new Map(space ? categoryTree(space.categories).map((t) => [t.cat.id, t.path]) : []);
  const columns: TableColumn<KbArticleRow>[] = [
    { key: 'number', header: 'Article', type: 'id', value: (r) => `KB-${r.number}`, width: 100, hideable: false },
    {
      key: 'title',
      header: 'Title',
      value: (r) => r.title,
      width: 300,
      render: (r) => (
        <span className="yx-ops-row">
          <span>{r.title}</span>
          {r.featured && <Badge tone="info">Featured</Badge>}
          {r.outdated && <Badge tone="danger">Out of date</Badge>}
          {r.waitingReview && r.state !== 'in_review' && <Badge tone="warning">Change waiting for review</Badge>}
        </span>
      ),
    },
    { key: 'category', header: 'Category', value: (r) => (r.categoryId ? (cats.get(r.categoryId) ?? '—') : '—'), width: 170 },
    { key: 'state', header: 'Status', value: (r) => articleStatus(r).label, render: (r) => <Badge tone={articleStatus(r).tone}>{articleStatus(r).label}</Badge>, width: 150 },
    { key: 'owner', header: 'Owner', value: (r) => r.owner ?? 'Nobody', width: 150 },
    { key: 'review', header: 'Review by', value: (r) => r.reviewDueOn ?? '', render: (r) => (r.reviewOverdue ? <Badge tone="warning">{dateText(r.reviewDueOn)}</Badge> : dateText(r.reviewDueOn)), width: 130 },
    { key: 'health', header: 'Health', value: (r) => r.health, render: (r) => <Badge tone={healthTone(r.health)}>{r.health}</Badge>, width: 100 },
    { key: 'language', header: 'Language', value: (r) => LANGUAGE_LABEL[r.language] ?? r.language, width: 110, optional: true },
    { key: 'updated', header: 'Updated', value: (r) => r.updatedAt, render: (r) => when(r.updatedAt), width: 170, optional: true },
  ];
  const filtered = Boolean(f.search) || f.state !== 'all' || f.outdated;
  return (
    <DataTable
      label="Articles"
      columns={columns}
      rows={live.articles}
      getRowId={(r) => r.id}
      state={live.articlesState ?? 'ready'}
      onRetry={live.onRetry}
      errorTitle="We couldn't load the articles."
      empty={<EmptyState title="No articles yet." description={space?.canAuthor ? 'Press New article to write the first one.' : 'Articles appear here once agents write them.'} />}
      filtered={filtered}
      onClearFilters={() => live.onFilters({ search: '', state: 'all', outdated: false })}
      onRowClick={(r) => live.onOpenArticle(r.id)}
      rowNoun={['article', 'articles']}
      toolbar={
        <div className="yx-ops-stack" data-gap="sm">
          <span className="yx-ops-row">
            <FormField label="Space" hideLabel>
              <Select size="sm" value={live.spaceId} onChange={(v) => v && live.onSelectSpace(v)} options={live.spaces.map((s) => ({ value: s.id, label: s.name, description: `${AUDIENCE_LABEL[s.audience]}${s.status === 'off' ? ' · switched off' : ''}` }))} placeholder="Choose a space" />
            </FormField>
            {space?.canManage && (
              <Button size="sm" aria-label={`Edit space ${space.name}`} onClick={onEditSpace}>
                Edit space
              </Button>
            )}
            {space?.publicUrl && (
              <Button size="sm" asChild>
                <a href={space.publicUrl} target="_blank" rel="noreferrer">
                  Open the public page
                </a>
              </Button>
            )}
            <TextField size="sm" type="search" aria-label="Find an article" placeholder="Find an article" value={f.search} onChange={(v) => live.onFilters({ ...f, search: v })} />
          </span>
          <span className="yx-ops-row">
            <Segment
              label="Show"
              options={[{ value: 'all' as const, label: 'All' }, ...(Object.keys(ARTICLE_STATE_LABEL) as KbArticleState[]).map((k) => ({ value: k, label: ARTICLE_STATE_LABEL[k] }))]}
              value={f.state}
              onChange={(v) => live.onFilters({ ...f, state: v })}
            />
            <Checkbox label="Only articles marked out of date" checked={f.outdated} onChange={(v) => live.onFilters({ ...f, outdated: v })} />
          </span>
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------- one article: the HLP-04 editor

function ArticlePage({ live }: { live: LiveKb }) {
  const a = live.article;
  const back = () => live.onOpenArticle(null);
  const crumbs = (label: string) => <Breadcrumbs items={[{ label: 'Knowledge base', href: '/yx/desk/knowledge', onClick: back }, { label }]} />;
  if (!a || a.id !== live.articleId)
    return (
      <OpsDesk area="helpdesk" active="Knowledge base">
        <PageHeader title="Article" breadcrumbs={crumbs('Article')} />
        {live.articleState === 'error' || live.articleState === 'no-access' ? (
          <EmptyState title="We couldn't open this article." description="It may have been deleted, or you cannot read this space." action={<Button onClick={back}>Back to the knowledge base</Button>} />
        ) : (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Opening the article">
            <Skeleton height={48} />
            <Skeleton height={240} />
          </div>
        )}
      </OpsDesk>
    );
  // Remount after every save so the editor shows what the server kept.
  return <ArticleEditor key={`${a.id}-${a.versions[0]?.version}`} live={live} article={a} crumbs={crumbs(`KB-${a.number}`)} />;
}

function ArticleEditor({ live, article: a, crumbs }: { live: LiveKb; article: KbArticle; crumbs: ReactNode }) {
  const last = a.versions[0];
  const space = live.spaces.find((s) => s.id === a.spaceId) ?? null;
  const cats = space ? categoryTree(space.categories) : [];
  const waiting = a.versions.find((v) => v.state === 'in_review') ?? null;
  const published = a.versions.find((v) => v.state === 'published') ?? null;
  const canReview = Boolean(waiting && a.canPublish && !waiting.mine);
  const [title, setTitle] = useState(last?.title ?? a.title);
  const [summary, setSummary] = useState(last?.summary ?? a.summary ?? '');
  const [body, setBody] = useState(last?.bodyHtml ?? a.bodyHtml);
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(a.categoryId);
  const [keywords, setKeywords] = useState(a.keywords ?? '');
  const [pages, setPages] = useState((a.pages ?? []).join(', '));
  const pagesBad = pagesProblem(pages);
  const [assistantUse, setAssistantUse] = useState(a.assistantUse);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [blockKey, setBlockKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<KbDialog | null>(live.start?.dialog ?? null);
  const [compare, setCompare] = useState<number | null>(live.start?.compare ?? waiting?.version ?? null);
  const [backNote, setBackNote] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const keywordsOk = KEYWORDS.test(keywords);
  const early = useTooEarly([...(title.trim() ? [] : [{ fieldId: 'ke-title', message: 'Give the article a title.' }]), ...(keywordsOk ? [] : [{ fieldId: 'ke-words', message: 'Use letters, digits, spaces and commas' }]), ...(pagesBad ? [{ fieldId: 'ke-pages', message: pagesBad }] : [])]);
  const sendEarly = useTooEarly([...(title.trim() ? [] : [{ fieldId: 'ke-title', message: 'Give the article a title.' }]), ...(body.replace(/<[^>]*>/g, '').trim() ? [] : [{ fieldId: 'ke-body', message: 'Write the answer before sending it for review.' }]), ...(keywordsOk ? [] : [{ fieldId: 'ke-words', message: 'Use letters, digits, spaces and commas' }])]);
  const tplEarly = useTooEarly(templateId ? [] : [{ fieldId: 'ke-tpl', message: 'Choose a template first.' }]);
  const blockEarly = useTooEarly(blockKey ? [] : [{ fieldId: 'ke-block', message: 'Choose a block first.' }]);
  const status = articleStatus(a);
  const meta = (): KbArticleMeta => ({
    ...(categoryId !== a.categoryId ? { categoryId } : {}),
    ...(keywords.trim() !== (a.keywords ?? '') ? { keywords: keywords.trim() } : {}),
    ...(assistantUse !== a.assistantUse ? { assistantUse } : {}),
    ...(pagesOf(pages).join() !== (a.pages ?? []).join() ? { pages: pagesOf(pages) } : {}),
  });
  /** Save draft saves the words as a version and the "Where it shows" choices on the article. */
  const save = async () => {
    const m = meta();
    if (Object.keys(m).length) await live.onUpdateMeta(a.id, a.version, m);
    return live.onSaveDraft(a.id, { title: title.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}), bodyHtml: body, ...(note.trim() ? { note: note.trim() } : {}), version: last?.version ?? 1 });
  };
  const audienceWords = space?.audience === 'public' ? 'everyone on the public help centre' : space?.audience === 'requesters' ? 'the people who ask this desk' : 'your agents';

  const menu = (
    <>
      <MenuItem onSelect={() => void run('follow', async () => { await live.onFollow(a.id, !a.following); toast({ tone: 'success', title: a.following ? 'You no longer follow this article.' : 'You follow this article. You hear when it changes.' }); })}>{a.following ? 'Stop following' : 'Follow'}</MenuItem>
      {(a.canAuthor || a.canPublish) && !a.outdated && <MenuItem onSelect={() => setDialog('flag')}>Mark out of date</MenuItem>}
      {a.canPublish && a.state === 'published' && <MenuItem onSelect={() => void run('retire', async () => { await live.onRetire(a.id); toast({ tone: 'success', title: `KB-${a.number} is retired. Readers no longer see it.` }); })}>Retire</MenuItem>}
      {a.canPublish && a.state === 'retired' && <MenuItem onSelect={() => void run('back', async () => { await live.onRepublish(a.id); toast({ tone: 'success', title: `KB-${a.number} is published again.` }); })}>Put back</MenuItem>}
      {a.canPublish && <MenuItem onSelect={() => setDialog('delete')}>Delete</MenuItem>}
    </>
  );

  return (
    <OpsDesk area="helpdesk" active="Knowledge base">
      <ObjectHeader
        breadcrumbs={crumbs}
        name={title || 'Untitled article'}
        icon={BookOpen}
        secondary={
          <span>
            <span className="yx-ops-mono">KB-{a.number}</span> · by {last?.author || a.owner?.name || 'someone'} · updated {formatDate(new Date(a.updatedAt))}
          </span>
        }
        status={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {a.outdated && <Badge tone="danger">Out of date</Badge>}
          </>
        }
        actions={
          <>
            <Button onClick={() => setDialog('preview')}>Preview as employee</Button>
            {a.canAuthor && (
              <Button loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => { const v = await save(); toast({ tone: 'success', title: `Draft saved as version ${v.version}.` }); })}>
                Save draft
              </Button>
            )}
            {canReview ? (
              <Button variant="primary" onClick={() => setDialog('publish')}>
                {a.state === 'published' ? 'Publish changes' : 'Publish'}
              </Button>
            ) : (
              a.canAuthor && (
                <Button variant="primary" loading={busy === 'send'} onClick={() => !sendEarly.stop() && void run('send', async () => { const v = await save(); await live.onSubmit(a.id, v.version); toast({ tone: 'success', title: `Version ${v.version} sent for review.` }); })}>
                  Send for review
                </Button>
              )
            )}
          </>
        }
        menu={menu}
      />
      {a.state === 'published' && a.reviewOverdue && (
        <PageBanner tone="warning" action={a.canAuthor ? <Button size="sm" loading={busy === 'reviewed'} onClick={() => void run('reviewed', async () => { const r = await live.onMarkReviewed(a.id, a.version); toast({ tone: 'success', title: `Marked reviewed. The next check is due on ${dateText(r.reviewDueOn)}.` }); })}>Mark reviewed</Button> : undefined}>
          This article was due for review on {dateText(a.reviewDueOn)}. Check it still matches the current policy, then send changes for review or mark it reviewed.
        </PageBanner>
      )}
      {a.outdated && <PageBanner tone="danger">Marked out of date: {a.outdatedReason}. Publishing a new version clears this.</PageBanner>}
      {waiting &&
        (canReview ? (
          <PageBanner
            tone="info"
            action={
              <>
                <Button size="sm" onClick={() => (setCompare(waiting.version), setDialog('compare'))}>
                  Compare
                </Button>
                <Button size="sm" onClick={() => setDialog('send-back')}>
                  Send back
                </Button>
              </>
            }
          >
            Version {waiting.version} by {waiting.author || 'someone'} is waiting for your review{waiting.note ? `: “${waiting.note}”` : '.'}
          </PageBanner>
        ) : (
          <PageBanner tone="info">{waiting.mine && a.canPublish ? `You wrote version ${waiting.version}, so another publisher reviews it.` : `Version ${waiting.version} is waiting for a publisher to review it.`}</PageBanner>
        ))}
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <Workspace
        main={
          a.canAuthor ? (
            <Card>
              <div className="yx-ops-stack">
                <FormField id="ke-title" label="Title" required error={early.errorOf('ke-title') ?? sendEarly.errorOf('ke-title')}>
                  <TextField value={title} onChange={setTitle} maxLength={200} />
                </FormField>
                <FormField label="Summary" optional helper="One or two lines shown in search results.">
                  <TextField value={summary} onChange={setSummary} maxLength={300} />
                </FormField>
                <FormField id="ke-body" label="Answer" required helper="Write the steps in plain words. Link to the policy instead of copying it. A block shows as {{block:key}} here; readers see its current text." error={sendEarly.errorOf('ke-body')}>
                  <RichTextEditor hide={STYLE_TOOLS} value={body} onChange={setBody} mergeFields={[]} placeholder="Write the answer" />
                </FormField>
                {((live.templates?.length ?? 0) > 0 || (live.blocks?.length ?? 0) > 0) && (
                  <span className="yx-ops-row">
                    {(live.templates?.length ?? 0) > 0 && (
                      <>
                        <FormField id="ke-tpl" label="Template" hideLabel error={tplEarly.errorOf('ke-tpl')}>
                          <Select size="sm" value={templateId} onChange={setTemplateId} options={(live.templates ?? []).map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose a template" />
                        </FormField>
                        <Button size="sm" onClick={() => !tplEarly.stop() && setBody(live.templates?.find((t) => t.id === templateId)?.bodyHtml ?? body)}>
                          Use template
                        </Button>
                      </>
                    )}
                    {(live.blocks?.length ?? 0) > 0 && (
                      <>
                        <FormField id="ke-block" label="Reusable block" hideLabel error={blockEarly.errorOf('ke-block')}>
                          <Select size="sm" value={blockKey} onChange={setBlockKey} options={(live.blocks ?? []).map((b) => ({ value: b.key, label: b.name, description: `{{block:${b.key}}}` }))} placeholder="Choose a reusable block" />
                        </FormField>
                        <Button size="sm" onClick={() => !blockEarly.stop() && setBody(`${body}<p>{{block:${blockKey}}}</p>`)}>
                          Insert block
                        </Button>
                      </>
                    )}
                  </span>
                )}
                <FormField label="What changed" optional helper="A short note for the reviewer.">
                  <TextField value={note} onChange={setNote} maxLength={300} />
                </FormField>
              </div>
            </Card>
          ) : (
            <Card title={a.title}>
              <div className="yx-ops-stack">
                {a.summary && <p className="yx-ops-muted">{a.summary}</p>}
                <MessageBody html={a.renderedHtml} />
              </div>
            </Card>
          )
        }
        rail={
          <>
            <Card title="Where it shows">
              <div className="yx-ops-stack">
                <DescriptionList
                  items={[
                    { label: 'Space', value: space?.name ?? a.space.name },
                    { label: 'Who can read it', value: AUDIENCE_LABEL[a.audience] },
                    { label: 'Language', value: LANGUAGE_LABEL[a.language] ?? a.language },
                  ]}
                />
                {a.canAuthor ? (
                  <>
                    <FormField label="Category" optional>
                      <Select value={categoryId} onChange={setCategoryId} clearable options={cats.map((t) => ({ value: t.cat.id, label: t.path }))} placeholder="No category" />
                    </FormField>
                    <FormField id="ke-words" label="Also suggest for these words" optional helper="Separate with commas" error={!keywordsOk ? 'Use letters, digits, spaces and commas' : null}>
                      <TextField value={keywords} onChange={setKeywords} maxLength={300} />
                    </FormField>
                    <FormField id="ke-pages" label="Show in Help on these pages" optional helper="App addresses, separated with commas, e.g. /yx/time/leave. Pages under them count too." error={pagesBad}>
                      <TextField value={pages} onChange={setPages} maxLength={2000} />
                    </FormField>
                    <Switch checked={assistantUse} onChange={setAssistantUse} label="Use in assistant answers" description="The help assistant is not switched on yet. When it is, it uses this article only if this is on." />
                  </>
                ) : (
                  <DescriptionList
                    items={[
                      { label: 'Category', value: (a.categoryId && cats.find((t) => t.cat.id === a.categoryId)?.path) || 'No category' },
                      { label: 'Also suggest for', value: a.keywords || '—' },
                      { label: 'Shown in Help on', value: a.pages?.length ? a.pages.join(', ') : '—' },
                      { label: 'Use in assistant answers', value: a.assistantUse ? 'Yes' : 'No' },
                    ]}
                  />
                )}
              </div>
            </Card>
            <Card title="How it's doing">
              <Facts
                items={[
                  { label: 'Views, 90 days', value: a.stats.views.toLocaleString('en-IN') },
                  { label: 'Answered without a ticket', value: a.stats.solved.toLocaleString('en-IN') },
                  { label: 'Helpful', value: `${a.stats.yes} yes · ${a.stats.no} no` },
                  { label: 'Health', value: `${a.health} of 100`, tone: a.health >= 70 ? 'success' : a.health >= 40 ? 'warning' : 'danger' },
                ]}
              />
            </Card>
            <Card title="Versions">
              {a.versions.length === 0 ? (
                <EmptyState compact title="No versions yet." />
              ) : (
                <ul className="yx-ops-list" aria-label="Versions">
                  {a.versions.map((v) => (
                    <li key={v.version} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <span className="yx-ops-row">
                          <span className="yx-ops-list__title">
                            v{v.version} · {formatDate(new Date(v.createdAt))}
                          </span>
                          <Badge tone={VERSION_TONE[v.state]}>{VERSION_STATE_LABEL[v.state]}</Badge>
                        </span>
                        <span className="yx-ops-list__sub">
                          {v.author || 'Someone'}
                          {v.mine ? ' (you)' : ''}: {v.note || 'no note'}
                        </span>
                        {v.reviewNote && <span className="yx-ops-list__sub">Reviewer’s note: {v.reviewNote}</span>}
                      </span>
                      <Button size="sm" aria-label={`Compare version ${v.version}`} onClick={() => (setCompare(v.version), setDialog('compare'))}>
                        Compare
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Details">
              <div className="yx-ops-stack">
                <DescriptionList
                  items={[
                    { label: 'Web address', value: a.slug },
                    { label: 'Owner', value: a.owner?.name ?? 'Nobody' },
                    { label: 'Review by', value: dateText(a.reviewDueOn) },
                    ...(a.publicUrl ? [{ label: 'Public page', value: <a className="yx-link" href={a.publicUrl} target="_blank" rel="noreferrer">Open</a> }] : []),
                    ...(a.sourceTicket ? [{ label: 'Made from ticket', value: <a className="yx-link" href={(live.ticketHref ?? ((id: string) => `/yx/desk/tickets/${id}`))(a.sourceTicket.id)}>Ticket {a.sourceTicket.number}</a> }] : []),
                  ]}
                />
                {a.canAuthor && (
                  <span className="yx-ops-row">
                    <Button size="sm" onClick={() => setDialog('details')}>
                      Change details
                    </Button>
                  </span>
                )}
              </div>
            </Card>
            <TranslationsCard live={live} article={a} />
          </>
        }
      />

      <Dialog
        open={dialog === 'publish' && Boolean(waiting)}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Publish “${waiting?.title ?? a.title}”?`}
        description={a.publishAt && new Date(a.publishAt) > new Date() ? `It will be suggested to ${audienceWords} from ${formatDate(new Date(a.publishAt))}.` : `It will be suggested to ${audienceWords} from today.`}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'publish'}
              onClick={() =>
                void run('publish', async () => {
                  await live.onReview(a.id, { version: waiting!.version, approve: true });
                  setDialog(null);
                  toast({ tone: 'success', title: a.publishAt && new Date(a.publishAt) > new Date() ? `Approved. It goes live on ${formatDate(new Date(a.publishAt))}.` : `Version ${waiting!.version} is published.` });
                })
              }
            >
              Publish article
            </Button>
          </>
        }
      >
        <p className="yx-ops-muted">
          Version {waiting?.version} by {waiting?.author || 'someone'}. You did not write it, so you may publish it.
        </p>
      </Dialog>
      <ConfirmDialog
        open={dialog === 'send-back'}
        onOpenChange={(o) => (!o && (setDialog(null), setTried(false)))}
        title={`Send version ${waiting?.version ?? ''} back?`}
        consequence="The writer sees your note and can send a new version."
        confirmLabel="Send back"
        onConfirm={async () => {
          setTried(true);
          if (backNote.trim().length < 3) return false;
          await live.onReview(a.id, { version: waiting!.version, approve: false, note: backNote.trim() });
          toast({ tone: 'success', title: `Version ${waiting!.version} sent back to ${waiting!.author || 'the writer'}.` });
        }}
      >
        <FormField label="Note to the writer" required error={tried && backNote.trim().length < 3 ? 'Write at least 3 letters so the writer knows what to fix.' : null}>
          <TextField value={backNote} onChange={setBackNote} maxLength={300} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'flag'}
        onOpenChange={(o) => (!o && (setDialog(null), setTried(false)))}
        title="Mark this article out of date?"
        consequence="Its owner and followers see the reason. Publishing a new version clears the mark."
        confirmLabel="Mark out of date"
        onConfirm={async () => {
          setTried(true);
          if (flagReason.trim().length < 3) return false;
          await live.onFlag(a.id, flagReason.trim());
          toast({ tone: 'success', title: 'Marked out of date. The owner is told.' });
        }}
      >
        <FormField label="What is wrong" required error={tried && flagReason.trim().length < 3 ? 'Enter at least 3 characters.' : null}>
          <TextField value={flagReason} onChange={setFlagReason} maxLength={300} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete KB-${a.number}?`}
        consequence="It goes to the recycle bin with its translations. You can put it back from there until the bin is emptied."
        confirmLabel="Delete article"
        destructive
        onConfirm={async () => {
          await live.onDelete(a.id);
          toast({ tone: 'success', title: `KB-${a.number} is in the recycle bin.` });
          live.onOpenArticle(null);
        }}
      />
      <Drawer open={dialog === 'preview'} onOpenChange={(o) => !o && setDialog(null)} title="Preview as employee" subtitle={`As ${AUDIENCE_LABEL[a.audience].toLowerCase()} see it`} size="lg">
        <article className="yx-ops-stack" aria-label={`Preview of ${title || 'the article'}`}>
          <h2 className="yx-ops-card__title">{title || 'Untitled article'}</h2>
          {summary.trim() && <p className="yx-ops-muted">{summary}</p>}
          {/* The editor's own reading view: it keeps only what its schema allows, so nothing unsafe is shown. */}
          <RichTextEditor readOnly value={a.canAuthor ? body : a.renderedHtml} mergeFields={[]} aria-label="Article text" />
          {a.canAuthor && body.includes('{{block:') && <InlineAlert tone="info">Reusable blocks show as {'{{block:key}}'} here. Readers see the block's current text.</InlineAlert>}
          <p className="yx-ops-muted">Article KB-{a.number} · Was this helpful? Yes / No</p>
        </article>
      </Drawer>
      <CompareDialog open={dialog === 'compare'} onClose={() => setDialog(null)} versions={a.versions} version={compare} published={published} />
      {dialog === 'details' && <DetailsDrawer live={live} article={a} onClose={() => setDialog(null)} />}
    </OpsDesk>
  );
}

function CompareDialog({ open, onClose, versions, version, published }: { open: boolean; onClose: () => void; versions: KbVersion[]; version: number | null; published: KbVersion | null }) {
  const v = versions.find((x) => x.version === version) ?? null;
  // Compared with the live one; the live one itself with the version before it.
  const other = v && published && published.version !== v.version ? published : (versions.find((x) => v && x.version < v.version) ?? null);
  const side = (x: KbVersion, label: string) => (
    <Card title={`${label}: version ${x.version}`}>
      <div className="yx-ops-stack">
        <p className="yx-ops-list__sub">
          {x.author || 'Someone'} · {formatDate(new Date(x.createdAt))}
          {x.note ? ` · ${x.note}` : ''}
        </p>
        <p className="yx-ops-list__title">{x.title}</p>
        <MessageBody html={x.bodyHtml} />
      </div>
    </Card>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="md" title={v ? `Compare version ${v.version}` : 'Compare versions'} footer={<Button onClick={onClose}>Close</Button>}>
      {!v ? (
        <EmptyState compact title="Choose a version to compare." />
      ) : (
        <div className="yx-ops-stack">
          {side(v, VERSION_STATE_LABEL[v.state])}
          {other ? side(other, other === published ? 'Published now' : 'Before it') : <p className="yx-ops-muted">This is the first version, so there is nothing to compare it with.</p>}
        </div>
      )}
    </Dialog>
  );
}

function DetailsDrawer({ live, article: a, onClose }: { live: LiveKb; article: KbArticle; onClose: () => void }) {
  const pub = a.canPublish;
  const [slug, setSlug] = useState(a.slug);
  const [seoTitle, setSeoTitle] = useState(a.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(a.seoDescription ?? '');
  const [featured, setFeatured] = useState(a.featured);
  const [reviewDueOn, setReviewDueOn] = useState(day(a.reviewDueOn));
  const [publishAt, setPublishAt] = useState(localInput(a.publishAt));
  const [expiresAt, setExpiresAt] = useState(localInput(a.expiresAt));
  const [expiryAction, setExpiryAction] = useState<'flag' | 'hide'>(a.expiryAction);
  const [find, setFind] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>(a.owner ? [{ id: a.owner.id, name: a.owner.name, email: '' }] : []);
  const [owner, setOwner] = useState<string | null>(a.owner?.id ?? null);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const slugOk = ARTICLE_SLUG.test(slug);
  const early = useTooEarly(slugOk ? [] : [{ fieldId: 'km-slug', message: 'Use small letters, digits and dashes' }]);
  const { onSearchUsers } = live;
  useEffect(() => {
    if (!onSearchUsers || !find.trim()) return;
    const h = setTimeout(() => void onSearchUsers(find.trim()).then(setUsers).catch(() => setUsers([])), 250);
    return () => clearTimeout(h);
  }, [find]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only what changed is sent: featured, dates and owner are a publisher's calls, so an author never sends them.
  const change = (): KbArticleMeta => ({
    ...(slug !== a.slug ? { slug } : {}),
    ...(seoTitle !== (a.seoTitle ?? '') ? { seoTitle } : {}),
    ...(seoDescription !== (a.seoDescription ?? '') ? { seoDescription } : {}),
    ...(reviewDueOn !== day(a.reviewDueOn) ? { reviewDueOn: reviewDueOn || null } : {}),
    ...(pub && featured !== a.featured ? { featured } : {}),
    ...(pub && publishAt !== localInput(a.publishAt) ? { publishAt: fromLocal(publishAt) } : {}),
    ...(pub && expiresAt !== localInput(a.expiresAt) ? { expiresAt: fromLocal(expiresAt) } : {}),
    ...(expiryAction !== a.expiryAction ? { expiryAction } : {}),
    ...(pub && owner && owner !== a.owner?.id ? { ownerUserId: owner } : {}),
  });
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Details of KB-${a.number}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              !early.stop() &&
              (Object.keys(change()).length === 0
                ? toast({ tone: 'default', title: 'Nothing has changed yet.' })
                : void run('save', async () => {
                    await live.onUpdateMeta(a.id, a.version, change());
                    toast({ tone: 'success', title: 'Details saved.' });
                    onClose();
                  }))
            }
          >
            Save details
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The details were not saved">{error}</InlineAlert>}
        <FormField id="km-slug" label="Web address" helper={a.publishedAt ? 'If you change it, the old address keeps working and leads here.' : 'Small letters, digits and dashes.'} error={!slugOk ? 'Use small letters, digits and dashes' : null}>
          <TextField value={slug} onChange={(v) => setSlug(v.toLowerCase())} maxLength={80} />
        </FormField>
        <FormField label="Search title" optional helper={`${seoTitle.length} of 70 letters. Shown by search engines.`}>
          <TextField value={seoTitle} onChange={setSeoTitle} maxLength={70} />
        </FormField>
        <FormField label="Search description" optional helper={`${seoDescription.length} of 160 letters.`}>
          <TextArea value={seoDescription} onChange={setSeoDescription} maxLength={160} rows={3} />
        </FormField>
        <FormField label="Review by" optional helper="The owner is reminded to check it on this day.">
          <TextField type="date" value={reviewDueOn} onChange={setReviewDueOn} />
        </FormField>
        <FormField label="When it expires">
          <Segment label="When it expires" options={[{ value: 'flag', label: 'Flag for review' }, { value: 'hide', label: 'Hide it' }]} value={expiryAction} onChange={setExpiryAction} />
        </FormField>
        {pub ? (
          <>
            <Checkbox label="Featured" description="Shown first on the help page." checked={featured} onChange={setFeatured} />
            <FormField label="Publish at" optional helper="An approved version waits until this time.">
              <TextField type="datetime-local" value={publishAt} onChange={setPublishAt} />
            </FormField>
            <FormField label="Expires at" optional>
              <TextField type="datetime-local" value={expiresAt} onChange={setExpiresAt} />
            </FormField>
            {onSearchUsers ? (
              <>
                <FormField label="Find the owner" helper="Name or email">
                  <TextField value={find} onChange={setFind} />
                </FormField>
                <FormField label="Owner">
                  <Select value={owner} onChange={setOwner} options={users.map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email || undefined }))} placeholder="Nobody" />
                </FormField>
              </>
            ) : (
              <p className="yx-ops-muted">Owner: {a.owner?.name ?? 'nobody'}</p>
            )}
          </>
        ) : (
          <p className="yx-ops-muted">Owner: {a.owner?.name ?? 'nobody'}. A publisher sets the owner, dates and featured articles.</p>
        )}
      </div>
    </Drawer>
  );
}

function TranslationsCard({ live, article: a }: { live: LiveKb; article: KbArticle }) {
  const [language, setLanguage] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const early = useTooEarly(language ? [] : [{ fieldId: 'kt-lang', message: 'Choose a language first.' }]);
  const used = new Set([a.language, ...a.translations.map((t) => t.language)]);
  const free = a.space.languages.filter((l) => !used.has(l));
  const originalId = a.language === 'en' ? a.id : a.translationOfId;
  if (a.translations.length === 0 && !(a.canAuthor && originalId && free.length > 0)) return null;
  return (
    <Card title="Translations">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The translation was not started">{error}</InlineAlert>}
        {a.translations.length > 0 && (
          <ul className="yx-ops-list" aria-label="Translations">
            {a.translations.map((t) => (
              <li key={t.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">
                    {LANGUAGE_LABEL[t.language] ?? t.language} · KB-{t.number}
                  </span>
                  <span className="yx-ops-list__sub">{ARTICLE_STATE_LABEL[t.state]}</span>
                </span>
                <Button size="sm" aria-label={`Open the ${LANGUAGE_LABEL[t.language] ?? t.language} translation`} onClick={() => live.onOpenArticle(t.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
        {a.canAuthor && originalId && free.length > 0 && (
          <span className="yx-ops-row">
            <FormField id="kt-lang" label="Language of the translation" hideLabel error={early.errorOf('kt-lang')}>
              <Select size="sm" value={language} onChange={setLanguage} options={free.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] ?? l }))} placeholder="Choose a language" />
            </FormField>
            <Button
              size="sm"
              loading={busy === 'add'}
              onClick={() =>
                !early.stop() &&
                void run('add', async () => {
                  const t = await live.onCreateArticle({ spaceId: a.spaceId, title: a.title, language: language!, translationOfId: originalId });
                  live.onOpenArticle(t.id);
                })
              }
            >
              Add translation
            </Button>
          </span>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- spaces, new article, categories

function SpaceDrawer({ space, desks, onClose, onSave }: { space?: KbSpace; desks: DeskSummary[]; onClose: () => void; onSave: (i: KbSpaceInput) => Promise<void> }) {
  const [name, setName] = useState(space?.name ?? '');
  const [slug, setSlug] = useState(space?.slug ?? '');
  const [audience, setAudience] = useState<KbAudience>(space?.audience ?? 'agents');
  const [languages, setLanguages] = useState<string[]>(space?.languages ?? ['en']);
  const [deskId, setDeskId] = useState<string | null>(space?.deskId ?? null);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const slugOk = SLUG.test(slug);
  const early = useTooEarly([...(name.trim() ? [] : [{ fieldId: 'ks-name', message: 'Name the space.' }]), ...(slugOk ? [] : [{ fieldId: 'ks-slug', message: 'Use 2 to 40 small letters, digits and dashes' }])]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={space ? `Edit ${space.name}` : 'New space'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() =>
              !early.stop() &&
              void run('save', async () => {
                await onSave({ name: name.trim(), slug, audience, languages, ...(!space && deskId ? { deskId } : {}), ...(space ? { version: space.version } : {}) });
                toast({ tone: 'success', title: space ? `${name.trim()} saved.` : `Space ${name.trim()} added.` });
              })
            }
          >
            {space ? 'Save space' : 'Add space'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The space was not saved">{error}</InlineAlert>}
        <FormField id="ks-name" label="Name" required error={early.errorOf('ks-name')}>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField id="ks-slug" label="Web address" required rule="2 to 40 small letters, digits and dashes, like it-help." error={slug && !slugOk ? 'Use 2 to 40 small letters, digits and dashes' : early.errorOf('ks-slug')}>
          <TextField value={slug} onChange={(v) => setSlug(v.toLowerCase())} maxLength={40} />
        </FormField>
        <FormField label="Who can read it">
          <Segment label="Who can read it" options={(Object.keys(AUDIENCE_LABEL) as KbAudience[]).map((x) => ({ value: x, label: AUDIENCE_LABEL[x] }))} value={audience} onChange={setAudience} />
        </FormField>
        <fieldset className="yx-ops-stack" data-gap="sm">
          <legend>Languages</legend>
          {LANGUAGES.map((l) => (
            <Checkbox key={l} label={LANGUAGE_LABEL[l]} checked={languages.includes(l)} disabled={l === 'en'} description={l === 'en' ? 'Always on: translations start from English.' : undefined} onChange={(on) => setLanguages(on ? [...languages, l] : languages.filter((x) => x !== l))} />
          ))}
        </fieldset>
        {!space && (
          <FormField label="Desk" optional helper="Leave empty for a company-wide space.">
            <Select value={deskId} onChange={setDeskId} clearable options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Company-wide" />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

function NewArticleDrawer({ space, templates, onClose, onSave }: { space: KbSpace; templates: KbTemplate[]; onClose: () => void; onSave: (i: KbNewArticle) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const early = useTooEarly(title.trim() ? [] : [{ fieldId: 'ka-title', message: 'Give the article a title.' }]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="New article"
      subtitle={`In ${space.name} · ${AUDIENCE_LABEL[space.audience]}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', () => onSave({ spaceId: space.id, title: title.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}), ...(categoryId ? { categoryId } : {}), ...(templateId ? { templateId } : {}) }))}>
            Start the draft
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The article was not started">{error}</InlineAlert>}
        <FormField id="ka-title" label="Title" required error={early.errorOf('ka-title')}>
          <TextField value={title} onChange={setTitle} maxLength={200} />
        </FormField>
        <FormField label="Summary" optional helper="One or two lines shown in search results.">
          <TextField value={summary} onChange={setSummary} maxLength={300} />
        </FormField>
        <FormField label="Category" optional>
          <Select value={categoryId} onChange={setCategoryId} clearable options={categoryTree(space.categories).map((t) => ({ value: t.cat.id, label: t.path }))} placeholder="No category" />
        </FormField>
        <FormField label="Start from a template" optional>
          <Select value={templateId} onChange={setTemplateId} clearable options={templates.map((t) => ({ value: t.id, label: t.name }))} placeholder="Blank page" />
        </FormField>
      </div>
    </Drawer>
  );
}

function CategoriesCard({ live, space: s }: { live: LiveKb; space: KbSpace }) {
  const tree = categoryTree(s.categories);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const renameEarly = useTooEarly(renaming && !renaming.name.trim() ? [{ fieldId: 'kc-rename', message: 'Give the new name.' }] : []);
  const addEarly = useTooEarly(name.trim() ? [] : [{ fieldId: 'kc-name', message: 'Name the category.' }]);
  const move = (c: KbCategory, step: -1 | 1) => {
    // One reorder at a time: each sends the whole order of its level.
    if (busy !== null) return;
    const level = tree.filter((t) => t.cat.parentId === c.parentId).map((t) => t.cat.id);
    const i = level.indexOf(c.id);
    [level[i], level[i + step]] = [level[i + step], level[i]];
    return run(`mv-${c.id}`, () => live.onReorderCategories(s.id, level));
  };
  return (
    <Card title={`Categories of ${s.name}`}>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        {tree.length === 0 ? (
          <EmptyState compact title="No categories yet." />
        ) : (
          <ul className="yx-ops-list" aria-label="Categories">
            {tree.map(({ cat: c, depth, path }) => {
              const level = tree.filter((t) => t.cat.parentId === c.parentId);
              const i = level.findIndex((t) => t.cat.id === c.id);
              return (
                <li key={c.id} className="yx-ops-list__item">
                  <span className="yx-ops-list__main">
                    {renaming?.id === c.id ? (
                      <span className="yx-ops-row">
                        <FormField id="kc-rename" label={`New name for ${c.name}`} hideLabel error={renameEarly.errorOf('kc-rename')}>
                          <TextField size="sm" value={renaming.name} onChange={(v) => setRenaming({ id: c.id, name: v })} maxLength={100} />
                        </FormField>
                        {/* The API sets the parent and place from the body, so both are sent back unchanged. */}
                        <Button size="sm" loading={busy === `rn-${c.id}`} onClick={() => !renameEarly.stop() && void run(`rn-${c.id}`, async () => { await live.onSaveCategory(s.id, c.id, { name: renaming.name.trim(), ...(c.parentId ? { parentId: c.parentId } : {}), sortOrder: c.sortOrder }); setRenaming(null); toast({ tone: 'success', title: 'Category renamed.' }); })}>
                          Save
                        </Button>
                        <Button size="sm" onClick={() => setRenaming(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <span className="yx-ops-list__title">{c.name}</span>
                    )}
                    <span className="yx-ops-list__sub">{depth === 0 ? 'Category' : depth === 1 ? `Section in ${path.split(' › ')[0]}` : `Sub-section in ${path.split(' › ').slice(0, 2).join(' › ')}`}</span>
                  </span>
                  <span className="yx-ops-row">
                    <IconButton size="sm" icon={ArrowUp} label={`Move ${c.name} up`} onClick={() => (i === 0 ? toast({ tone: 'default', title: `${c.name} is already first.` }) : void move(c, -1))} />
                    <IconButton size="sm" icon={ArrowDown} label={`Move ${c.name} down`} onClick={() => (i === level.length - 1 ? toast({ tone: 'default', title: `${c.name} is already last.` }) : void move(c, 1))} />
                    <Button size="sm" aria-label={`Rename ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name })}>
                      Rename
                    </Button>
                    <ConfirmDialog
                      title={`Delete ${c.name}?`}
                      consequence="Only an empty category can be deleted: move its articles and sections first."
                      confirmLabel="Delete category"
                      destructive
                      onConfirm={() => live.onDeleteCategory(s.id, c.id)}
                      trigger={
                        <Button size="sm" aria-label={`Delete ${c.name}`}>
                          Delete
                        </Button>
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <span className="yx-ops-row">
          <FormField id="kc-name" label="New category name" error={addEarly.errorOf('kc-name')}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
          <FormField label="Inside" optional helper="Leave empty for a top category. Three levels at most.">
            <Select value={parentId} onChange={setParentId} clearable options={tree.filter((t) => t.depth < 2).map((t) => ({ value: t.cat.id, label: t.path }))} placeholder="Top level" />
          </FormField>
        </span>
        <span className="yx-ops-row">
          <Button loading={busy === 'add'} onClick={() => !addEarly.stop() && void run('add', async () => { await live.onSaveCategory(s.id, null, { name: name.trim(), ...(parentId ? { parentId } : {}), sortOrder: tree.filter((t) => t.cat.parentId === parentId).length }); setName(''); toast({ tone: 'success', title: `Category ${name.trim()} added.` }); })}>
            Add category
          </Button>
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- blocks and templates

type Snippet = { id: string; key?: string; name: string; bodyHtml: string; version?: number };

function SnippetsCard({ kind, items, canEdit, onSave }: { kind: 'block' | 'template'; items: Snippet[]; canEdit: boolean; onSave: (id: string | null, i: { key?: string; name: string; bodyHtml: string }, version?: number) => Promise<void> }) {
  const [editing, setEditing] = useState<Snippet | 'new' | null>(null);
  const word = kind === 'block' ? 'block' : 'template';
  return (
    <Card
      title={kind === 'block' ? 'Reusable blocks' : 'Article templates'}
      actions={
        canEdit ? (
          <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
            New {word}
          </Button>
        ) : undefined
      }
    >
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">{kind === 'block' ? 'A block is text many articles share. Change it once and every article shows the new text.' : 'A template gives a new article its first headings and text.'}</p>
        {!canEdit && <p className="yx-ops-muted">Only publishers change {word}s.</p>}
        {items.length === 0 ? (
          <EmptyState compact title={`No ${word}s yet.`} />
        ) : (
          <ul className="yx-ops-list" aria-label={kind === 'block' ? 'Blocks' : 'Templates'}>
            {items.map((s) => (
              <li key={s.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{s.name}</span>
                  {s.key && <span className="yx-ops-list__sub">{`{{block:${s.key}}}`}</span>}
                  <MessageBody html={s.bodyHtml} />
                </span>
                {canEdit && (
                  <Button size="sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <SnippetDrawer kind={kind} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={async (i) => { await onSave(editing === 'new' ? null : editing.id, i, editing === 'new' ? undefined : editing.version); setEditing(null); }} />}
    </Card>
  );
}

function SnippetDrawer({ kind, item, onClose, onSave }: { kind: 'block' | 'template'; item?: Snippet; onClose: () => void; onSave: (i: { key?: string; name: string; bodyHtml: string }) => Promise<void> }) {
  const [key, setKey] = useState(item?.key ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [body, setBody] = useState(item?.bodyHtml ?? '');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const keyOk = kind === 'template' || SLUG.test(key);
  const early = useTooEarly([...(name.trim() ? [] : [{ fieldId: 'kn-name', message: 'Give it a name.' }]), ...(keyOk ? [] : [{ fieldId: 'kn-key', message: 'Use 2 to 40 small letters, digits and dashes' }])]);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Edit ${item.name}` : kind === 'block' ? 'New block' : 'New template'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => { await onSave({ ...(kind === 'block' ? { key } : {}), name: name.trim(), bodyHtml: body }); toast({ tone: 'success', title: `${name.trim()} saved.` }); })}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        {kind === 'block' && item && <InlineAlert tone="warning">Every article that shows this block changes when you save.</InlineAlert>}
        <FormField id="kn-name" label="Name" required error={early.errorOf('kn-name')}>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        {kind === 'block' && (
          <FormField id="kn-key" label="Key" required helper="Authors insert it as {{block:key}}. 2 to 40 small letters, digits and dashes." error={key && !keyOk ? 'Use 2 to 40 small letters, digits and dashes' : early.errorOf('kn-key')}>
            <TextField value={key} onChange={(v) => setKey(v.toLowerCase())} maxLength={40} />
          </FormField>
        )}
        <FormField label="Text" required>
          <RichTextEditor hide={STYLE_TOOLS} value={body} onChange={setBody} mergeFields={[]} placeholder="Write the text" />
        </FormField>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------- content gaps and the recycle bin

function GapsCard({ live }: { live: LiveKb }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [gaps, setGaps] = useState<KbGaps | null>(null);
  const [deskId, setDeskId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const showEarly = useTooEarly([...(from ? [] : [{ fieldId: 'kg-from', message: 'Choose the first day.' }]), ...(!to ? [{ fieldId: 'kg-to', message: 'Choose the last day.' }] : to < from ? [{ fieldId: 'kg-to', message: 'The last day is before the first.' }] : [])]);
  const taskEarly = useTooEarly(deskId ? [] : [{ fieldId: 'kg-desk', message: 'Choose the desk for the task first.' }]);
  const load = () => run('load', async () => setGaps(await live.onLoadGaps(from, to)));
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const task = (query: string) =>
    !live.canMakeTask ? null : done.has(query) ? (
      <Badge tone="success">Task made</Badge>
    ) : (
      <Button size="sm" aria-label={`Make an article-request task for ${query}`} loading={busy === `t-${query}`} onClick={() => !taskEarly.stop() && void run(`t-${query}`, async () => { await live.onGapTask(deskId!, query); setDone(new Set([...done, query])); toast({ tone: 'success', title: 'Article-request task made. It is assigned to you.' }); })}>
        Make an article-request task
      </Button>
    );
  const list = (title: string, rows: { key: string; title: string; sub: string }[], withTask = true) => (
    <Card title={title}>
      {rows.length === 0 ? (
        <EmptyState compact title="Nothing in this period." />
      ) : (
        <ul className="yx-ops-list" aria-label={title}>
          {rows.map((r) => (
            <li key={r.key} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-list__title">{r.title}</span>
                <span className="yx-ops-list__sub">{r.sub}</span>
              </span>
              {withTask && task(r.key)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  const searches = (rows: { query: string; times: number }[]) => rows.map((r) => ({ key: r.query, title: `“${r.query}”`, sub: `${r.times} ${r.times === 1 ? 'time' : 'times'}` }));
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <span className="yx-ops-row">
        <FormField id="kg-from" label="From" error={showEarly.errorOf('kg-from')}>
          <TextField type="date" value={from} onChange={setFrom} />
        </FormField>
        <FormField id="kg-to" label="To" error={showEarly.errorOf('kg-to')}>
          <TextField type="date" value={to} onChange={setTo} />
        </FormField>
        <Button loading={busy === 'load'} onClick={() => !showEarly.stop() && void load()}>
          Show
        </Button>
        {live.canMakeTask && (
          <FormField id="kg-desk" label="Desk for new tasks" error={taskEarly.errorOf('kg-desk')} helper="An article-request task goes to this desk, assigned to you.">
            <Select value={deskId} onChange={setDeskId} options={live.desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
          </FormField>
        )}
      </span>
      {gaps && (
        <>
          {list('Searches with no result', searches(gaps.noResult))}
          {list('Searches nobody opened', searches(gaps.noClick))}
          {list(
            'Solved tickets with no article',
            gaps.noArticle.map((r) => {
              const q = r.category ? `${r.desk}: ${r.category}` : r.desk;
              return { key: q, title: q, sub: `${r.tickets} solved ${r.tickets === 1 ? 'ticket' : 'tickets'} with no article` };
            }),
          )}
          {list(
            'Articles that led to tickets',
            (gaps.ledToTickets ?? []).map((r) => ({ key: r.articleId, title: `KB-${r.number} · ${r.title}`, sub: `${r.tickets} ${r.tickets === 1 ? 'ticket was' : 'tickets were'} raised while reading it` })),
            false,
          )}
          {list(
            'Searches that led to tickets',
            (gaps.searchesToTickets ?? []).map((r) => ({ key: r.query, title: `“${r.query}”`, sub: `${r.tickets} ${r.tickets === 1 ? 'ticket was' : 'tickets were'} raised after this search` })),
          )}
        </>
      )}
    </div>
  );
}

/** Answers 1642, 1681: the company's search words that mean the same (PF and provident fund); the starter list until changed. */
function SearchWordsCard({ value, starter, onSave }: { value: string; starter: string; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState(value);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const early = useTooEarly(text.trim() ? [] : [{ fieldId: 'kb-synonyms', message: 'Write at least one line, or press Use the starter list.' }]);
  return (
    <Card title="Search words that mean the same">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <FormField id="kb-synonyms" label="Words, one group a line" helper="Separate the words with commas, e.g. pf, provident fund. Help search finds an article by any word of its line. For the whole company." error={early.errorOf('kb-synonyms')}>
          <TextArea value={text} onChange={setText} rows={7} />
        </FormField>
        <div className="yx-ops-row">
          <Button onClick={() => setText(starter)}>Use the starter list</Button>
          <Button
            variant="primary"
            loading={busy === 'synonyms'}
            onClick={() => {
              if (early.stop()) return;
              void run('synonyms', async () => {
                await onSave(text);
                toast({ tone: 'success', title: 'Search words saved.' });
              });
            }}
          >
            Save search words
          </Button>
        </div>
      </div>
    </Card>
  );
}

const BIN_KIND: Record<string, string> = { kb_article: 'Article', view: 'Saved view', email_rule: 'Email rule' };

function BinCard({ items, onRestore }: { items: BinItem[]; onRestore: (id: string) => Promise<void> }) {
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  return (
    <Card title="Recycle bin">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not put back">{error}</InlineAlert>}
        <p className="yx-ops-muted">Deleted things stay here for a while, then go for good.</p>
        {items.length === 0 ? (
          <EmptyState compact title="The recycle bin is empty." />
        ) : (
          <ul className="yx-ops-list" aria-label="Recycle bin">
            {items.map((b) => (
              <li key={b.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">{b.label}</span>
                  <span className="yx-ops-list__sub">
                    {BIN_KIND[b.kind] ?? b.kind} · deleted {when(b.deletedAt)} · gone for good after {when(b.purgeAfter)}
                  </span>
                </span>
                <Button size="sm" aria-label={`Put back ${b.label}`} loading={busy === b.id} onClick={() => void run(b.id, async () => { await onRestore(b.id); toast({ tone: 'success', title: `${b.label} is back.` }); })}>
                  Put back
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
