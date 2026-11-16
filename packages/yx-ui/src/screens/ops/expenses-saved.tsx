// Keka ideas (2026-11): expenses saved first, claimed later. A single spend (amount, date, a receipt if there is one) is
// saved any time from Expenses home; later the person picks some into a new or draft claim, where each becomes a line.
// Built in our own design from the kit's cards, drawers and fields.
import { useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Card } from '../../components/shell';
import { ConfirmDialog } from '../../components/overlay';
import { FileUpload } from '../../components/upload';
import { Segment } from '../../components/segment';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { errorText } from '../org/org-kit';
import { day, money } from './expenses-live-data';

/** GET /expenses/me/items. */
export interface SavedExpense {
  id: string;
  spentOn: string;
  amount: string;
  categoryCode: string | null;
  merchant: string | null;
  description: string | null;
  receipt: boolean;
  createdAt: string;
}

export interface SavedExpenseInput {
  spentOn: string;
  amount: string;
  merchant: string | null;
  description: string | null;
  receipt: File | null;
}

export interface LiveSavedExpenses {
  items: SavedExpense[];
  currency: string;
  today: string;
  /** My draft claims, to add saved expenses to. */
  drafts: { id: string; title: string }[];
  onAdd: (x: SavedExpenseInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Into a draft claim (`claimId`) or a new one named `title`; resolves once the claim has the lines. */
  onClaim: (ids: string[], into: { claimId: string } | { title: string }) => Promise<void>;
  /** Opens "Add an expense" at once (the "Add an expense" action, Ctrl K). */
  startAdd?: boolean;
}

/** "Lunch with client · 12 Nov 2026" from what was saved. */
const what = (x: SavedExpense) => x.merchant || x.description || 'Expense';

export function SavedExpensesCard({ live }: { live: LiveSavedExpenses }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(Boolean(live.startAdd));
  const [picked, setPicked] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [removing, setRemoving] = useState<SavedExpense | null>(null);
  const items = live.items;
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const chosen = picked.filter((id) => items.some((x) => x.id === id));
  return (
    <Card
      title="Expenses to be claimed"
      actions={
        <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
          Add an expense
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact title="Nothing saved yet." description="Save a spend when it happens, with its receipt; put it in a claim later." />
      ) : (
        <div className="yx-ops-stack" data-gap="sm">
          <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="Expenses to be claimed">
            {items.map((x) => (
              <li key={x.id} className="yx-ops-tile">
                <div className="yx-ops-tile__row">
                  <Checkbox label={`${what(x)} · ${formatDate(day(x.spentOn))}`} checked={chosen.includes(x.id)} onChange={(on) => toggle(x.id, on)} />
                  <span className="yx-ops-tile__amount">{money(live.currency, x.amount)}</span>
                </div>
                <div className="yx-ops-tile__row">
                  {x.receipt ? <Badge tone="success">Receipt saved</Badge> : <Badge>No receipt</Badge>}
                  <IconButton icon={Trash2} label={`Remove ${what(x)}`} onClick={() => setRemoving(x)} />
                </div>
              </li>
            ))}
          </ul>
          <div className="yx-ops-row">
            <Button variant="primary" icon={Receipt} onClick={() => (chosen.length ? setClaiming(true) : toast({ tone: 'default', title: 'Tick the expenses to claim first.' }))}>
              {chosen.length ? `Claim ${chosen.length} selected` : 'Claim selected'}
            </Button>
          </div>
        </div>
      )}
      <AddSavedExpense open={adding} today={live.today} onClose={() => setAdding(false)} onAdd={live.onAdd} />
      <ClaimSavedExpenses
        open={claiming}
        count={chosen.length}
        drafts={live.drafts}
        onClose={() => setClaiming(false)}
        onClaim={async (into) => {
          await live.onClaim(chosen, into);
          setPicked([]);
          setClaiming(false);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing ? what(removing) : 'this expense'}?`}
        consequence="It leaves your saved expenses. Save it again if you still want to claim it."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          await live.onRemove(removing!.id);
          toast({ tone: 'success', title: 'Saved expense removed' });
          setRemoving(null);
        }}
      />
    </Card>
  );
}

function AddSavedExpense({ open, today, onClose, onAdd }: { open: boolean; today: string; onClose: () => void; onAdd: LiveSavedExpenses['onAdd'] }) {
  const { toast } = useToast();
  const [on, setOn] = useState<Date | null>(day(today));
  const [amt, setAmt] = useState<number | null>(null);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setOn(day(today));
    setAmt(null);
    setMerchant('');
    setNote('');
    setFile(null);
    setTried(false);
    setError(null);
  };
  const future = on ? dayKey(on) > today : false;
  const save = async () => {
    setTried(true);
    if (!on || future || !amt || amt <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ spentOn: dayKey(on), amount: amt.toFixed(2), merchant: merchant.trim() || null, description: note.trim() || null, receipt: file });
      toast({ tone: 'success', title: 'Expense saved', description: 'Claim it when you are ready.' });
      reset();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && (reset(), onClose())}
      title="Add an expense"
      subtitle="Saved for you only, until you put it in a claim."
      footer={
        <>
          <Button onClick={() => (reset(), onClose())}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save expense
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <FormField label="Receipt" helper="A photo or PDF, up to 10 MB. Optional: a bill without one can be declared in the claim.">
          <FileUpload accept={['.jpg', '.jpeg', '.png', '.pdf']} multiple={false} capture="environment" upload={async (f) => setFile(f)} onItemsChange={(list) => list.length === 0 && setFile(null)} />
        </FormField>
        <FieldRow>
          <FormField label="Date on the bill" required error={tried && !on ? 'Choose the date.' : future ? 'A bill cannot be dated in the future.' : undefined}>
            <DatePicker value={on} onChange={setOn} aria-label="Date on the bill" />
          </FormField>
          <FormField label="Amount" required error={tried && (!amt || amt <= 0) ? 'Enter the amount.' : undefined}>
            <CurrencyField value={amt} onChange={setAmt} allowPaise aria-label="Amount" />
          </FormField>
        </FieldRow>
        <FormField label="Where" helper="The shop, taxi or hotel.">
          <TextField value={merchant} onChange={setMerchant} maxLength={120} />
        </FormField>
        <FormField label="What for">
          <TextField value={note} onChange={setNote} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

function ClaimSavedExpenses({ open, count, drafts, onClose, onClaim }: { open: boolean; count: number; drafts: LiveSavedExpenses['drafts']; onClose: () => void; onClaim: (into: { claimId: string } | { title: string }) => Promise<void> }) {
  const [into, setInto] = useState<'new' | 'draft'>('new');
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const toDraft = into === 'draft' && drafts.length > 0;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && (setTried(false), onClose())}
      size="md"
      title={`Claim ${count} saved ${count === 1 ? 'expense' : 'expenses'}`}
      consequence="Each becomes a line, with its receipt. Check the lines, then send the claim."
      confirmLabel="Put in the claim"
      onConfirm={async () => {
        setTried(true);
        if (toDraft ? !draft : title.trim().length < 2) return false;
        await onClaim(toDraft ? { claimId: draft! } : { title: title.trim() });
        setTitle('');
        setDraft(null);
        setTried(false);
      }}
    >
      <div className="yx-ops-stack">
        {drafts.length > 0 && <Segment label="Put them in" value={into} onChange={setInto} options={[{ value: 'new', label: 'A new claim' }, { value: 'draft', label: 'A draft claim' }]} />}
        {toDraft ? (
          <FormField label="Draft claim" required error={tried && !draft ? 'Choose the claim.' : undefined}>
            <Select aria-label="Draft claim" value={draft} onChange={setDraft} options={drafts.map((d) => ({ value: d.id, label: d.title }))} />
          </FormField>
        ) : (
          <FormField label="What is the claim for" required error={tried && title.trim().length < 2 ? 'Say what the claim is for, in at least 2 characters.' : undefined} helper="For example: Mumbai distributor meet">
            <TextField value={title} onChange={setTitle} maxLength={150} />
          </FormField>
        )}
      </div>
    </ConfirmDialog>
  );
}
