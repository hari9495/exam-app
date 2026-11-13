import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';

/** DPDP Rule 7: the first notice to the Data Protection Board, once staff mark it sent. */
export interface BoardNotice {
  at: string;
  by?: string | null;
  note: string | null;
}

const at = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
/** The browser's local "now" as a datetime-local value. */
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * DPDP Rules 2025, Rule 7 (in force from 13 May 2027; founder, 13 Nov 2026): after a personal data breach the Data
 * Protection Board is told without delay (step 1, marked sent by staff with the time and a note), then gets the detailed
 * report within the report hours (step 2, as built). Both steps are legal timing: verify with counsel. Used on the
 * containment (C-4) and the breach incident (C-8).
 */
export function BoardNoticeSteps({ notice, dpdpDueAt, dpdpHours, onMark }: { notice: BoardNotice | null; dpdpDueAt: string; dpdpHours?: number; onMark?: (sentAt: string, note: string) => Promise<unknown> }) {
  const [sentAt, setSentAt] = useState(localNow);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToastIfAny();
  const timeError = tried && (!sentAt || Number.isNaN(new Date(sentAt).getTime())) ? 'Give the date and time the notice was sent.' : null;
  const noteError = tried && note.trim().length < 5 ? 'Say how it was sent, or its reference (at least 5 characters).' : null;
  const mark = async () => {
    setTried(true);
    if (!sentAt || Number.isNaN(new Date(sentAt).getTime()) || note.trim().length < 5) return;
    setBusy(true);
    try {
      await onMark!(new Date(sentAt).toISOString(), note.trim());
      toast?.toast({ tone: 'success', title: 'First notice to the Board marked as sent.' });
    } catch (e) {
      toast?.toast({ tone: 'error', title: e instanceof Error ? e.message : 'It was not saved. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Data Protection Board (DPDP Rule 7, from 13 May 2027)" actions={<Badge tone="warning">Verify with counsel</Badge>}>
      <div className="yx-ps-stack">
        <DescriptionList
          items={[
            { label: '1. Notify the Board now', value: notice ? `Sent ${at(notice.at)}${notice.by ? ` by ${notice.by}` : ''}${notice.note ? `: ${notice.note}` : ''}` : 'Not marked yet. Tell the Board without delay; Security leads are reminded until it is marked.' },
            { label: `2. Detailed report${dpdpHours ? ` (within ${dpdpHours} hours)` : ''}`, value: `Due by ${at(dpdpDueAt)}` },
          ]}
        />
        {!notice && onMark && (
          <>
            <FormField id="board-notice-at" label="Sent at" required error={timeError} helper="Your local time.">
              <TextField type="datetime-local" value={sentAt} onChange={setSentAt} />
            </FormField>
            <FormField id="board-notice-note" label="Note" required error={noteError} helper="How it was sent, and any reference. Kept in the audit log.">
              <TextArea rows={2} value={note} onChange={setNote} maxLength={500} />
            </FormField>
            <div>
              <Button variant="primary" loading={busy} onClick={() => void mark()}>
                Mark first notice sent
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
