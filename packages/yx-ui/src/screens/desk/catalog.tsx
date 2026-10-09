import { useMemo, useState } from 'react';
import { ExternalLink, ShoppingCart, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { answersToSend, formProblems, type Answers, type FormLang } from '../../lib/forms';
import { useRun } from '../org/org-kit';
import { DeskPage, MessageBody } from './desk-kit';
import type { CartLine, Catalogue, CatalogItemCard, CatalogItemPage, MyRequestView, OrderGuideView, PickKind, PickOption, RequestItemView } from './esm-types';
import { LivePicker, ServiceForm } from './service-form';
import type { LoadState } from './types';

// The service catalogue for requesters (SD-2.03, SD-2.04, US-B-124, US-G-041, US-G-042): items the person may order,
// each with its page and form; a cart checked out once (one request per desk, each item with its own approval and
// tasks); order guides that pick items from a few answers; and the stage tracker of a request with cancel.

export const LANGS: { value: FormLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'te', label: 'తెలుగు' },
];
const money = (n: number | null) => (n === null ? null : `₹${n.toLocaleString('en-IN')}`);
const STAGE_WORD: Record<string, string> = { submitted: 'Sent', approval: 'Approval', fulfilment: 'Being done', delivered: 'Delivered', cancelled: 'Cancelled', rejected: 'Not approved' };

export interface CatalogScreenProps {
  state: LoadState;
  onRetry?: () => void;
  catalogue: Catalogue;
  onOpenItem: (id: string) => Promise<CatalogItemPage>;
  onOpenGuide: (id: string) => Promise<OrderGuideView>;
  onResolveGuide: (id: string, answers: Answers) => Promise<{ id: string; name: string; shortText: string | null; cost: number | null }[]>;
  onCheckout: (input: { forPersonId?: string; items: { itemId: string; quantity: number; answers: Answers }[] }) => Promise<{ requests: { ticketId: string; number: string }[] }>;
  onPick: (kind: PickKind, q: string) => Promise<PickOption[]>;
  onOpenRequest: (ticketId: string) => void;
}

