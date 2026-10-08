import { useState } from 'react';
import { BookOpen, CheckCircle2, FilePlus2, Flag, Search } from 'lucide-react';
import { Button } from '../../components/button';
import { Dialog } from '../../components/overlay';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { useSuggestions, type KbSuggestion } from './help-kb';

// Knowledge on the ticket (US-G-023, US-B-106): insert an article link in a reply (only articles the requester can
// open), record which article solved the ticket (reuse count), flag an article out of date, and turn a solved ticket
// into a draft article (personal data removed by the server; it then goes through the normal review).

export interface ArticleOption extends KbSuggestion {
  url: string;
}

export interface TicketArticleLink {
  id: string;
  number: number;
  title: string;
  kind: 'linked' | 'solved';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The link put in the reply: plain words and the reader's address (the server cleans it again). */
export const articleLinkHtml = (a: ArticleOption) => `<p><a href="${esc(a.url)}">${esc(a.title)}</a></p>`;

/** "Insert article" next to the reply: search, then pick one. */
export function InsertArticleButton({ onFind, onInsert }: { onFind: (q: string) => Promise<ArticleOption[]>; onInsert: (a: ArticleOption) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const found = useSuggestions(q, onFind) as ArticleOption[];
  return (
    <>
      <Button icon={BookOpen} onClick={() => setOpen(true)}>
        Insert article
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Insert a help article" description="Only articles the requester can open are listed." footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
        <div className="yx-ops-stack">
          <FormField label="Search articles">
            <TextField value={q} onChange={setQ} prefix={<Search aria-hidden size={14} />} placeholder="At least 3 letters" maxLength={100} autoFocus />
          </FormField>
          {q.trim().length >= 3 && !found.length && <EmptyState compact title="No article matches." description="Write the answer, then make an article from the ticket once it is solved." />}
          <ul className="yx-ops-list" aria-label="Articles">
            {found.map((a) => (
              <li key={a.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span>{a.title}</span>
                  <span className="yx-ops-list__sub">KB-{a.number}{a.summary ? ` · ${a.summary}` : ''}</span>
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    onInsert(a);
                    setOpen(false);
                    setQ('');
                  }}
                >
                  Insert
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </>
  );
}

export interface TicketKbCardProps {
  links: TicketArticleLink[];
  solved: boolean;
  canWork: boolean;
  /** Spaces the agent may write in (for "Make an article"). */
  spaces: { id: string; name: string }[];
  onSolvedBy: (articleId: string) => Promise<unknown>;
  onFlag: (articleId: string, reason: string) => Promise<unknown>;
  onMakeArticle: (spaceId: string) => Promise<{ id: string }>;
  onOpenArticle: (articleId: string) => void;
}

/** The rail card: articles used on this ticket, what solved it, and "Make an article". */
export function TicketKbCard(p: TicketKbCardProps) {
  const { busy, error, run } = useRun();
  const [flagging, setFlagging] = useState<TicketArticleLink | null>(null);
  const [reason, setReason] = useState('');
  const [space, setSpace] = useState<string | null>(p.spaces.length === 1 ? p.spaces[0].id : null);
  const [made, setMade] = useState<string | null>(null);
  const linked = [...new Map(p.links.map((l) => [l.id, l])).values()];
  const solvedBy = p.links.find((l) => l.kind === 'solved');
  return (
    <Card title="Help articles">
      <div className="yx-ops-stack" data-gap="sm">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {linked.length === 0 ? (
          <p className="yx-ops-muted">No article used yet. Use “Insert article” in the reply.</p>
        ) : (
          <ul className="yx-ops-list" aria-label="Articles used">
            {linked.map((l) => (
              <li key={l.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <button type="button" className="yx-desk-link" onClick={() => p.onOpenArticle(l.id)}>
                    {l.title}
                  </button>
                  <span className="yx-ops-list__sub">KB-{l.number}{solvedBy?.id === l.id ? ' · solved this ticket' : ''}</span>
                </span>
                {p.canWork && (
                  <span className="yx-ops-row">
                    {solvedBy?.id !== l.id && (
                      <Button size="sm" icon={CheckCircle2} loading={busy === `s-${l.id}`} onClick={() => void run(`s-${l.id}`, () => p.onSolvedBy(l.id))}>
                        This solved it
                      </Button>
                    )}
                    <Button size="sm" icon={Flag} onClick={() => setFlagging(l)}>
                      Out of date
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {p.canWork && p.solved && p.spaces.length > 0 && (
          <div className="yx-ops-stack" data-gap="sm">
            {made ? (
              <InlineAlert tone="success" title="Draft article made">
                It goes through review before anyone reads it.{' '}
                <button type="button" className="yx-desk-link" onClick={() => p.onOpenArticle(made)}>
                  Open the draft
                </button>
              </InlineAlert>
            ) : (
              <>
                <FormField label="Make an article from this ticket" helper="We take the question and your answer, without the requester's name or personal data.">
                  <Select value={space} onChange={setSpace} options={p.spaces.map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose where it goes" />
                </FormField>
                <div className="yx-ops-row">
                  <Button icon={FilePlus2} disabled={!space} loading={busy === 'make'} onClick={() => void run('make', async () => setMade((await p.onMakeArticle(space!)).id))}>
                    Make draft article
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <Dialog
        open={Boolean(flagging)}
        onOpenChange={(o) => !o && setFlagging(null)}
        title="Flag the article as out of date"
        description="Its owner gets a task to check it."
        footer={
          <>
            <Button onClick={() => setFlagging(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={reason.trim().length < 3}
              loading={busy === 'flag'}
              onClick={() =>
                void run('flag', async () => {
                  await p.onFlag(flagging!.id, reason.trim());
                  setFlagging(null);
                  setReason('');
                })
              }
            >
              Flag it
            </Button>
          </>
        }
      >
        <FormField label="What is wrong?">
          <TextField value={reason} onChange={setReason} maxLength={300} />
        </FormField>
      </Dialog>
    </Card>
  );
}
