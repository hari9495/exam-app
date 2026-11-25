import { useEffect, useState } from 'react';
import { CalendarClock, HandHeart, Lightbulb, MessageCircleQuestion, NotebookPen } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { PersonPicker, type PersonOption } from '../../components/select';
import { Card } from '../../components/shell';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';

// Batch F item 32 (answer 2577): the quick-actions rail on PRF-08 Quick feedback, and private notes about a colleague.
// Notes are seen only by their author (never the person, HR or the next manager) and never used in reviews.

export interface PersonNote {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export function FeedbackRail({ onPraise, onSuggest, onAsk, onNotes, oneOnOneHref }: { onPraise: () => void; onSuggest: () => void; onAsk?: () => void; onNotes?: () => void; oneOnOneHref?: string }) {
  return (
    <Card title="Quick actions">
      <div className="yx-growth-stack">
        <Button fullWidth icon={HandHeart} onClick={onPraise}>Give praise</Button>
        <Button fullWidth icon={Lightbulb} onClick={onSuggest}>Give a suggestion</Button>
        {onAsk && <Button fullWidth icon={MessageCircleQuestion} onClick={onAsk}>Ask for feedback</Button>}
        {onNotes && <Button fullWidth icon={NotebookPen} onClick={onNotes}>Private notes</Button>}
        {oneOnOneHref && (
          <Button fullWidth icon={CalendarClock} asChild>
            <Link href={oneOnOneHref}>Plan a 1:1</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

export interface LivePersonNotes {
  people: PersonOption[];
  onPeopleSearch?: (q: string) => void;
  load: (employeeId: string) => Promise<PersonNote[]>;
  onAdd: (employeeId: string, text: string) => Promise<unknown>;
  onEdit: (id: string, text: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Story: who is chosen first, and their notes. */
  defaultPerson?: string;
  defaultNotes?: PersonNote[];
}

/** Private notes about one colleague at a time: add, change and delete; pressed empty, the note field says so. */
export function PrivateNotesDrawer({ open, onClose, live }: { open: boolean; onClose: () => void; live: LivePersonNotes }) {
  const { toast } = useToast();
  const [who, setWho] = useState<string | null>(live.defaultPerson ?? null);
  const [notes, setNotes] = useState<PersonNote[] | null>(live.defaultNotes ?? null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState<PersonNote | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = (id: string) => {
    setNotes(null);
    live.load(id).then(setNotes, (e: unknown) => setFailed(errorText(e)));
  };
  useEffect(() => {
    if (who && !live.defaultNotes) reload(who);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);
  const save = async () => {
    setTried(true);
    if (!text.trim()) return void setTimeout(() => document.getElementById('note-text')?.focus(), 0);
    setBusy(true);
    setFailed(null);
    try {
      if (editing) await live.onEdit(editing, text.trim());
      else await live.onAdd(who!, text.trim());
      toast({ tone: 'success', title: editing ? 'Note changed.' : 'Note saved. Only you can see it.' });
      setText('');
      setEditing(null);
      setTried(false);
      reload(who!);
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} title="Private notes" subtitle="Only you can see these. They are never shown to the person, HR or their next manager, and never used in reviews." footer={who ? <Button variant="primary" loading={busy} onClick={() => void save()}>{editing ? 'Save change' : 'Add note'}</Button> : undefined}>
      <div className="yx-growth-stack">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        <FormField label="About">
          <PersonPicker people={live.people} value={who} onChange={(v) => { setWho(v); setEditing(null); setText(''); }} onSearchChange={live.onPeopleSearch} />
        </FormField>
        {!who ? (
          <EmptyState compact title="Choose a colleague" description="Your notes about them show here." />
        ) : (
          <>
            {notes === null ? (
              <Skeleton height={80} />
            ) : notes.length === 0 ? (
              <EmptyState compact title="No notes yet." />
            ) : (
              <ul className="yx-growth-list" aria-label="My notes">
                {notes.map((n) => (
                  <li key={n.id} className="yx-growth-list__item">
                    <div className="yx-growth-list__main">
                      <span>{n.text}</span>
                      <span className="yx-growth-meta">{formatDate(new Date(n.updatedAt))}</span>
                    </div>
                    <Button size="sm" onClick={() => { setEditing(n.id); setText(n.text); }}>Change</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleting(n)}>Delete</Button>
                  </li>
                ))}
              </ul>
            )}
            <FormField id="note-text" label={editing ? 'Change the note' : 'New note'} required helper="At most 1,000 characters." error={tried && !text.trim() ? 'Write the note first.' : null}>
              <TextArea value={text} onChange={setText} rows={3} maxLength={1000} />
            </FormField>
          </>
        )}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this note?"
        consequence="It is gone for good."
        confirmLabel="Delete note"
        destructive
        onConfirm={async () => {
          try {
            await live.onDelete(deleting!.id);
            toast({ tone: 'success', title: 'Note deleted.' });
            reload(who!);
          } catch (e) {
            setFailed(errorText(e));
          }
          setDeleting(null);
        }}
      />
    </Drawer>
  );
}
