import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, FormSection } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Breadcrumbs, Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import type { EmailBranding, EmailDraft, EmailField, EmailOverview, EmailPreview, EmailTypeRow, EmailWording } from './types';

/* ---------- words and rules (the API checks everything again) ---------- */

const FIELDS: { field: EmailField; label: string; max: number; multi?: boolean; helper?: string }[] = [
  { field: 'subject', label: 'Subject', max: 150 },
  { field: 'heading', label: 'Heading', max: 120 },
  { field: 'intro', label: 'Opening text', max: 1000, multi: true, helper: 'Leave a blank line between paragraphs. Leave it empty to start with the details.' },
  { field: 'buttonLabel', label: 'Button text', max: 40 },
  { field: 'footer', label: 'Closing line', max: 500, multi: true, helper: 'Optional. For example your team’s name.' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** WCAG contrast of a colour against white button text (AA needs 4.5). */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/** What to fix in the branding before saving; mirrors the API. */
export function brandingErrors(b: EmailBranding): Partial<Record<keyof EmailBranding, string>> {
  const e: Partial<Record<keyof EmailBranding, string>> = {};
  if (b.accentColor && !HEX.test(b.accentColor)) e.accentColor = 'Use a colour code: # and six letters or digits';
  else if (b.accentColor && contrastWithWhite(b.accentColor) < 4.5) e.accentColor = 'White button text is hard to read on this colour. Choose a darker one.';
  if (b.senderName && /yukthi/i.test(b.senderName)) e.senderName = '"via YukthiX" is added for you. Use your company’s own name.';
  else if (b.senderName && !/^[\p{L}\p{N} &'.,()-]{2,60}$/u.test(b.senderName.trim())) e.senderName = 'Use 2 to 60 letters, numbers, spaces and & \' . , ( ) -';
  else if (b.senderName && /[\p{L}\p{N}-]{2,}\.\p{L}{2,}/u.test(b.senderName)) e.senderName = 'Use a name, not a web address.';
  if (b.replyTo && !/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(b.replyTo.trim())) e.replyTo = 'Enter a valid email address';
  return e;
}

const fieldErrorsOf = (err: unknown): Partial<Record<string, string>> => ((err as { body?: { errors?: Record<string, string> } })?.body?.errors ?? {});
const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const wordingOf = (row: EmailTypeRow): EmailWording => row.custom ?? row.defaults;
const same = (a: EmailWording, b: EmailWording) => FIELDS.every(({ field }) => a[field] === b[field]);

/* ---------- branding ---------- */

function BrandingForm({ overview, onSave, brandingHref }: { overview: EmailOverview; onSave: (b: EmailBranding) => Promise<void>; brandingHref?: string }) {
  const saved = overview.branding;
  const [draft, setDraft] = useState<EmailBranding>(saved);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string }>({ kind: 'idle' });
  const [show, setShow] = useState(false);
  const errors = brandingErrors(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<EmailBranding>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus({ kind: 'idle' });
  };
  const save = async () => {
    setShow(true);
    if (Object.keys(errors).length) return;
    setStatus({ kind: 'saving' });
    try {
      await onSave({ ...draft, senderName: draft.senderName?.trim() || null, replyTo: draft.replyTo?.trim() || null });
      setStatus({ kind: 'saved' });
    } catch (err) {
      setStatus({ kind: 'failed', message: messageOf(err, 'We couldn’t save. Nothing has changed.') });
    }
  };
  const err = (k: keyof EmailBranding) => (show ? errors[k] : undefined);
  const sender = `${draft.senderName?.trim() || overview.companyName} via YukthiX`;
  return (
    <Card title="Branding">
      <form className="yx-auth__settings" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormSection title="Logo">
          {overview.logoUrl ? (
            <img className="yx-ntf__logo" src={overview.logoUrl} alt={`${overview.companyName} logo`} />
          ) : (
            <Text as="p" tone="secondary" size="sm">
              No company logo yet, so emails show the YukthiX name.{brandingHref && <> <a href={brandingHref}>Add a logo</a>.</>}
            </Text>
          )}
          <Checkbox label="Show our logo at the top of emails" checked={draft.showLogo} onChange={(showLogo) => set({ showLogo })} disabled={!overview.logoUrl} />
        </FormSection>
        <FormSection title="Button colour" description="Buttons have white text, so the colour must be dark enough to read.">
          <FormField id="em-accent" label="Colour" error={err('accentColor')} helper="Empty means YukthiX blue.">
            <span className="yx-ntf__colour">
              <input
                type="color"
                className="yx-ntf__swatch"
                aria-label="Pick a colour"
                value={draft.accentColor && HEX.test(draft.accentColor) ? draft.accentColor : overview.defaultAccent}
                onChange={(e) => set({ accentColor: e.target.value.toUpperCase() })}
              />
              <TextField value={draft.accentColor ?? ''} onChange={(v) => set({ accentColor: v.trim() ? v.trim().toUpperCase() : null })} maxLength={7} placeholder={overview.defaultAccent} spellCheck={false} />
            </span>
          </FormField>
        </FormSection>
        <FormSection title="Sender">
          <FormField id="em-sender" label="Sender name" error={err('senderName')} helper={`People see: ${sender}. Emails always come from YukthiX’s own address.`}>
            <TextField value={draft.senderName ?? ''} onChange={(v) => set({ senderName: v || null })} maxLength={60} placeholder={`${overview.companyName} HR`} />
          </FormField>
          <FormField id="em-reply" label="Reply-to address" optional error={err('replyTo')} helper="Where replies go. Empty means replies aren’t read.">
            <TextField type="email" value={draft.replyTo ?? ''} onChange={(v) => set({ replyTo: v || null })} maxLength={254} placeholder="hr@yourcompany.com" />
          </FormField>
        </FormSection>
        {status.kind === 'saved' && <InlineAlert tone="success">Saved. New emails use it.</InlineAlert>}
        {status.kind === 'failed' && <InlineAlert tone="danger" title="Not saved">{status.message}</InlineAlert>}
        <div className="yx-auth__row yx-auth__save">
          <Button type="submit" variant="primary" loading={status.kind === 'saving'} disabled={!dirty}>Save branding</Button>
          <Button onClick={() => { setDraft(saved); setShow(false); setStatus({ kind: 'idle' }); }} disabled={!dirty || status.kind === 'saving'}>Discard changes</Button>
        </div>
      </form>
    </Card>
  );
}

/* ---------- one email: editor + live preview ---------- */

interface EditorProps {
  row: EmailTypeRow;
  overview: EmailOverview;
  onBack: () => void;
  onSave: (type: string, w: EmailWording) => Promise<void>;
  onReset: (type: string) => Promise<void>;
  onPreview: (type: string, draft: EmailDraft) => Promise<EmailPreview>;
  onTest: (type: string, draft: EmailDraft) => Promise<{ to: string }>;
}

export function EmailEditor({ row, overview, onBack, onSave, onReset, onPreview, onTest }: EditorProps) {
  const start = wordingOf(row);
  const [draft, setDraft] = useState<EmailWording>(start);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'testing' | 'saved' } | { kind: 'tested'; to: string } | { kind: 'failed'; message: string }>({ kind: 'idle' });
  const focused = useRef<{ field: EmailField; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  // Opened from further down the list: start at the top of the editor.
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' });
  }, []);
  const fields = FIELDS.filter((f) => f.field !== 'buttonLabel' || row.button);
  const dirty = !same(draft, start);

  // The preview is the real email, rendered by the API from the draft (debounced).
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      onPreview(row.type, { wording: draft })
        .then((p) => live && (setPreview(p), setErrors({})))
        .catch((err) => live && setErrors(fieldErrorsOf(err)));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [draft, row.type, onPreview]);

  const set = (field: EmailField, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setStatus({ kind: 'idle' });
  };
  const insert = (name: string) => {
    const target = focused.current;
    const field = target?.field ?? 'intro';
    const token = `{{${name}}}`;
    const value = draft[field];
    const at = target?.el.selectionStart ?? value.length;
    const end = target?.el.selectionEnd ?? at;
    set(field, value.slice(0, at) + token + value.slice(end));
    requestAnimationFrame(() => {
      target?.el.focus();
      target?.el.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const run = async (kind: 'saving' | 'testing', fn: () => Promise<void>) => {
    setStatus({ kind });
    try {
      await fn();
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      setStatus({ kind: 'failed', message: messageOf(err, 'Something went wrong. Nothing has changed.') });
    }
  };
  const track = (field: EmailField) => ({ onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => (focused.current = { field, el: e.currentTarget }) });

  return (
    <div className="yx-auth__page" ref={top}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Settings' }, { label: 'Notifications' }, { label: 'Emails' }, { label: row.name }]} />}
        title={row.name}
        description={`Sent when: ${row.sentWhen}`}
        status={<Badge tone={row.custom ? 'info' : 'neutral'}>{row.custom ? 'Your wording' : 'YukthiX wording'}</Badge>}
        actions={<Button onClick={onBack}>Back to emails</Button>}
      />
      <div className="yx-ntf__split">
        <form className="yx-ntf__editor" onSubmit={(e) => { e.preventDefault(); void run('saving', async () => { await onSave(row.type, draft); setStatus({ kind: 'saved' }); }); }} noValidate>
          <InlineAlert tone="info" title="Always included">
            {row.locked.join(' · ')}. These keep the email safe and can’t be changed.
          </InlineAlert>
          <FormSection title="Wording" description="Plain text only. Links come only from the button.">
            {fields.map(({ field, label, max, multi, helper }) => (
              <FormField key={field} id={`em-${field}`} label={label} required={field !== 'intro' && field !== 'footer'} optional={field === 'footer'} error={errors[field]} helper={helper}>
                {multi ? (
                  <TextArea value={draft[field]} onChange={(v) => set(field, v)} maxLength={max} rows={field === 'intro' ? 4 : 2} {...track(field)} />
                ) : (
                  <TextField value={draft[field]} onChange={(v) => set(field, v)} maxLength={max} {...track(field)} />
                )}
              </FormField>
            ))}
          </FormSection>
          <FormSection title="Add a placeholder" description="Goes where your cursor is. Each is filled in for every person.">
            <div className="yx-ntf__chips">
              {row.variables.map((v) => (
                <Button key={v} size="sm" className="yx-ntf__placeholder" onClick={() => insert(v)} aria-label={`Add ${overview.variables[v] ?? v}`}>
                  <span>{overview.variables[v] ?? v}</span>
                  <Text as="span" tone="secondary" size="sm" className="yx-mono">{`{{${v}}}`}</Text>
                </Button>
              ))}
            </div>
          </FormSection>
          {status.kind === 'saved' && <InlineAlert tone="success">Saved. The next {row.name.toLowerCase()} email uses your wording.</InlineAlert>}
          {status.kind === 'tested' && <InlineAlert tone="success">Test sent to {status.to}. It starts with “Test:”.</InlineAlert>}
          {status.kind === 'failed' && <InlineAlert tone="danger" title="Not done">{status.message}</InlineAlert>}
          <div className="yx-auth__row yx-auth__save">
            <Button type="submit" variant="primary" loading={status.kind === 'saving'} disabled={!dirty}>Save wording</Button>
            <Button loading={status.kind === 'testing'} onClick={() => void run('testing', async () => setStatus({ kind: 'tested', to: (await onTest(row.type, { wording: draft })).to }))}>
              Send me a test
            </Button>
            {row.custom && (
              <ConfirmDialog
                trigger={<Button variant="danger">Reset to YukthiX wording</Button>}
                title={`Reset ${row.name} to the YukthiX wording?`}
                consequence="Your wording for this email is removed. Branding stays."
                confirmLabel="Reset wording"
                destructive
                onConfirm={async () => {
                  await onReset(row.type);
                  setDraft(row.defaults);
                }}
              />
            )}
            <Button onClick={() => setDraft(start)} disabled={!dirty}>Discard changes</Button>
          </div>
        </form>
        <section className="yx-ntf__preview" aria-label="Preview">
          <Text as="p" weight="semibold">Preview</Text>
          {preview ? (
            <>
              <dl className="yx-ntf__meta">
                <dt>From</dt>
                <dd>{preview.fromName ?? 'YukthiX'}</dd>
                <dt>Subject</dt>
                <dd>{preview.subject}</dd>
              </dl>
              {/* Sandboxed: no scripts, no navigation, no same-origin access. */}
              <iframe className="yx-ntf__frame" title={`Preview of ${row.name}`} sandbox="" srcDoc={preview.html} />
            </>
          ) : (
            <Skeleton height={420} />
          )}
          {Object.keys(errors).length > 0 && <Text as="p" tone="secondary" size="sm">The preview shows the last version without problems.</Text>}
        </section>
      </div>
    </div>
  );
}

/* ---------- screen ---------- */

export interface EmailSettingsScreenProps {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  overview: EmailOverview | null;
  /** Where the company logo is uploaded. */
  brandingHref?: string;
  onSaveBranding: (b: EmailBranding) => Promise<void>;
  onSaveWording: (type: string, w: EmailWording) => Promise<void>;
  onResetWording: (type: string) => Promise<void>;
  onPreview: (type: string, draft: EmailDraft) => Promise<EmailPreview>;
  onTest: (type: string, draft: EmailDraft) => Promise<{ to: string }>;
}

/** Settings › Notifications › Email (P04 Q5): branding, and the wording of each email with a live preview. */
export function EmailSettingsScreen(props: EmailSettingsScreenProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const row = props.overview?.emails.find((e) => e.type === editing);
  if (props.state === 'ready' && props.overview && row) {
    return <EmailEditor key={row.type} row={row} overview={props.overview} onBack={() => setEditing(null)} onSave={props.onSaveWording} onReset={props.onResetWording} onPreview={props.onPreview} onTest={props.onTest} />;
  }
  return (
    <div className="yx-auth__page">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Settings' }, { label: 'Notifications' }, { label: 'Emails' }]} />}
        title="Emails"
        description="How the emails YukthiX sends your people look and read."
      />
      {props.state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={160} />
          <Skeleton height={320} />
        </div>
      )}
      {props.state === 'error' && <ErrorState title="We couldn't load the email settings." description="Nothing has changed. Try again in a moment." onRetry={props.onRetry} />}
      {props.state === 'no-access' && <NoAccessState grantedBy="a System Admin" what="the email settings" />}
      {props.state === 'ready' && props.overview && <EmailList overview={props.overview} brandingHref={props.brandingHref} onSaveBranding={props.onSaveBranding} onEdit={setEditing} />}
    </div>
  );
}

function EmailList({ overview, brandingHref, onSaveBranding, onEdit }: { overview: EmailOverview; brandingHref?: string; onSaveBranding: (b: EmailBranding) => Promise<void>; onEdit: (type: string) => void }) {
  const groups = useMemo(() => [...new Set(overview.emails.map((e) => e.group))], [overview.emails]);
  const columns: TableColumn<EmailTypeRow>[] = [
    {
      key: 'name',
      header: 'Email',
      value: (e) => e.name,
      render: (e) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{e.name}</Text>
          <Text tone="secondary" size="sm">{e.sentWhen}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'wording', header: 'Wording', value: (e) => (e.custom ? 'Yours' : 'YukthiX'), render: (e) => <Badge tone={e.custom ? 'info' : 'neutral'}>{e.custom ? 'Your wording' : 'YukthiX wording'}</Badge>, width: 170 },
  ];
  return (
    <>
      <BrandingForm overview={overview} onSave={onSaveBranding} brandingHref={brandingHref} />
      {groups.map((group) => (
        <section key={group} className="yx-auth__stack" aria-label={group}>
          <Text as="p" weight="semibold">{group}</Text>
          <DataTable
            label={group}
            columns={columns}
            rows={overview.emails.filter((e) => e.group === group)}
            getRowId={(e) => e.type}
            rowNoun={['email', 'emails']}
            cardSummary
            onRowClick={(e) => onEdit(e.type)}
            rowButtons={(e) => <Button size="sm" onClick={() => onEdit(e.type)} aria-label={`Edit ${e.name}`}>Edit</Button>}
          />
        </section>
      ))}
    </>
  );
}