export function CatalogScreen(props: CatalogScreenProps) {
  const [lang, setLang] = useState<FormLang>('en');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<CatalogItemPage | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [quantity, setQuantity] = useState<number | null>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [forOther, setForOther] = useState(false);
  const [forPerson, setForPerson] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticketId: string; number: string }[] | null>(null);
  const [guide, setGuide] = useState<OrderGuideView | null>(null);
  const [guideAnswers, setGuideAnswers] = useState<Answers>({});
  const [suggested, setSuggested] = useState<{ id: string; name: string; shortText: string | null; cost: number | null }[] | null>(null);
  const { busy, error, run, clearError } = useRun();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return props.catalogue.items.filter((i) => !q || `${i.name} ${i.shortText ?? ''} ${i.category ?? ''} ${i.desk}`.toLowerCase().includes(q));
  }, [props.catalogue.items, search]);
  const byDesk = useMemo(() => {
    const m = new Map<string, CatalogItemCard[]>();
    for (const i of shown) m.set(i.desk, [...(m.get(i.desk) ?? []), i]);
    return [...m];
  }, [shown]);

  const openItem = (id: string) =>
    run(`open-${id}`, async () => {
      const page = await props.onOpenItem(id);
      setOpen(page);
      setAnswers({});
      setErrors({});
      setQuantity(1);
    });

  const addToCart = () => {
    if (!open) return;
    const problems = formProblems(open.form, answers, open.profile);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setCart([...cart, { key: `${open.id}-${Date.now()}`, item: open, quantity: Math.min(20, Math.max(1, quantity ?? 1)), answers: answersToSend(open.form, answers, open.profile) }]);
    setOpen(null);
  };

  const checkout = () =>
    run('checkout', async () => {
      const res = await props.onCheckout({ ...(forOther && forPerson ? { forPersonId: forPerson } : {}), items: cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity, answers: l.answers })) });
      setDone(res.requests);
      setCart([]);
      setForOther(false);
      setForPerson(null);
    });

  return (
    <DeskPage
      title="Service catalogue"
      description="Order what you need from IT, HR and other teams. Each item shows who approves it and how long it takes."
      state={props.state}
      onRetry={props.onRetry}
      what="the service catalogue"
      actions={<Segment label="Language of the forms" options={LANGS} value={lang} onChange={setLang} />}
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="That did not work">
            {error}{' '}
            <Button size="sm" onClick={clearError}>
              Close
            </Button>
          </InlineAlert>
        )}
        {done && (
          <InlineAlert tone="success" title={done.length > 1 ? 'Your requests are sent' : 'Your request is sent'}>
            <span className="yx-ops-row">
              {done.map((r) => (
                <Button key={r.ticketId} size="sm" onClick={() => props.onOpenRequest(r.ticketId)}>
                  Follow {r.number}
                </Button>
              ))}
            </span>
          </InlineAlert>
        )}
        {cart.length > 0 && (
          <Card title={`Your cart (${cart.length})`} actions={<Badge tone="info">{cart.length} item{cart.length > 1 ? 's' : ''}</Badge>}>
            <ul className="yx-esm-cart">
              {cart.map((l) => (
                <li key={l.key} className="yx-ops-row">
                  <ShoppingCart aria-hidden size={16} />
                  <span className="yx-esm-cart__name">{l.item.name}</span>
                  <span className="yx-ops-muted">{l.item.desk}</span>
                  <NumberField aria-label={`How many ${l.item.name}`} value={l.quantity} min={1} max={20} onChange={(n) => setCart(cart.map((x) => (x.key === l.key ? { ...x, quantity: Math.min(20, Math.max(1, n ?? 1)) } : x)))} size="sm" />
                  <IconButton icon={Trash2} label={`Remove ${l.item.name}`} onClick={() => setCart(cart.filter((x) => x.key !== l.key))} />
                </li>
              ))}
            </ul>
            <div className="yx-ops-stack">
              <Segment label="Who is this for" options={[{ value: 'me', label: 'For me' }, { value: 'other', label: 'For someone else' }]} value={forOther ? 'other' : 'me'} onChange={(v) => setForOther(v === 'other')} />
              {forOther && (
                <FormField label="Who it is for" helper="You can order for the people in your team. Their manager approves.">
                  <LivePicker kind="people" value={forPerson} onChange={setForPerson} label="Person" onPick={props.onPick} />
                </FormField>
              )}
              <div className="yx-ops-row">
                <Button variant="primary" onClick={() => void checkout()} disabled={busy === 'checkout' || (forOther && !forPerson)}>
                  {busy === 'checkout' ? 'Sending…' : 'Send request'}
                </Button>
              </div>
            </div>
          </Card>
        )}
        {props.catalogue.guides.length > 0 && (
          <Card title="Not sure what you need?">
            <div className="yx-ops-row">
              {props.catalogue.guides.map((g) => (
                <Button
                  key={g.id}
                  onClick={() =>
                    void run(`guide-${g.id}`, async () => {
                      setGuide(await props.onOpenGuide(g.id));
                      setGuideAnswers({});
                      setSuggested(null);
                    })
                  }
                >
                  {g.name}
                </Button>
              ))}
            </div>
          </Card>
        )}
        <FormField label="Search the catalogue" hideLabel>
          <TextField placeholder="Search the catalogue" value={search} onChange={setSearch} />
        </FormField>
        {byDesk.length === 0 && <EmptyState compact title={search ? 'Nothing matches that search.' : 'Nothing to order yet.'} description={search ? 'Try another word.' : 'Your teams have not put anything in the catalogue yet.'} />}
        {byDesk.map(([desk, items]) => (
          <Card key={desk} title={desk}>
            <ul className="yx-esm-items">
              {items.map((i) => (
                <li key={i.id}>
                  <button type="button" className="yx-esm-item" onClick={() => void openItem(i.id)} aria-label={`Open ${i.name}`}>
                    <span className="yx-esm-item__name">{i.name}</span>
                    {i.shortText && <span className="yx-esm-item__text">{i.shortText}</span>}
                    <span className="yx-ops-row yx-esm-item__facts">
                      {i.category && <Badge>{i.category}</Badge>}
                      {i.deliveryDays !== null && <span>{i.deliveryDays === 0 ? 'Same day' : `About ${i.deliveryDays} working day${i.deliveryDays > 1 ? 's' : ''}`}</span>}
                      {i.cost !== null && <span>{money(i.cost)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Drawer
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name ?? ''}
        subtitle={open ? [open.desk, open.deliveryDays !== null ? `about ${open.deliveryDays} working days` : null, money(open.cost)].filter(Boolean).join(' · ') : undefined}
        size="lg"
        dirty={Object.keys(answers).length > 0}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" onClick={addToCart}>
              Add to cart
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-ops-stack">
            {open.bodyHtml && <MessageBody html={open.bodyHtml} />}
            {open.media.length > 0 && (
              <ul className="yx-esm-media">
                {open.media.map((m) => (
                  <li key={m.url}>
                    <a className="yx-link" href={m.url} target="_blank" rel="noopener noreferrer">
                      {m.kind === 'video' ? 'Video: ' : m.kind === 'image' ? 'Picture: ' : 'Document: '}
                      {m.title} <ExternalLink aria-hidden size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="yx-ops-muted">{open.approvals.length ? `Approved by: ${open.approvals.join(', then ')}.` : 'No approval needed.'}</p>
            <ServiceForm form={open.form} values={answers} onChange={setAnswers} requester={open.profile} lang={lang} errors={errors} onPick={props.onPick} />
            <FormField label="How many" helper="Up to 20.">
              <NumberField value={quantity} onChange={setQuantity} min={1} max={20} />
            </FormField>
          </div>
        )}
      </Drawer>

      <Drawer
        open={Boolean(guide)}
        onOpenChange={(o) => !o && setGuide(null)}
        title={guide?.name ?? ''}
        subtitle={guide?.description ?? undefined}
        size="md"
        footer={
          <>
            <Button onClick={() => setGuide(null)}>Close</Button>
            <Button
              variant="primary"
              onClick={() =>
                guide &&
                void run('resolve', async () => {
                  setSuggested(await props.onResolveGuide(guide.id, answersToSend(guide.form, guideAnswers)));
                })
              }
            >
              Show what I need
            </Button>
          </>
        }
      >
        {guide && (
          <div className="yx-ops-stack">
            <ServiceForm form={guide.form} values={guideAnswers} onChange={setGuideAnswers} lang={lang} onPick={props.onPick} />
            {suggested && suggested.length === 0 && <EmptyState compact title="Nothing to add for these answers." />}
            {suggested && suggested.length > 0 && (
              <ul className="yx-esm-cart">
                {suggested.map((s) => (
                  <li key={s.id} className="yx-ops-row">
                    <span className="yx-esm-cart__name">{s.name}</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setGuide(null);
                        void openItem(s.id);
                      }}
                    >
                      Fill in and add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>
    </DeskPage>
  );
}

/** The stage tracker of an ordered request (US-G-042): submitted, approval, being done, delivered; cancel while it can. */
export function RequestTracker({ request, onCancel, timeZone }: { request: MyRequestView; onCancel?: (itemId: string | null, reason: string) => Promise<unknown>; timeZone?: string }) {
  const [cancelling, setCancelling] = useState<RequestItemView | 'all' | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const cancellable = request.items.filter((i) => i.canCancel);
  return (
    <Card title="What you ordered" actions={onCancel && cancellable.length > 1 ? <Button size="sm" onClick={() => setCancelling('all')}>Cancel all that can be</Button> : undefined}>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <ul className="yx-esm-requests">
        {request.items.map((i) => (
          <li key={i.id} className="yx-ops-stack">
            <div className="yx-ops-row">
              <strong>{i.item}</strong>
              {i.quantity > 1 && <span>× {i.quantity}</span>}
              <Badge tone={i.stage === 'delivered' ? 'success' : i.stage === 'rejected' || i.stage === 'cancelled' ? 'danger' : 'info'}>{STAGE_WORD[i.stage]}</Badge>
              {onCancel && i.canCancel && (
                <Button size="sm" onClick={() => setCancelling(i)}>
                  Cancel this
                </Button>
              )}
            </div>
            <ol className="yx-esm-tracker" aria-label={`Stages of ${i.item}`}>
              {i.tracker.map((t) => (
                <li key={t.stage} data-state={t.state}>
                  <span>{STAGE_WORD[t.stage]}</span>
                  <span className="yx-ops-muted">{t.state === 'done' ? 'Done' : t.state === 'current' ? 'Now' : t.state === 'stopped' ? 'Stopped' : 'Next'}</span>
                </li>
              ))}
            </ol>
            {i.approval && i.stage === 'approval' && (
              <p className="yx-ops-muted">
                Waiting for:{' '}
                {i.approval.steps
                  .filter((s) => s.state === 'open')
                  .map((s) => `${s.name} (${s.approvers.filter((a) => a.status === 'open').map((a) => a.name).join(', ') || 'being arranged'})`)
                  .join('; ')}
              </p>
            )}
            {i.approval?.log
              .filter((l) => l.action === 'rejected' || l.action === 'auto_rejected')
              .map((l) => (
                <InlineAlert key={l.at} tone="warning" title="Not approved">
                  {l.reason ?? 'No reason given.'}
                </InlineAlert>
              ))}
            {i.tasks.length > 0 && (
              <ul className="yx-ops-muted">
                {i.tasks.map((k) => (
                  <li key={k.id}>
                    {k.title}: {k.state === 'done' ? 'done' : k.state === 'cancelled' ? 'cancelled' : 'to do'}
                    {k.dueAt && k.state !== 'done' ? ` (by ${new Date(k.dueAt).toLocaleString('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' })})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Drawer
        open={Boolean(cancelling)}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={cancelling === 'all' ? 'Cancel everything that can be?' : `Cancel ${cancelling ? (cancelling as RequestItemView).item : ''}?`}
        footer={
          <>
            <Button onClick={() => setCancelling(null)}>Keep it</Button>
            <Button
              variant="danger"
              disabled={busy === 'cancel'}
              onClick={() =>
                void run('cancel', async () => {
                  await onCancel!(cancelling === 'all' ? null : (cancelling as RequestItemView).id, reason.trim());
                  setCancelling(null);
                  setReason('');
                })
              }
            >
              Cancel the request
            </Button>
          </>
        }
      >
        <FormField label="Why (optional)">
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={300} />
        </FormField>
      </Drawer>
    </Card>
  );
}
