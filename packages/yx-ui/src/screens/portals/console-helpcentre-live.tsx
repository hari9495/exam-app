// YX-11 Help-centre editor, live (YukthiX console C-8, answer 1057): the designed HelpEditorScreen with the console's
// data. YukthiX staff write the help articles every company sees in Help › This page (the H-1 pages link); one person
// writes, a different person publishes. The searches with no result are counts across companies, never names.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { Dialog } from '../../components/overlay';
import { RichTextEditor } from '../../components/editor';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { ConsolePage } from '../console/console-kit';
import type { LoadState } from '../console/types';
import { FilteredTable, opts } from './list-kit';

export interface HelpRow {
  id: string;
  number: number;
  title: string;
  state: 'draft' | 'in_review' | 'published' | 'retired';
  pages: string[];
  publishedAt: string | null;
  updatedAt: string;
}
export interface HelpVersion {
  version: number;
  title: string;
  summary: string | null;
  bodyHtml: string;
  author: string;
  mine: boolean;
  reviewNote: string | null;
  state: 'draft' | 'in_review' | 'approved' | 'sent_back' | 'published';
}
export interface HelpDetail {
  id: string;
  title: string;
  summary: string | null;
  pages: string[];
  state: HelpRow['state'];
  publicUrl: string | null;
  versions: HelpVersion[];
  /** Answer 2116: Ask YukthiX may answer from this article (on by default). */
  assistantUse?: boolean;
  /** Answer 1203: a retire request waiting for a second staff member. */
  retire?: { requestedBy: string; mine: boolean; reason: string; at: string } | null;
}
export interface HelpInput {
  title: string;
  summary?: string;
  bodyHtml: string;
  pages: string[];
  /** Answer 2116. */
  assistantUse?: boolean;
}
export interface HelpSettingRow {
  key: string;
  label: string;
  value: number;
  default: number;
  min: number;
  max: number;
}
export interface LiveHelpCentre {
  state: LoadState;
  onRetry: () => void;
  articles: HelpRow[];
  /** Searches with no result, counts only (only terms enough companies searched). */
  gaps: { query: string; companies: number; times: number }[];
  settings: HelpSettingRow[];
  loadArticle: (id: string) => Promise<HelpDetail>;
  onCreate: (input: HelpInput) => Promise<HelpDetail>;
  onSave: (id: string, input: HelpInput & { draftVersion?: number }) => Promise<HelpDetail>;
  onSubmit: (id: string, version: number) => Promise<HelpDetail>;
  onReview: (id: string, version: number, approve: boolean, note?: string) => Promise<HelpDetail>;
  /** Answer 1203: ask to retire a published article (a reason); another staff member approves it. */
  onRetire?: (id: string, reason: string) => Promise<HelpDetail>;
  onApproveRetire?: (id: string) => Promise<HelpDetail>;
  /** Answer 1263: the person who asked takes the request back while it waits. */
  onWithdrawRetire?: (id: string) => Promise<HelpDetail>;
  /** Answer 1261: the rules change only in Console › Platform settings (absent without platform.settings.manage). */
  onOpenPlatformSettings?: () => void;
  /** Stories: open the editor on this article (or a new one). */
  defaultOpen?: HelpDetail | 'new';
}

const STATE: Record<HelpRow['state'], string> = { draft: 'Draft', in_review: 'In review', published: 'Published', retired: 'Retired' };
const PAGE = /^\/yx(\/[a-z0-9-]+)+$/;
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');

