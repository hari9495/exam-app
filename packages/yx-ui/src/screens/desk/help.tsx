import { useState } from 'react';
import { Lock, Paperclip, Plus, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, StatusBadge, sizeText, when } from './desk-kit';
import type { Attachment, LoadState, MyTicket, MyTicketRow, RaiseDesk, RaiseInput } from './types';

// HLP-01 Help centre, wired (US-B-086, US-G-004, YX-SD-16): raise a ticket with the right desk, follow my tickets.
// Search and the assistant arrive with the knowledge base (SD-1.24) and AI (3b-4).

export interface HelpCentreProps {
  state: LoadState;
  onRetry?: () => void;
  desks: RaiseDesk[];
  tickets: MyTicketRow[];
  onRaise: (input: RaiseInput) => Promise<{ id: string; number: string }>;
  onOpen: (id: string) => void;
}

const URGENCY = [
  { value: '4', label: 'Whenever' },
  { value: '3', label: 'This week' },
  { value: '2', label: 'Today' },
  { value: '1', label: 'Right now' },
] as const;

export function HelpCentreScreen(props: HelpCentreProps) {
  const [open, setOpen] = useState(false);
  const [raised, setRaised] = useState<string | null>(null);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const rows = props.tickets.filter((t) => show === 'all' || !['solved', 'closed'].includes(t.systemState));
  return (
    <DeskPage
      title="Help centre"
      description="Raise a ticket with the right team and follow it here."
      state={props.state}
      onRetry={props.onRetry}
      what="your tickets"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)} disabled={!props.desks.length}>
          Raise a ticket
        </Button>
      }
    >
      {raised && (
        <InlineAlert tone="success" title="Ticket raised">
          Your ticket number is {raised}. The team will reply here.
        </InlineAlert>
      )}
      <Card title="My tickets" actions={<Segment label="Which tickets" options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} value={show} onChange={setShow} />}>
        {rows.length === 0 ? (
          <EmptyState compact title={show === 'open' ? 'You have no open tickets.' : 'You have no tickets yet.'} description="When you raise a ticket, you can follow it here." />
        ) : (
          <ul className="yx-ops-list" aria-label="My tickets">
            {rows.map((t) => (
              <li key={t.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <button type="button" className="yx-desk-link" onClick={() => props.onOpen(t.id)}>
                    {t.subject}
                  </button>
                  <span className="yx-ops-list__sub">
                    <span className="yx-ops-mono">{t.number}</span> · {t.desk} · raised {when(t.createdAt)}
                    {t.role === 'requested_for' ? ' · raised for you' : t.role === 'watcher' ? ' · you follow it' : ''}
                  </span>
                </span>
                <span className="yx-ops-row">
                  {t.private && (
                    <Badge tone="neutral">
                      <Lock aria-hidden size={12} /> Private
                    </Badge>
                  )}
                  <StatusBadge label={t.status} state={t.systemState} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RaiseDrawer
        open={open}
        onOpenChange={setOpen}
        desks={props.desks}
        onRaise={async (input) => {
          const r = await props.onRaise(input);
          setRaised(r.number);
          setOpen(false);
        }}
      />
    </DeskPage>
  );
}

function RaiseDrawer({ open, onOpenChange, desks, onRaise }: { open: boolean; onOpenChange: (o: boolean) => void; desks: RaiseDesk[]; onRaise: (i: RaiseInput) => Promise<void> }) {
  const [deskId, setDeskId] = useState<string | null>(desks.length === 1 ? desks[0].id : null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [urgency, setUrgency] = useState<string>('3');
  const [isPrivate, setPrivate] = useState(false);
  const { busy, error, run } = useRun();
  const desk = desks.find((d) => d.id === deskId);
  const category = desk?.categories.find((c) => c.id === categoryId);
  const ready = Boolean(deskId && subject.trim() && details.trim());
  const reset = () => {
    setCategoryId(null);
    setTypeId(null);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Raise a ticket"
      subtitle="We send it to the right team. You can follow it in My tickets."
      dirty={Boolean(subject || details)}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'raise'}
            disabled={!ready}
            onClick={() =>
              void run('raise', () =>
                onRaise({ deskId: deskId!, categoryId: categoryId ?? undefined, typeId: typeId ?? undefined, subject: subject.trim(), description: details.trim(), impact: 3, urgency: Number(urgency), private: isPrivate || undefined }),
              )
            }
          >
            Raise ticket
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The ticket was not raised">{error}</InlineAlert>}
        <FormField label="Which team?" required>
          <Select
            value={deskId}
            onChange={(v) => {
              setDeskId(v);
              reset();
            }}
            options={desks.map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Choose a team"
          />
        </FormField>
        {desk && (
          <>
            <FormField label="What is it about?" optional>
              <Select
                value={categoryId}
                onChange={setCategoryId}
                clearable
                options={desk.categories.map((c) => ({ value: c.id, label: c.parentId ? `· ${c.name}` : c.name, description: c.sensitive ? 'Private: only this team’s agents see it' : undefined }))}
                placeholder="Choose a topic"
              />
            </FormField>
            {desk.types.length > 1 && (
              <FormField label="Kind of ticket" optional>
                <Select value={typeId} onChange={setTypeId} clearable options={desk.types.map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose a kind" />
              </FormField>
            )}
          </>
        )}
        <FormField label="Subject" required helper="One line, e.g. “VPN drops when I work from home”">
          <TextField value={subject} onChange={setSubject} maxLength={200} />
        </FormField>
        <FormField label="Details" required helper="Add dates, error messages or steps so the team can help faster. You can add files after raising it.">
          <TextArea value={details} onChange={setDetails} rows={5} maxLength={20000} />
        </FormField>
        <FormField label="How soon do you need it?">
          <Segment label="How soon do you need it?" options={URGENCY.map((u) => ({ value: u.value, label: u.label }))} value={urgency} onChange={setUrgency} />
        </FormField>
        {category?.sensitive ? (
          <InlineAlert tone="info" title="Private by default">
            Only this team’s agents can see tickets about {category.name.toLowerCase()}.
          </InlineAlert>
        ) : (
          <Checkbox checked={isPrivate} onChange={setPrivate} label="Keep this private" description="Only the team's agents can see it, not their admins." />
        )}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------- one ticket

export interface MyTicketScreenProps {
  state: LoadState;
  onRetry?: () => void;
  ticket: MyTicket | null;
  onBack: () => void;
  onReply: (text: string, attachmentIds: string[]) => Promise<void>;
  onUpload: (file: File) => Promise<Attachment>;
  onOpenFile: (attachmentId: string) => Promise<void>;
  onAddWatcher: (email: string) => Promise<void>;
}

/** The requester's view of one ticket: replies only, never the team's internal notes (YX-SD-13). */
export function MyTicketScreen(props: MyTicketScreenProps) {
  const t = props.ticket;
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [watcher, setWatcher] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const byMessage = new Map<string, Attachment[]>();
  for (const a of t?.attachments ?? []) {
    const k = a.messageId ?? '';
    byMessage.set(k, [...(byMessage.get(k) ?? []), a]);
  }
  return (
    <DeskPage
      title={t ? t.subject : 'Ticket'}
      description={t ? `${t.number} · ${t.desk.name} · raised ${when(t.createdAt)}${t.requestedFor ? ` for ${t.requestedFor}` : ''}` : undefined}
      state={props.state}
      onRetry={props.onRetry}
      what="this ticket"
      actions={<Button onClick={props.onBack}>Back to my tickets</Button>}
    >
      {t && (
        <div className="yx-ops-ws">
          <div className="yx-ops-ws__main">
            {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
            <Card title="Conversation">
              <ol className="yx-ops-conv" aria-label="Conversation">
                {t.messages.map((m) => (
                  <li key={m.id} className="yx-ops-msg" data-kind={m.mine ? 'mine' : undefined}>
                    <span className="yx-ops-msg__meta">
                      <span className="yx-ops-msg__who">{m.mine ? 'You' : m.author}</span>
                      <span>{when(m.createdAt)}</span>
                    </span>
                    <MessageBody html={m.bodyHtml} />
                    <FileList files={byMessage.get(m.id) ?? []} onOpen={(id) => void run(`file-${id}`, () => props.onOpenFile(id))} />
                  </li>
                ))}
              </ol>
              <FileList files={byMessage.get('') ?? []} onOpen={(id) => void run(`file-${id}`, () => props.onOpenFile(id))} title="Files you added" />
            </Card>
            {t.canReply ? (
              <Card title="Reply">
                <div className="yx-ops-stack">
                  <FormField label="Your reply" hideLabel>
                    <TextArea value={text} onChange={setText} rows={4} placeholder="Write to the team" maxLength={20000} />
                  </FormField>
                  <FormField label="Files" optional helper={`${t.desk.attachmentTypes.join(', ')} · up to ${t.desk.attachmentMaxMb} MB each`}>
                    <FileUpload
                      key={uploadKey}
                      accept={t.desk.attachmentTypes.map((x) => `.${x}`)}
                      maxSize={t.desk.attachmentMaxMb * 1024 * 1024}
                      upload={async (file, h) => {
                        h.onScanning();
                        const a = await props.onUpload(file);
                        setFiles((f) => [...f, a]);
                      }}
                    />
                  </FormField>
                  <div className="yx-ops-row">
                    <Button
                      variant="primary"
                      icon={Send}
                      disabled={!text.trim()}
                      loading={busy === 'reply'}
                      onClick={() =>
                        void run('reply', async () => {
                          await props.onReply(text.trim(), files.map((f) => f.id));
                          setText('');
                          setFiles([]);
                          setUploadKey((k) => k + 1);
                        })
                      }
                    >
                      Send reply
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <InlineAlert tone="info" title="This ticket is closed">
                Raise a new ticket if you still need help.
              </InlineAlert>
            )}
          </div>
          <div className="yx-ops-ws__rail">
            <Card title="Status">
              <div className="yx-ops-stack" data-gap="sm">
                <StatusBadge label={t.status} state={t.systemState} />
                <p className="yx-ops-muted">{t.assignee ? `${t.assignee} is working on it.` : 'Waiting for someone in the team to pick it up.'}</p>
                {t.private && <p className="yx-ops-muted">Private: only the team’s agents can see it.</p>}
                {t.history.length > 0 && (
                  <ul className="yx-ops-list" aria-label="Status changes">
                    {t.history.map((h) => (
                      <li key={h.at} className="yx-ops-list__item">
                        <span className="yx-ops-list__sub">
                          {h.to} · {when(h.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
            {t.canReply && (
              <Card title="Keep a colleague informed">
                <div className="yx-ops-stack" data-gap="sm">
                  <FormField label="Colleague's work email">
                    <TextField value={watcher} onChange={setWatcher} type="email" />
                  </FormField>
                  {added && <p className="yx-ops-muted">{added} will get updates.</p>}
                  <div className="yx-ops-row">
                    <Button
                      disabled={!watcher.includes('@')}
                      loading={busy === 'watch'}
                      onClick={() =>
                        void run('watch', async () => {
                          await props.onAddWatcher(watcher.trim());
                          setAdded(watcher.trim());
                          setWatcher('');
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </DeskPage>
  );
}

/** Files with their scan state: only clean files open (§14.2). */
export function FileList({ files, onOpen, title }: { files: Attachment[]; onOpen: (id: string) => void; title?: string }) {
  if (!files.length) return null;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {title && <p className="yx-ops-muted">{title}</p>}
      <ul className="yx-desk-files" aria-label={title ?? 'Files'}>
        {files.map((f) => (
          <li key={f.id}>
            {f.scanStatus === 'clean' ? (
              <Button size="sm" icon={Paperclip} onClick={() => onOpen(f.id)}>
                {f.fileName} · {sizeText(f.sizeBytes)}
              </Button>
            ) : (
              <span className="yx-ops-row">
                <Paperclip aria-hidden size={14} /> {f.fileName}{' '}
                <Badge tone={f.scanStatus === 'pending' ? 'neutral' : 'danger'}>{f.scanStatus === 'pending' ? 'Being checked for viruses' : 'Blocked: may be harmful'}</Badge>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
