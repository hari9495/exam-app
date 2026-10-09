import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { RichTextEditor } from '../../components/editor';
import { ConfirmDialog } from '../../components/overlay';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, when } from './desk-kit';
import type { DeskSummary, LoadState } from './types';
import type { BinItem, KbArticle, KbArticleMeta, KbArticleRow, KbArticleState, KbAudience, KbBlock, KbCategory, KbFilters, KbGaps, KbNewArticle, KbSpace, KbSpaceInput, KbTemplate, KbVersionState } from './kb-types';

// HLP-04 knowledge (SD-1.24, SD-1.25): spaces and their category tree, articles with versions and four-eyes review,
// shared blocks and templates, the content-gap report and the recycle bin. Every rule is checked again by the API.

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
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
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

export interface KnowledgeScreenProps {
  state: LoadState;
  onRetry?: () => void;
  spaces: KbSpace[];
  spaceId: string | null;
  onSelectSpace: (id: string) => void;
  /** desk.desk.create (company-wide spaces) or desk.settings.manage (spaces of the desks one runs). */
  canCreateSpace: boolean;
  desks: DeskSummary[];
  articles: KbArticleRow[];
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
}

export function KnowledgeScreen(props: KnowledgeScreenProps) {
  const [tab, setTab] = useState('articles');
  const [spaceForm, setSpaceForm] = useState<KbSpace | 'new' | null>(null);
  const space = props.spaces.find((s) => s.id === props.spaceId) ?? null;
  const writer = props.blocks !== null;
  return (
    <DeskPage
      title="Knowledge"
      description="Help articles for your agents and the people you help. Every change is checked by a second person before it goes live."
      state={props.state}
      onRetry={props.onRetry}
      what="the knowledge base"
      actions={
        props.canCreateSpace ? (
          <Button variant="primary" icon={Plus} onClick={() => setSpaceForm('new')}>
            New space
          </Button>
        ) : undefined
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Knowledge">
          <TabsTrigger value="articles">Articles</TabsTrigger>
          {writer && <TabsTrigger value="blocks">Blocks</TabsTrigger>}
          {writer && <TabsTrigger value="templates">Templates</TabsTrigger>}
          {props.canSeeGaps && <TabsTrigger value="gaps">Content gaps</TabsTrigger>}
          {props.bin && <TabsTrigger value="bin">Recycle bin</TabsTrigger>}
        </TabsList>
        <TabsContent value="articles">
          <div className="yx-desk-setup">
            <div className="yx-ops-stack">
              <SpacesCard {...props} onEdit={setSpaceForm} />
              {space && (space.canPublish || space.canManage) && <CategoriesCard key={space.id} space={space} {...props} />}
            </div>
            {props.articleId ? <ArticleArea {...props} space={space} /> : space ? <ArticlesCard {...props} space={space} /> : <EmptyState compact title="Choose a space to see its articles." />}
          </div>
        </TabsContent>
        {writer && (
          <TabsContent value="blocks">
            <SnippetsCard kind="block" items={props.blocks ?? []} canEdit={props.spaces.some((s) => s.canPublish)} onSave={(id, i, v) => props.onSaveBlock(id, { key: i.key ?? '', name: i.name, bodyHtml: i.bodyHtml, ...(v !== undefined ? { version: v } : {}) })} />
          </TabsContent>
        )}
        {writer && (
          <TabsContent value="templates">
            <SnippetsCard kind="template" items={props.templates ?? []} canEdit={props.spaces.some((s) => s.canPublish)} onSave={(id, i) => props.onSaveTemplate(id, { name: i.name, bodyHtml: i.bodyHtml })} />
          </TabsContent>
        )}
        {props.canSeeGaps && (
          <TabsContent value="gaps">
            <GapsCard {...props} />
          </TabsContent>
        )}
        {props.bin && (
          <TabsContent value="bin">
            <BinCard items={props.bin} onRestore={props.onRestore} />
          </TabsContent>
        )}
      </Tabs>
      {spaceForm && <SpaceDrawer space={spaceForm === 'new' ? undefined : spaceForm} desks={props.desks} onClose={() => setSpaceForm(null)} onSave={async (i) => { await props.onSaveSpace(spaceForm === 'new' ? null : spaceForm.id, i); setSpaceForm(null); }} />}
    </DeskPage>
  );
}

// ---------------------------------------------------------------- spaces and categories

function SpacesCard(props: KnowledgeScreenProps & { onEdit: (s: KbSpace) => void }) {
  return (
    <Card title="Spaces">
      {props.spaces.length === 0 ? (
        <EmptyState compact title="No spaces yet." description={props.canCreateSpace ? 'Add a space to start writing articles.' : 'Ask your Service Desk admin to add one.'} />
      ) : (
        <ul className="yx-ops-list" aria-label="Spaces">
          {props.spaces.map((s) => (
            <li key={s.id} className="yx-ops-list__item" data-active={s.id === props.spaceId || undefined}>
              <span className="yx-ops-list__main">
                <button type="button" className="yx-desk-link" aria-current={s.id === props.spaceId ? 'true' : undefined} onClick={() => props.onSelectSpace(s.id)}>
                  {s.name}
                </button>
                <span className="yx-ops-list__sub">
                  {AUDIENCE_LABEL[s.audience]} · {s.languages.map((l) => LANGUAGE_LABEL[l] ?? l).join(', ')}
                  {s.status === 'off' ? ' · switched off' : ''}
                </span>
                {s.publicUrl && (
                  <a className="yx-desk-link yx-ops-list__sub" href={s.publicUrl} target="_blank" rel="noreferrer">
                    Open the public page
                  </a>
                )}
              </span>
              {s.canManage && (
                <Button size="sm" aria-label={`Edit space ${s.name}`} onClick={() => props.onEdit(s)}>
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SpaceDrawer({ space, desks, onClose, onSave }: { space?: KbSpace; desks: DeskSummary[]; onClose: () => void; onSave: (i: KbSpaceInput) => Promise<void> }) {
  const [name, setName] = useState(space?.name ?? '');
  const [slug, setSlug] = useState(space?.slug ?? '');
  const [audience, setAudience] = useState<KbAudience>(space?.audience ?? 'agents');
  const [languages, setLanguages] = useState<string[]>(space?.languages ?? ['en']);
  const [deskId, setDeskId] = useState<string | null>(space?.deskId ?? null);
  const { busy, error, run } = useRun();
  const slugOk = SLUG.test(slug);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={space ? `Edit ${space.name}` : 'New space'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || !slugOk} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ name: name.trim(), slug, audience, languages, ...(!space && deskId ? { deskId } : {}), ...(space ? { version: space.version } : {}) }))}>
            {space ? 'Save space' : 'Add space'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The space was not saved">{error}</InlineAlert>}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="Web address" required helper="2 to 40 small letters, digits and dashes, like it-help." error={slug && !slugOk ? 'Use 2 to 40 small letters, digits and dashes' : null}>
          <TextField value={slug} onChange={(v) => setSlug(v.toLowerCase())} maxLength={40} />
        </FormField>
        <FormField label="Who can read it">
          <Segment label="Who can read it" options={(Object.keys(AUDIENCE_LABEL) as KbAudience[]).map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))} value={audience} onChange={setAudience} />
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

function CategoriesCard(props: KnowledgeScreenProps & { space: KbSpace }) {
  const s = props.space;
  const tree = categoryTree(s.categories);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const { busy, error, run } = useRun();
  const move = (c: KbCategory, step: -1 | 1) => {
    const level = tree.filter((t) => t.cat.parentId === c.parentId).map((t) => t.cat.id);
    const i = level.indexOf(c.id);
    [level[i], level[i + step]] = [level[i + step], level[i]];
    return run(`mv-${c.id}`, () => props.onReorderCategories(s.id, level));
  };
  return (
    <Card title="Categories">
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
                        <TextField size="sm" aria-label={`New name for ${c.name}`} value={renaming.name} onChange={(v) => setRenaming({ id: c.id, name: v })} maxLength={100} />
                        {/* The API sets the parent and place from the body, so both are sent back unchanged. */}
                        <Button size="sm" disabled={!renaming.name.trim()} loading={busy === `rn-${c.id}`} onClick={() => void run(`rn-${c.id}`, async () => { await props.onSaveCategory(s.id, c.id, { name: renaming.name.trim(), ...(c.parentId ? { parentId: c.parentId } : {}), sortOrder: c.sortOrder }); setRenaming(null); })}>
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
                    <IconButton size="sm" icon={ArrowUp} label={`Move ${c.name} up`} disabled={i === 0 || busy !== null} onClick={() => void move(c, -1)} />
                    <IconButton size="sm" icon={ArrowDown} label={`Move ${c.name} down`} disabled={i === level.length - 1 || busy !== null} onClick={() => void move(c, 1)} />
                    <Button size="sm" aria-label={`Rename ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name })}>
                      Rename
                    </Button>
                    <ConfirmDialog
                      title={`Delete ${c.name}?`}
                      consequence="Only an empty category can be deleted: move its articles and sections first."
                      confirmLabel="Delete category"
                      destructive
                      onConfirm={() => props.onDeleteCategory(s.id, c.id)}
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
        <FormField label="New category name">
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="Inside" optional helper="Leave empty for a top category. Three levels at most.">
          <Select value={parentId} onChange={setParentId} clearable options={tree.filter((t) => t.depth < 2).map((t) => ({ value: t.cat.id, label: t.path }))} placeholder="Top level" />
        </FormField>
        <div className="yx-ops-row">
          <Button disabled={!name.trim()} loading={busy === 'add'} onClick={() => void run('add', async () => { await props.onSaveCategory(s.id, null, { name: name.trim(), ...(parentId ? { parentId } : {}), sortOrder: tree.filter((t) => t.cat.parentId === parentId).length }); setName(''); })}>
            Add category
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- articles list

function ArticlesCard(props: KnowledgeScreenProps & { space: KbSpace }) {
  const s = props.space;
  const f = props.filters;
  const [creating, setCreating] = useState(false);
  const cats = new Map(categoryTree(s.categories).map((t) => [t.cat.id, t.path]));
  return (
    <Card
      title={`Articles in ${s.name}`}
      actions={
        s.canAuthor ? (
          <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
            New article
          </Button>
        ) : undefined
      }
    >
      <div className="yx-ops-stack">
        <TextField type="search" aria-label="Find an article" placeholder="Find an article" value={f.search} onChange={(v) => props.onFilters({ ...f, search: v })} />
        <Segment
          label="Show"
          options={[{ value: 'all' as const, label: 'All' }, ...(Object.keys(ARTICLE_STATE_LABEL) as KbArticleState[]).map((k) => ({ value: k, label: ARTICLE_STATE_LABEL[k] }))]}
          value={f.state}
          onChange={(v) => props.onFilters({ ...f, state: v })}
        />
        <Checkbox label="Only articles marked out of date" checked={f.outdated} onChange={(v) => props.onFilters({ ...f, outdated: v })} />
        {props.articles.length === 0 ? (
          <EmptyState compact title={f.search || f.state !== 'all' || f.outdated ? 'No article matches.' : 'No articles yet.'} />
        ) : (
          <ul className="yx-ops-list" aria-label="Articles">
            {props.articles.map((r) => (
              <li key={r.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <button type="button" className="yx-desk-link" onClick={() => props.onOpenArticle(r.id)}>
                    {r.title}
                  </button>
                  <span className="yx-ops-row">
                    <Badge tone={ARTICLE_TONE[r.state]}>{ARTICLE_STATE_LABEL[r.state]}</Badge>
                    {r.waitingReview && r.state !== 'in_review' && <Badge tone="warning">Waiting for review</Badge>}
                    {r.outdated && <Badge tone="danger">Out of date</Badge>}
                    {r.featured && <Badge tone="info">Featured</Badge>}
                    <Badge tone={healthTone(r.health)}>Health {r.health}</Badge>
                  </span>
                  <span className="yx-ops-list__sub">
                    KB-{r.number} · {LANGUAGE_LABEL[r.language] ?? r.language}
                    {r.categoryId && cats.get(r.categoryId) ? ` · ${cats.get(r.categoryId)}` : ''} · Owner: {r.owner ?? 'nobody'} · Review by {r.reviewDueOn ? day(r.reviewDueOn) : '—'}
                    {r.reviewOverdue ? ' (overdue)' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {creating && (
        <NewArticleDrawer
          space={s}
          templates={props.templates ?? []}
          onClose={() => setCreating(false)}
          onSave={async (i) => {
            const a = await props.onCreateArticle(i);
            setCreating(false);
            props.onOpenArticle(a.id);
          }}
        />
      )}
    </Card>
  );
}

function NewArticleDrawer({ space, templates, onClose, onSave }: { space: KbSpace; templates: KbTemplate[]; onClose: () => void; onSave: (i: KbNewArticle) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="New article"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!title.trim()} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ spaceId: space.id, title: title.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}), ...(categoryId ? { categoryId } : {}), ...(templateId ? { templateId } : {}) }))}>
            Start the draft
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The article was not started">{error}</InlineAlert>}
        <FormField label="Title" required>
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

// ---------------------------------------------------------------- one article

function ArticleArea(props: KnowledgeScreenProps & { space: KbSpace | null }) {
  const a = props.article;
  if (!a || a.id !== props.articleId)
    return (
      <div className="yx-ops-stack">
        <div className="yx-ops-row">
          <Button size="sm" onClick={() => props.onOpenArticle(null)}>
            Back to articles
          </Button>
        </div>
        {props.articleState === 'error' || props.articleState === 'no-access' ? <EmptyState compact title="We couldn't open this article." description="It may have been deleted, or you cannot read this space." /> : <p className="yx-ops-muted">Opening the article…</p>}
      </div>
    );
  return (
    <div className="yx-ops-stack">
      <div className="yx-ops-row">
        <Button size="sm" onClick={() => props.onOpenArticle(null)}>
          Back to articles
        </Button>
        <Badge tone={ARTICLE_TONE[a.state]}>{ARTICLE_STATE_LABEL[a.state]}</Badge>
        {a.outdated && <Badge tone="danger">Out of date</Badge>}
        <Badge tone={healthTone(a.health)}>Health {a.health}</Badge>
      </div>
      <div className="yx-ops-ws">
        <div className="yx-ops-ws__main">
          <div className="yx-ops-stack">
            <ReviewCard key={`r-${a.id}-${a.versions[0]?.version}`} {...props} article={a} />
            {a.canAuthor ? <EditorCard key={`e-${a.id}-${a.versions[0]?.version}`} {...props} article={a} /> : <ReadCard article={a} />}
            <VersionsCard article={a} />
          </div>
        </div>
        <div className="yx-ops-ws__rail">
          <div className="yx-ops-stack">
            <ActionsCard {...props} article={a} />
            <DetailsCard key={`d-${a.id}-${a.version}`} {...props} article={a} />
            <TranslationsCard {...props} article={a} />
            <StatsCard {...props} article={a} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadCard({ article: a }: { article: KbArticle }) {
  return (
    <Card title={a.title}>
      {a.summary && <p className="yx-ops-muted">{a.summary}</p>}
      <MessageBody html={a.renderedHtml} />
    </Card>
  );
}

function EditorCard(props: KnowledgeScreenProps & { article: KbArticle }) {
  const a = props.article;
  const last = a.versions[0];
  const [title, setTitle] = useState(last?.title ?? a.title);
  const [summary, setSummary] = useState(last?.summary ?? a.summary ?? '');
  const [body, setBody] = useState(last?.bodyHtml ?? a.bodyHtml);
  const [note, setNote] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [blockKey, setBlockKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const input = () => ({ title: title.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}), bodyHtml: body, ...(note.trim() ? { note: note.trim() } : {}), version: last?.version ?? 1 });
  return (
    <Card title={`KB-${a.number} · edit`}>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        {saved && <InlineAlert tone="success">{saved}</InlineAlert>}
        <FormField label="Title" required>
          <TextField value={title} onChange={setTitle} maxLength={200} />
        </FormField>
        <FormField label="Summary" optional>
          <TextField value={summary} onChange={setSummary} maxLength={300} />
        </FormField>
        {(props.templates?.length ?? 0) > 0 && (
          <span className="yx-ops-row">
            <Select size="sm" aria-label="Template" value={templateId} onChange={setTemplateId} options={(props.templates ?? []).map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose a template" />
            <Button size="sm" disabled={!templateId} onClick={() => setBody(props.templates?.find((t) => t.id === templateId)?.bodyHtml ?? body)}>
              Use template
            </Button>
          </span>
        )}
        {(props.blocks?.length ?? 0) > 0 && (
          <span className="yx-ops-row">
            <Select size="sm" aria-label="Reusable block" value={blockKey} onChange={setBlockKey} options={(props.blocks ?? []).map((b) => ({ value: b.key, label: b.name, description: `{{block:${b.key}}}` }))} placeholder="Choose a reusable block" />
            <Button size="sm" disabled={!blockKey} onClick={() => setBody(`${body}<p>{{block:${blockKey}}}</p>`)}>
              Insert block
            </Button>
          </span>
        )}
        <FormField label="Article" required helper="A block shows as {{block:key}} here; readers see its current text.">
          <RichTextEditor value={body} onChange={setBody} mergeFields={[]} placeholder="Write the article" />
        </FormField>
        <FormField label="What changed" optional helper="A short note for the reviewer.">
          <TextField value={note} onChange={setNote} maxLength={300} />
        </FormField>
        <div className="yx-ops-row">
          <Button disabled={!title.trim()} loading={busy === 'save'} onClick={() => void run('save', async () => { const v = await props.onSaveDraft(a.id, input()); setSaved(`Draft saved as version ${v.version}.`); })}>
            Save draft
          </Button>
          <Button variant="primary" disabled={!title.trim()} loading={busy === 'submit'} onClick={() => void run('submit', async () => { const v = await props.onSaveDraft(a.id, input()); await props.onSubmit(a.id, v.version); setSaved(`Version ${v.version} was sent for review.`); })}>
            Send for review
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReviewCard(props: KnowledgeScreenProps & { article: KbArticle }) {
  const a = props.article;
  const v = a.versions.find((x) => x.state === 'in_review');
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun();
  if (!v) return null;
  if (!a.canPublish) return <InlineAlert tone="info">Version {v.version} is waiting for a publisher to review it.</InlineAlert>;
  return (
    <Card title={`Review version ${v.version}`}>
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The review was not saved">{error}</InlineAlert>}
        {v.mine && <InlineAlert tone="warning">You wrote this version, so someone else must review it.</InlineAlert>}
        <p className="yx-ops-muted">
          Written by {v.author || 'someone'}
          {v.note ? `: “${v.note}”` : ''}
        </p>
        <h3 className="yx-ops-card__title">{v.title}</h3>
        <MessageBody html={v.bodyHtml} />
        <FormField label="Note to the writer" optional>
          <TextField value={note} onChange={setNote} maxLength={300} />
        </FormField>
        <div className="yx-ops-row">
          <Button variant="primary" loading={busy === 'ok'} onClick={() => void run('ok', () => props.onReview(a.id, { version: v.version, approve: true, ...(note.trim() ? { note: note.trim() } : {}) }))}>
            Approve and publish
          </Button>
          <Button disabled={!note.trim()} loading={busy === 'back'} onClick={() => void run('back', () => props.onReview(a.id, { version: v.version, approve: false, note: note.trim() }))}>
            Send back
          </Button>
        </div>
        {!note.trim() && <p className="yx-ops-muted">Write a note to send it back.</p>}
      </div>
    </Card>
  );
}

function VersionsCard({ article: a }: { article: KbArticle }) {
  return (
    <Card title="Versions">
      {a.versions.length === 0 ? (
        <EmptyState compact title="No versions yet." />
      ) : (
        <ul className="yx-ops-list" aria-label="Versions">
          {a.versions.map((v) => (
            <li key={v.version} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-row">
                  <span className="yx-ops-list__title">Version {v.version}</span>
                  <Badge tone={VERSION_TONE[v.state]}>{VERSION_STATE_LABEL[v.state]}</Badge>
                </span>
                <span className="yx-ops-list__sub">
                  Written by {v.author || 'someone'}
                  {v.mine ? ' (you)' : ''} · {when(v.createdAt)}
                  {v.reviewedBy ? ` · reviewed by ${v.reviewedBy} ${when(v.reviewedAt)}` : ''}
                  {v.publishedAt ? ` · published ${when(v.publishedAt)}` : ''}
                </span>
                {v.note && <span className="yx-ops-list__sub">Note: {v.note}</span>}
                {v.reviewNote && <span className="yx-ops-list__sub">Reviewer’s note: {v.reviewNote}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActionsCard(props: KnowledgeScreenProps & { article: KbArticle }) {
  const a = props.article;
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  return (
    <Card title="Actions">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        {a.outdated && <InlineAlert tone="warning" title="Marked out of date">{a.outdatedReason}</InlineAlert>}
        <div className="yx-ops-row">
          <Button size="sm" loading={busy === 'follow'} onClick={() => void run('follow', () => props.onFollow(a.id, !a.following))}>
            {a.following ? 'Stop following' : 'Follow'}
          </Button>
          {a.canPublish && a.state === 'published' && (
            <Button size="sm" loading={busy === 'retire'} onClick={() => void run('retire', () => props.onRetire(a.id))}>
              Retire
            </Button>
          )}
          {a.canPublish && a.state === 'retired' && (
            <Button size="sm" loading={busy === 'back'} onClick={() => void run('back', () => props.onRepublish(a.id))}>
              Put back
            </Button>
          )}
          {a.canAuthor && !a.outdated && (
            <ConfirmDialog
              title="Mark this article out of date?"
              consequence="Its owner and followers see the reason. Publishing a new version clears the mark."
              confirmLabel="Mark out of date"
              confirmDisabled={reason.trim().length < 3}
              onConfirm={async () => { await props.onFlag(a.id, reason.trim()); setReason(''); }}
              trigger={<Button size="sm">Mark out of date</Button>}
            >
              <FormField label="What is wrong" required>
                <TextField value={reason} onChange={setReason} maxLength={300} />
              </FormField>
            </ConfirmDialog>
          )}
          {a.canPublish && (
            <ConfirmDialog
              title={`Delete KB-${a.number}?`}
              consequence="It goes to the recycle bin with its translations. You can put it back from there until the bin is emptied."
              confirmLabel="Delete article"
              destructive
              onConfirm={async () => { await props.onDelete(a.id); props.onOpenArticle(null); }}
              trigger={
                <Button size="sm" variant="danger">
                  Delete
                </Button>
              }
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function DetailsCard(props: KnowledgeScreenProps & { article: KbArticle; space: KbSpace | null }) {
  const a = props.article;
  const pub = a.canPublish;
  const [categoryId, setCategoryId] = useState<string | null>(a.categoryId);
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
  const { onSearchUsers } = props;
  useEffect(() => {
    if (!onSearchUsers || !find.trim()) return;
    const h = setTimeout(() => void onSearchUsers(find.trim()).then(setUsers).catch(() => setUsers([])), 250);
    return () => clearTimeout(h);
  }, [find]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a.canAuthor)
    return (
      <Card title="Details">
        <DescriptionList
          items={[
            { label: 'Web address', value: a.slug },
            { label: 'Owner', value: a.owner?.name ?? 'Nobody' },
            { label: 'Review by', value: day(a.reviewDueOn) || '—' },
          ]}
        />
      </Card>
    );
  const slugOk = ARTICLE_SLUG.test(slug);
  // Only what changed is sent: featured, dates and owner are a publisher's calls, so an author never sends them.
  const change = (): KbArticleMeta => ({
    ...(categoryId !== a.categoryId ? { categoryId } : {}),
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
  const cats = props.space?.id === a.spaceId ? categoryTree(props.space.categories) : [];
  return (
    <Card title="Details">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The details were not saved">{error}</InlineAlert>}
        <FormField label="Category" optional>
          <Select value={categoryId} onChange={setCategoryId} clearable options={cats.map((t) => ({ value: t.cat.id, label: t.path }))} placeholder="No category" />
        </FormField>
        <FormField label="Web address" helper={a.publishedAt ? 'If you change it, the old address keeps working and leads here.' : 'Small letters, digits and dashes.'} error={!slugOk ? 'Use small letters, digits and dashes' : null}>
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
        {pub && (
          <>
            <Checkbox label="Featured" description="Shown first on the help page." checked={featured} onChange={setFeatured} />
            <FormField label="Publish at" optional helper="An approved version waits until this time.">
              <TextField type="datetime-local" value={publishAt} onChange={setPublishAt} />
            </FormField>
            <FormField label="Expires at" optional>
              <TextField type="datetime-local" value={expiresAt} onChange={setExpiresAt} />
            </FormField>
            <FormField label="When it expires">
              <Segment label="When it expires" options={[{ value: 'flag', label: 'Flag for review' }, { value: 'hide', label: 'Hide it' }]} value={expiryAction} onChange={setExpiryAction} />
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
        )}
        {!pub && <p className="yx-ops-muted">Owner: {a.owner?.name ?? 'nobody'}. A publisher sets the owner, dates and featured articles.</p>}
        <div className="yx-ops-row">
          <Button disabled={!slugOk || Object.keys(change()).length === 0} loading={busy === 'save'} onClick={() => void run('save', () => props.onUpdateMeta(a.id, a.version, change()))}>
            Save details
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TranslationsCard(props: KnowledgeScreenProps & { article: KbArticle }) {
  const a = props.article;
  const [language, setLanguage] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const used = new Set([a.language, ...a.translations.map((t) => t.language)]);
  const free = a.space.languages.filter((l) => !used.has(l));
  const originalId = a.language === 'en' ? a.id : a.translationOfId;
  return (
    <Card title="Translations">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The translation was not started">{error}</InlineAlert>}
        <p className="yx-ops-muted">This one is in {LANGUAGE_LABEL[a.language] ?? a.language}.</p>
        {a.translations.length > 0 && (
          <ul className="yx-ops-list" aria-label="Translations">
            {a.translations.map((t) => (
              <li key={t.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <button type="button" className="yx-desk-link" onClick={() => props.onOpenArticle(t.id)}>
                    {LANGUAGE_LABEL[t.language] ?? t.language} · KB-{t.number}
                  </button>
                  <span className="yx-ops-list__sub">{ARTICLE_STATE_LABEL[t.state]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {a.canAuthor && originalId && free.length > 0 && (
          <span className="yx-ops-row">
            <Select size="sm" aria-label="Language of the translation" value={language} onChange={setLanguage} options={free.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] ?? l }))} placeholder="Choose a language" />
            <Button
              size="sm"
              disabled={!language}
              loading={busy === 'add'}
              onClick={() =>
                void run('add', async () => {
                  const t = await props.onCreateArticle({ spaceId: a.spaceId, title: a.title, language: language!, translationOfId: originalId });
                  props.onOpenArticle(t.id);
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

function StatsCard(props: KnowledgeScreenProps & { article: KbArticle }) {
  const a = props.article;
  const href = props.ticketHref ?? ((id: string) => `/yx/desk/tickets/${id}`);
  return (
    <Card title="How it is doing">
      <DescriptionList
        items={[
          { label: 'Health', value: `${a.health} of 100` },
          { label: 'Views (90 days)', value: a.stats.views },
          { label: 'Solved a problem', value: a.stats.solved },
          { label: 'Helpful', value: `${a.stats.yes} yes · ${a.stats.no} no` },
          { label: 'Who can read it', value: AUDIENCE_LABEL[a.audience] },
          ...(a.publicUrl ? [{ label: 'Public page', value: <a className="yx-desk-link" href={a.publicUrl} target="_blank" rel="noreferrer">Open</a> }] : []),
          ...(a.sourceTicket ? [{ label: 'Made from ticket', value: <a className="yx-desk-link" href={href(a.sourceTicket.id)}>Ticket {a.sourceTicket.number}</a> }] : []),
        ]}
      />
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
  const keyOk = kind === 'template' || SLUG.test(key);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Edit ${item.name}` : kind === 'block' ? 'New block' : 'New template'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || !keyOk} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ ...(kind === 'block' ? { key } : {}), name: name.trim(), bodyHtml: body }))}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        {kind === 'block' && item && <InlineAlert tone="warning">Every article that shows this block changes when you save.</InlineAlert>}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        {kind === 'block' && (
          <FormField label="Key" required helper="Authors insert it as {{block:key}}. 2 to 40 small letters, digits and dashes." error={key && !keyOk ? 'Use 2 to 40 small letters, digits and dashes' : null}>
            <TextField value={key} onChange={(v) => setKey(v.toLowerCase())} maxLength={40} />
          </FormField>
        )}
        <FormField label="Text" required>
          <RichTextEditor value={body} onChange={setBody} mergeFields={[]} placeholder="Write the text" />
        </FormField>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------- content gaps and the recycle bin

function GapsCard(props: KnowledgeScreenProps) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [gaps, setGaps] = useState<KbGaps | null>(null);
  const [deskId, setDeskId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const { busy, error, run } = useRun();
  const load = () => run('load', async () => setGaps(await props.onLoadGaps(from, to)));
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const task = (query: string) =>
    !props.canMakeTask ? null : done.has(query) ? (
      <span className="yx-ops-muted">Task made</span>
    ) : (
      <Button size="sm" aria-label={`Make an article-request task for ${query}`} disabled={!deskId} loading={busy === `t-${query}`} onClick={() => void run(`t-${query}`, async () => { await props.onGapTask(deskId!, query); setDone(new Set([...done, query])); })}>
        Make an article-request task
      </Button>
    );
  const queries = (title: string, rows: { query: string; times: number }[]) => (
    <Card title={title}>
      {rows.length === 0 ? (
        <EmptyState compact title="Nothing in this period." />
      ) : (
        <ul className="yx-ops-list" aria-label={title}>
          {rows.map((r) => (
            <li key={r.query} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-list__title">“{r.query}”</span>
                <span className="yx-ops-list__sub">{r.times} {r.times === 1 ? 'time' : 'times'}</span>
              </span>
              {task(r.query)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <span className="yx-ops-row">
        <FormField label="From">
          <TextField type="date" value={from} onChange={setFrom} />
        </FormField>
        <FormField label="To">
          <TextField type="date" value={to} onChange={setTo} />
        </FormField>
        <Button disabled={!from || !to || to < from} loading={busy === 'load'} onClick={() => void load()}>
          Show
        </Button>
      </span>
      {props.canMakeTask && (
        <FormField label="Desk for new tasks" helper="An article-request task goes to this desk, assigned to you.">
          <Select value={deskId} onChange={setDeskId} options={props.desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
        </FormField>
      )}
      {gaps && (
        <>
          {queries('Searches with no result', gaps.noResult)}
          {queries('Searches nobody opened', gaps.noClick)}
          <Card title="Solved tickets with no article">
            {gaps.noArticle.length === 0 ? (
              <EmptyState compact title="Nothing in this period." />
            ) : (
              <ul className="yx-ops-list" aria-label="Solved tickets with no article">
                {gaps.noArticle.map((r) => {
                  const q = r.category ? `${r.desk}: ${r.category}` : r.desk;
                  return (
                    <li key={q} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <span className="yx-ops-list__title">{q}</span>
                        <span className="yx-ops-list__sub">{r.tickets} solved {r.tickets === 1 ? 'ticket' : 'tickets'} with no article</span>
                      </span>
                      {task(q)}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const BIN_KIND: Record<string, string> = { kb_article: 'Article', view: 'Saved view', email_rule: 'Email rule' };

function BinCard({ items, onRestore }: { items: BinItem[]; onRestore: (id: string) => Promise<void> }) {
  const { busy, error, run } = useRun();
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
                <Button size="sm" aria-label={`Put back ${b.label}`} loading={busy === b.id} onClick={() => void run(b.id, () => onRestore(b.id))}>
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