export function LiveHelpCentreScreen({ live }: { live: LiveHelpCentre }) {
  const [editing, setEditing] = useState<{ detail: HelpDetail | null; title?: string; key: number } | null>(live.defaultOpen ? { detail: live.defaultOpen === 'new' ? null : live.defaultOpen, key: 0 } : null);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const open = async (id: string) => {
    setOpening(id);
    setFailed(null);
    try {
      setEditing({ detail: await live.loadArticle(id), key: Date.now() });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setOpening(null);
    }
  };
  return (
    <ConsolePage
      crumb="Help centre"
      title="Help-centre articles"
      description="Articles every company sees in Help › This page, on the pages they explain. A company's own article for a page shows instead."
      state={live.state}
      onRetry={live.onRetry}
      what="the help articles"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setEditing({ detail: null, key: Date.now() })}>
          New article
        </Button>
      }
    >
      <div className="yx-ps-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FilteredTable
          label="Articles"
          rows={live.articles}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.title} ${r.pages.join(' ')}`}
          fields={[{ key: 'state', label: 'Status', type: 'multi', options: opts(['Draft', 'In review', 'Published']) }]}
          columns={[
            { key: 'title', header: 'Title', value: (r) => r.title, width: 280 },
            { key: 'pages', header: 'Pages', value: (r) => r.pages.join(', '), width: 220 },
            { key: 'state', header: 'Status', type: 'status', value: (r) => STATE[r.state], statusTone: (v) => (v === 'Published' ? 'success' : v === 'In review' ? 'warning' : 'neutral'), width: 120 },
            { key: 'published', header: 'Published', value: (r) => r.publishedAt ?? '', render: (r) => (r.publishedAt ? formatDate(new Date(r.publishedAt)) : '—'), width: 130 },
          ]}
          rowButtons={(r) => (
            <Button size="sm" loading={opening === r.id} onClick={() => void open(r.id)}>
              Open
            </Button>
          )}
          empty={<EmptyState title="No help articles yet." description="Write the first one; it shows in every company's Help on the pages you choose." />}
        />
        <Card title={`Searches with no results`}>
          {live.gaps.length ? (
            <ul className="yx-ps-list" aria-label="Searches with no results">
              {live.gaps.map((g) => (
                <li key={g.query}>
                  <span className="yx-ps-list__main">“{g.query}”</span>
                  <span className="yx-ps-num">
                    {g.companies} companies · {g.times} searches
                  </span>
                  <Button size="sm" onClick={() => setEditing({ detail: null, title: g.query, key: Date.now() })}>
                    Write article
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="yx-ps-muted">None yet. A search shows here once enough companies searched it and found nothing.</p>
          )}
          <p className="yx-ps-muted">Counts only: never which company or who searched.</p>
        </Card>
        <SettingsCard live={live} />
      </div>
      {editing && <Editor key={editing.key} live={live} detail={editing.detail} initialTitle={editing.title} onClose={() => setEditing(null)} onChanged={(d) => setEditing((x) => (x ? { ...x, detail: d } : x))} />}
    </ConsolePage>
  );
}

function Editor({ live, detail, initialTitle, onClose, onChanged }: { live: LiveHelpCentre; detail: HelpDetail | null; initialTitle?: string; onClose: () => void; onChanged: (d: HelpDetail) => void }) {
  const latest = detail?.versions[0] ?? null;
  const [title, setTitle] = useState(latest?.title ?? initialTitle ?? '');
  const [summary, setSummary] = useState(latest?.summary ?? '');
  const [pages, setPages] = useState((detail?.pages ?? []).join(', '));
  const [body, setBody] = useState(latest?.bodyHtml ?? '');
  const [assistantUse, setAssistantUse] = useState(detail?.assistantUse ?? true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const pageList = pages.split(',').map((p) => p.trim()).filter(Boolean);
  const early = useTooEarly(
    [
      title.trim().length < 3 && { fieldId: 'hc-title', message: 'Write a title of at least 3 characters.' },
      !pageList.length && { fieldId: 'hc-pages', message: 'Name at least one page it explains, such as /yx/time/leave.' },
      pageList.some((p) => !PAGE.test(p)) && { fieldId: 'hc-pages', message: 'Pages are app addresses such as /yx/time/leave, separated by commas.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const noteEarly = useTooEarly(note.trim() ? [] : [{ fieldId: 'hc-note', message: 'Say what to change before sending it back.' }]);
  const [retiring, setRetiring] = useState(false);
  const [retireReason, setRetireReason] = useState('');
  const retireEarly = useTooEarly(retireReason.trim().length < 5 ? [{ fieldId: 'hc-retire', message: 'Say why it is retired (at least 5 characters).' }] : []);
  const retire = detail?.retire ?? null;
  const act = async (key: string, fn: () => Promise<HelpDetail>, done: string) => {
    setBusy(key);
    setFailed(null);
    try {
      onChanged(await fn());
      toast({ tone: 'success', title: done });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const input = (): HelpInput => ({ title: title.trim(), ...(summary.trim() ? { summary: summary.trim() } : {}), bodyHtml: body, pages: pageList, assistantUse });
  const save = () => {
    if (early.stop()) return;
    void act('save', () => (detail ? live.onSave(detail.id, { ...input(), draftVersion: latest?.version }) : live.onCreate(input())), 'Draft saved');
  };
  const waiting = latest?.state === 'in_review';
  const footer = waiting ? (
    latest!.mine ? (
      <span className="yx-ps-muted">In review: another staff member publishes it.</span>
    ) : (
      <>
        <Button loading={busy === 'back'} onClick={() => !noteEarly.stop() && void act('back', () => live.onReview(detail!.id, latest!.version, false, note.trim()), 'Sent back')}>
          Send back
        </Button>
        <Button variant="primary" loading={busy === 'publish'} onClick={() => void act('publish', () => live.onReview(detail!.id, latest!.version, true), 'Published for every company')}>
          Publish
        </Button>
      </>
    )
  ) : (
    <>
      <Button loading={busy === 'save'} onClick={save}>
        Save draft
      </Button>
      {detail && latest && latest.state !== 'published' && (
        <Button variant="primary" loading={busy === 'submit'} onClick={() => void act('submit', () => live.onSubmit(detail.id, latest.version), 'Sent for review')}>
          Send for review
        </Button>
      )}
      {detail?.state === 'published' && live.onRetire && !retire && (
        <Button variant="danger" onClick={() => (setRetireReason(''), retireEarly.reset(), setRetiring(true))}>
          Retire
        </Button>
      )}
      {detail?.state === 'published' && retire?.mine && live.onWithdrawRetire && (
        <Button loading={busy === 'withdraw'} onClick={() => void act('withdraw', () => live.onWithdrawRetire!(detail.id), 'Retire request withdrawn')}>
          Withdraw request
        </Button>
      )}
      {detail?.state === 'published' && retire && !retire.mine && live.onApproveRetire && (
        <Button variant="danger" loading={busy === 'retire'} onClick={() => void act('retire', () => live.onApproveRetire!(detail.id), 'Retired for every company')}>
          Approve retire
        </Button>
      )}
    </>
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={detail ? detail.title : 'New help article'}
      subtitle={detail ? `${STATE[detail.state]}${latest ? ` · version ${latest.version} by ${latest.mine ? 'you' : latest.author}` : ''}` : 'Every company sees it once another staff member publishes it.'}
      notice={
        failed ? (
          <InlineAlert tone="danger" title={failed} />
        ) : retire ? (
          <InlineAlert tone="warning" title={retire.mine ? 'You asked to retire it: another staff member approves' : `${retire.requestedBy} asks to retire it`}>
            {retire.reason}
          </InlineAlert>
        ) : latest?.state === 'sent_back' && latest.reviewNote ? (
          <InlineAlert tone="warning" title="Sent back">
            {latest.reviewNote}
          </InlineAlert>
        ) : undefined
      }
      footer={footer}
    >
      <div className="yx-ps-stack">
        {detail?.publicUrl && (
          <Badge tone="success">Published · {detail.publicUrl}</Badge>
        )}
        <FormField id="hc-title" label="Title" required error={early.errorOf('hc-title')}>
          <TextField value={title} onChange={setTitle} maxLength={200} readOnly={waiting} />
        </FormField>
        <FieldRow>
          <FormField id="hc-pages" label="Pages it explains" required helper="App addresses, separated by commas: a page and every page under it." error={early.errorOf('hc-pages')}>
            <TextField value={pages} onChange={setPages} maxLength={500} readOnly={waiting} />
          </FormField>
          <FormField label="Summary" optional>
            <TextField value={summary} onChange={setSummary} maxLength={300} readOnly={waiting} />
          </FormField>
        </FieldRow>
        <FormField label="Article (English)">
          <RichTextEditor value={body} onChange={setBody} mergeFields={[]} readOnly={waiting} />
        </FormField>
        <Switch
          checked={assistantUse}
          onChange={setAssistantUse}
          disabled={waiting}
          label="Use in assistant answers"
          description="Ask YukthiX answers from this article when it is published. Switch it off for an article the assistant should not quote. Saved with Save draft."
        />
        {retiring && live.onRetire && detail && (
          <Dialog
            open
            onOpenChange={(o) => !o && setRetiring(false)}
            size="sm"
            title={`Retire “${detail.title}”?`}
            description="It leaves every company's Help drawer once another staff member approves."
            footer={
              <>
                <Button onClick={() => setRetiring(false)}>Cancel</Button>
                <Button
                  variant="danger"
                  loading={busy === 'ask'}
                  onClick={() => {
                    if (retireEarly.stop()) return;
                    void act('ask', () => live.onRetire!(detail.id, retireReason.trim()), 'Retire requested: another staff member approves').then(() => setRetiring(false));
                  }}
                >
                  Ask to retire
                </Button>
              </>
            }
          >
            <FormField id="hc-retire" label="Why" required error={retireEarly.errorOf('hc-retire')} helper="Kept in the audit log.">
              <TextArea rows={2} value={retireReason} onChange={setRetireReason} maxLength={500} />
            </FormField>
          </Dialog>
        )}
        {waiting && !latest!.mine && (
          <FormField id="hc-note" label="Note for the writer" helper="Needed only to send it back." error={noteEarly.errorOf('hc-note')}>
            <TextArea rows={2} value={note} onChange={setNote} maxLength={300} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

/** Answer 1261: read here, changed in Console › Platform settings with the security key and a reason. */
function SettingsCard({ live }: { live: LiveHelpCentre }) {
  if (!live.settings.length) return null;
  return (
    <Card title="No-result search rules" actions={live.onOpenPlatformSettings ? <Button size="sm" onClick={live.onOpenPlatformSettings}>Change in Platform settings</Button> : undefined}>
      <div className="yx-ps-stack">
        <DescriptionList items={live.settings.map((s) => ({ label: s.label, value: s.value === s.default ? `${s.value} (the default)` : `${s.value} (default ${s.default})` }))} />
        <p className="yx-ps-muted">Changed in Console › Platform settings, with your security key and a reason.</p>
      </div>
    </Card>
  );
}
