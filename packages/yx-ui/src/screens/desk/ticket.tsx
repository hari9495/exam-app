import { type ReactNode, useEffect, useState } from 'react';
import { MessageSquare, Send, Ticket as TicketIcon, UserPlus, X } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel, Tag } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { formatMoney } from '../../lib/format';
import { Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { RichTextEditor, STYLE_TOOLS } from '../../components/editor';
import { InsertArticleButton, articleLinkHtml, type ArticleOption } from './ticket-kb';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { Card, DescriptionList, ObjectHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody, PRIORITY_LABEL, PriorityBadge, STATE_LABEL, StatusBadge, TicketFlags, fillCanned, minutesText, when } from './desk-kit';
import { FileList } from './help';
import type { Attachment, CannedResponse, CostLineInput, DeskDetail, LoadState, Person, Presence, RequesterContext, TicketChange, TicketCosts, TicketDetail, TimelineEntry } from './types';

// Parts of the ticket workspace (US-B-090, US-B-091, US-G-003, SD-1.08): tags, the requester and their other tickets,
// where it came from, people on the ticket, time, the priority and type dialogs, timeline words. The page itself is the
// designed HLP-03 screen (ops/helpdesk.tsx with `live`, helpdesk-ticket-live.tsx).

const EVENT_WORDS: Record<string, string> = {
  created: 'Ticket raised',
  assigned: 'Owner changed',
  status_changed: 'Status changed',
  requester_chased: 'Reminder sent to the requester',
  priority_changed: 'Priority changed',
  category_changed: 'Category changed',
  group_changed: 'Group changed',
  tags_changed: 'Tags changed',
  type_changed: 'Ticket type changed',
  subject_changed: 'Subject changed',
  privacy_changed: 'Privacy changed',
  watcher_added: 'Someone now follows it',
  watcher_removed: 'Someone stopped following it',
  collaborator_added: 'Collaborator added',
  collaborator_removed: 'Collaborator removed',
  linked: 'Linked',
  unlinked: 'Link removed',
  merged: 'Merged into',
  merged_in: 'Ticket merged in',
  split: 'Split into',
  parent_changed: 'Parent changed',
  tracker_changed: 'Tracker changed',
  side_started: 'Side conversation started',
  task_added: 'Task added',
  task_changed: 'Task changed',
  tier_changed: 'Support level changed',
  sla_milestone: 'Response target milestone',
  sla_breached: 'Response target missed',
};

export function eventText(e: TimelineEntry): string {
  const words = EVENT_WORDS[e.kind] ?? e.kind.replace(/_/g, ' ');
  if (e.kind === 'priority_changed') return `${words}: P${e.from} → P${e.to}`;
  if (e.kind === 'assigned') return e.to ? `Assigned to ${e.to}` : 'Owner removed';
  if (e.kind === 'created' || e.kind.startsWith('watcher') || e.kind.startsWith('collaborator')) return words;
  return e.from || e.to ? `${words}: ${e.from ?? '—'} → ${e.to ?? '—'}` : words;
}

export function TagEditor({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange: (t: string[]) => void }) {
  const [tag, setTag] = useState('');
  const ok = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(tag.trim()) && !tags.includes(tag.trim());
  const early = useTooEarly(ok ? [] : [{ fieldId: 'tk-new-tag', message: tags.includes(tag.trim()) ? 'The ticket already has this tag.' : 'Write a tag: letters, digits, spaces or dashes, up to 40.' }]);
  return (
    <FormField id="tk-new-tag" label="Tags" error={early.errorOf('tk-new-tag')}>
      <div className="yx-ops-stack" data-gap="sm">
        {tags.length > 0 && (
          <span className="yx-ops-row">
            {tags.map((x) => (
              <Tag key={x} onRemove={disabled ? undefined : () => onChange(tags.filter((y) => y !== x))} removeLabel={`Remove tag ${x}`}>
                {x}
              </Tag>
            ))}
          </span>
        )}
        {!disabled && (
          <span className="yx-ops-row">
            <TextField size="sm" value={tag} onChange={setTag} aria-label="New tag" maxLength={40} />
            <Button
              size="sm"
              onClick={() => {
                if (early.stop()) return;
                onChange([...tags, tag.trim()]);
                setTag('');
              }}
            >
              Add tag
            </Button>
          </span>
        )}
      </div>
    </FormField>
  );
}

/** Batch 3: the customer company, plan and product, the screen help was asked from, and values read from the email. */
export function SourceCard({ ticket: t }: { ticket: TicketDetail }) {
  const read = Object.entries(t.fields ?? {}).filter(([k, v]) => k !== 'screen' && (typeof v === 'string' || typeof v === 'number'));
  const items = [
    ...(t.customer ? [{ label: 'Company', value: t.customer.account.name }, { label: 'Plan', value: t.customer.plan ?? 'No plan' }] : []),
    ...(t.product ? [{ label: 'Product', value: t.product.name }] : []),
    ...(t.screen ? [{ label: 'Raised from', value: t.screen }] : []),
    ...read.map(([k, v]) => ({ label: `${k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} (from the email)`, value: String(v) })),
  ];
  if (!items.length) return null;
  return (
    <Card title={t.customer || t.product ? 'Customer' : 'Where it came from'}>
      <DescriptionList items={items} />
    </Card>
  );
}

export function RequesterPanel({ ticket, context, onOpenTicket }: { ticket: TicketDetail; context: RequesterContext | null; onOpenTicket: (id: string) => void }) {
  const r = ticket.requester;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {r && <PersonLabel name={r.name} secondary={r.email ?? undefined} size={32} />}
      {context?.vip && <Badge tone="info">VIP</Badge>}
      {ticket.requestedFor && <p className="yx-ops-muted">Raised for {ticket.requestedFor.name}</p>}
      {context?.employee && (
        <DescriptionList
          items={[
            { label: 'Employee code', value: context.employee.code ?? '—' },
            { label: 'Role', value: context.employee.designation ?? '—' },
            { label: 'Department', value: context.employee.department ?? '—' },
            { label: 'Location', value: context.employee.location ?? '—' },
          ]}
        />
      )}
      <p className="yx-ops-muted">Other tickets</p>
      {context && context.otherTickets.length ? (
        <ul className="yx-ops-list" aria-label="The requester's other tickets">
          {context.otherTickets.map((o) => (
            <li key={o.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <button type="button" className="yx-desk-link" onClick={() => onOpenTicket(o.id)}>
                  {o.subject}
                </button>
                <span className="yx-ops-list__sub">
                  {o.number} · {STATE_LABEL[o.systemState]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">None you can see.</p>
      )}
      <p className="yx-ops-muted">Devices</p>
      {context && context.assets.length ? (
        <ul className="yx-ops-list" aria-label="The requester's devices">
          {context.assets.map((d) => (
            <li key={d.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                {d.name}
                <span className="yx-ops-list__sub">
                  {d.tag} · {d.category}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">None assigned in the asset register.</p>
      )}
    </div>
  );
}

export function PeoplePanel(p: {
  ticket: TicketDetail;
  collaborators: { userId: string; name: string }[];
  work: boolean;
  busy: string | null;
  onSearchPeople: (q: string) => Promise<Person[]>;
  onAddWatcher: (personId: string) => void;
  onRemoveWatcher: (watcherId: string) => void;
  onAddCollaborator: (userId: string) => void;
  onRemoveCollaborator: (userId: string) => void;
}) {
  const [find, setFind] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [collab, setCollab] = useState<string | null>(null);
  const collabEarly = useTooEarly(!collab ? [{ fieldId: 'tk-collab', message: 'Choose who to add.' }] : []);
  useEffect(() => {
    if (!p.work || find.trim().length < 2) return setFound([]);
    const h = setTimeout(() => void p.onSearchPeople(find.trim()).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(h);
  }, [find, p.work]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = p.ticket;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      <p className="yx-ops-muted">Following (they get replies, never notes)</p>
      {t.watchers.length ? (
        <ul className="yx-ops-list" aria-label="Following">
          {t.watchers.map((w) => (
            <li key={w.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span>{w.name}</span>
                <span className="yx-ops-list__sub">{w.external ? 'Outside the company' : 'Colleague'}</span>
              </span>
              {p.work && <IconButton icon={X} label={`Stop ${w.name} following`} size="sm" onClick={() => p.onRemoveWatcher(w.id)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">Nobody else.</p>
      )}
      {p.work && (
        <>
          <FormField label="Add someone to follow it" helper="Type two letters of a name or email">
            <TextField size="sm" value={find} onChange={setFind} />
          </FormField>
          {found.slice(0, 5).map((f) => (
            <Button key={f.id} size="sm" icon={UserPlus} onClick={() => p.onAddWatcher(f.id)}>
              {f.name}
              {f.email ? ` · ${f.email}` : ''}
            </Button>
          ))}
        </>
      )}
      <p className="yx-ops-muted">Collaborators (notes only, free)</p>
      {t.collaborators.length ? (
        <ul className="yx-ops-list" aria-label="Collaborators">
          {t.collaborators.map((c) => (
            <li key={c.userId} className="yx-ops-list__item">
              <span>{c.name}</span>
              {p.work && <IconButton icon={X} label={`Remove ${c.name}`} size="sm" onClick={() => p.onRemoveCollaborator(c.userId)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="yx-ops-muted">None.</p>
      )}
      {p.work && p.collaborators.length > 0 && (
        <span className="yx-ops-row">
          <FormField id="tk-collab" label="Collaborator to add" hideLabel error={collabEarly.errorOf('tk-collab')}>
            <Select size="sm" value={collab} onChange={setCollab} options={p.collaborators.map((c) => ({ value: c.userId, label: c.name }))} placeholder="Choose a collaborator" />
          </FormField>
          <Button size="sm" loading={p.busy === 'collab'} onClick={() => !collabEarly.stop() && collab && p.onAddCollaborator(collab)}>
            Add
          </Button>
        </span>
      )}
    </div>
  );
}

export function TimePanel({ ticket, work, busy, onAdd }: { ticket: TicketDetail; work: boolean; busy: boolean; onAdd: (minutes: number, note: string) => void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const early = useTooEarly(!minutes || minutes < 1 || minutes > 1440 ? [{ fieldId: 'tk-minutes', message: 'Enter the minutes, from 1 to 1440.' }] : []);
  return (
    <div className="yx-ops-stack" data-gap="sm">
      <p>
        <strong>{minutesText(ticket.time.totalMinutes)}</strong> in total
      </p>
      {ticket.time.entries.length > 0 && (
        <ul className="yx-ops-list" aria-label="Time entries">
          {ticket.time.entries.map((e) => (
            <li key={e.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span>
                  {minutesText(e.minutes)} · {e.who}
                </span>
                <span className="yx-ops-list__sub">
                  {e.workedOn}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {work && (
        <>
          <FormField id="tk-minutes" label="Minutes" error={early.errorOf('tk-minutes')}>
            <NumberField value={minutes} onChange={setMinutes} min={1} max={1440} />
          </FormField>
          <FormField label="What you did" optional>
            <TextArea value={note} onChange={setNote} rows={2} maxLength={500} />
          </FormField>
          <div className="yx-ops-row">
            <Button
              size="sm"
              loading={busy}
              onClick={() => {
                if (early.stop()) return;
                onAdd(minutes!, note.trim());
                setMinutes(null);
                setNote('');
              }}
            >
              Log time
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

const inr = (x: string) => formatMoney(Number(x));
const COST_KIND = { fixed: 'Fixed', material: 'Material' } as const;

/** GLPI 7 (answer 2719): an IT ticket's costs: time at its team's rate, fixed and material lines, the total. */
export function CostsPanel({ costs, work, busy, onAdd, onRemove }: { costs: TicketCosts; work: boolean; busy: boolean; onAdd: (line: CostLineInput) => Promise<unknown>; onRemove: (lineId: string, reason: string) => Promise<unknown> }) {
  const [kind, setKind] = useState<CostLineInput['kind']>('material');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [removing, setRemoving] = useState<TicketCosts['lines'][number] | null>(null);
  const [reason, setReason] = useState('');
  const early = useTooEarly([
    ...(description.trim().length < 2 ? [{ fieldId: 'tc-what', message: 'Say what the cost is for.' }] : []),
    ...(!amount || amount <= 0 ? [{ fieldId: 'tc-amount', message: 'Enter the amount in rupees.' }] : []),
  ]);
  const why = useTooEarly(reason.trim().length < 3 ? [{ fieldId: 'tc-why', message: 'Say why (at least 3 letters).' }] : []);
  return (
    <div className="yx-ops-stack" data-gap="sm">
      <DescriptionList
        items={[
          { label: 'Time', value: costs.hourlyRate ? `${inr(costs.timeCost)} at ${inr(costs.hourlyRate)} an hour` : costs.uncostedMinutes ? 'No hourly rate set for this team' : inr(costs.timeCost) },
          { label: 'Total', value: <strong>{inr(costs.total)}</strong> },
          { label: 'Charged to', value: costs.departments.length ? costs.departments.join(', ') : 'No department' },
        ]}
      />
      {costs.lines.length > 0 && (
        <ul className="yx-ops-list" aria-label="Cost lines">
          {costs.lines.map((l) => (
            <li key={l.id} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span>
                  {inr(l.amount)} · {l.description}
                </span>
                <span className="yx-ops-list__sub">
                  {COST_KIND[l.kind]} · {l.costOn} · {l.who}
                </span>
              </span>
              {work && l.canRemove && (
                <Button size="sm" onClick={() => setRemoving(l)}>
                  Take off
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {work && (
        <>
          <FormField label="Kind of cost">
            <Segment label="Kind of cost" options={[{ value: 'material', label: 'Material' }, { value: 'fixed', label: 'Fixed' }]} value={kind} onChange={setKind} />
          </FormField>
          <FormField id="tc-what" label="What for" error={early.errorOf('tc-what')}>
            <TextField value={description} onChange={setDescription} maxLength={200} />
          </FormField>
          <FormField id="tc-amount" label="Amount" error={early.errorOf('tc-amount')}>
            <CurrencyField allowPaise value={amount} onChange={setAmount} />
          </FormField>
          <div className="yx-ops-row">
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                if (early.stop()) return;
                if ((await onAdd({ kind, description: description.trim(), amount: String(amount) })) === false) return;
                setDescription('');
                setAmount(null);
                early.reset();
              }}
            >
              Add cost
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Take this cost off?"
        description={removing ? `${inr(removing.amount)} · ${removing.description}. It is kept with your reason.` : undefined}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (why.stop() || !removing) return;
                if ((await onRemove(removing.id, reason.trim())) === false) return;
                setRemoving(null);
                setReason('');
                why.reset();
              }}
            >
              Take off
            </Button>
          </>
        }
      >
        <FormField id="tc-why" label="Why" required error={why.errorOf('tc-why')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
        </FormField>
      </Dialog>
    </div>
  );
}

export function PriorityDialog({ value, onClose, onSave }: { value: number | null; onClose: () => void; onSave: (p: number, reason: string) => void }) {
  const [reason, setReason] = useState('');
  const early = useTooEarly(reason.trim().length < 3 ? [{ fieldId: 'tk-pri-reason', message: 'Say why (at least 3 letters).' }] : []);
  return (
    <Dialog
      open={value !== null}
      onOpenChange={(o) => !o && onClose()}
      title={value ? `Change priority to ${PRIORITY_LABEL[value]}` : 'Change priority'}
      description="Priority normally comes from impact and urgency. Say why you are changing it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (early.stop()) return;
              onSave(value!, reason.trim());
              setReason('');
              onClose();
            }}
          >
            Change priority
          </Button>
        </>
      }
    >
      <FormField id="tk-pri-reason" label="Reason" required error={early.errorOf('tk-pri-reason')}>
        <TextField value={reason} onChange={setReason} maxLength={300} />
      </FormField>
    </Dialog>
  );
}

export function ConvertDialog({ open, onOpenChange, types, onConvert }: { open: boolean; onOpenChange: (o: boolean) => void; types: { id: string; name: string }[]; onConvert: (typeId: string, reason: string) => void }) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const early = useTooEarly([...(!typeId ? [{ fieldId: 'tk-type', message: 'Choose the new type.' }] : []), ...(reason.trim().length < 3 ? [{ fieldId: 'tk-type-reason', message: 'Say why (at least 3 letters).' }] : [])]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change ticket type"
      description="The conversation and history stay. Response targets start again under the new type."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (early.stop()) return;
              onConvert(typeId!, reason.trim());
              onOpenChange(false);
            }}
          >
            Change type
          </Button>
        </>
      }
    >
      {types.length === 0 ? (
        <EmptyState compact title="No other ticket types on this desk." />
      ) : (
        <div className="yx-ops-stack">
          <FormField id="tk-type" label="New type" required error={early.errorOf('tk-type')}>
            <Select value={typeId} onChange={setTypeId} options={types.map((x) => ({ value: x.id, label: x.name }))} />
          </FormField>
          <FormField id="tk-type-reason" label="Reason" required error={early.errorOf('tk-type-reason')}>
            <TextField value={reason} onChange={setReason} maxLength={300} />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}
