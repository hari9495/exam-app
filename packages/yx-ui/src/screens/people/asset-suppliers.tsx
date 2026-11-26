// IT assets part 3 (founder answer 2716): the IT and Admin supplier list (People › Asset suppliers; Helpdesk › IT
// suppliers). Separate from hiring's staffing vendors and from contract-labour contractors. Asset managers add, change
// and retire suppliers in a drawer; everyone who sees assets reads the list (to pick a supplier on an asset).
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { PeopleFrame, Segment } from './people-kit';

export interface SupplierContact {
  name: string;
  email: string | null;
  phone: string | null;
}
export interface SupplierRow {
  id: string;
  name: string;
  gstin: string | null;
  contacts: SupplierContact[];
  notes: string | null;
  retired: boolean;
  /** How many of the assets the viewer sees came from this supplier. */
  assets: number;
  version: number;
}
export interface SupplierInput {
  name: string;
  gstin: string | null;
  contacts: SupplierContact[];
  notes: string | null;
  retired?: boolean;
  version?: number;
}
export interface LiveSuppliers {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  rows: SupplierRow[];
  /** asset.manage holders add, change and retire suppliers. */
  canManage: boolean;
  /** null: a new supplier. */
  onSave: (id: string | null, input: SupplierInput) => Promise<unknown>;
}
type Show = 'active' | 'retired';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,19}$/;
const MAX_CONTACTS = 5;

/** The supplier list: the designed view (sample data) or, with `live`, the company's list. */
export function AssetSuppliersScreen(props: { rows: SupplierRow[]; canManage?: boolean; show?: Show; open?: 'new' | string } | { live: LiveSuppliers }) {
  if ('live' in props) return <SupplierList {...props.live} />;
  return <SupplierList state="ready" onRetry={() => undefined} rows={props.rows} canManage={props.canManage ?? true} onSave={() => Promise.resolve()} show={props.show} open={props.open} />;
}

function SupplierList({ state, onRetry, rows, canManage, onSave, show: initialShow = 'active', open: initialOpen }: LiveSuppliers & { show?: Show; open?: 'new' | string }) {
  const [show, setShow] = useState<Show>(initialShow);
  const [open, setOpen] = useState<'new' | string | null>(initialOpen ?? null);
  const shown = rows.filter((r) => r.retired === (show === 'retired'));
  const editing = open && open !== 'new' ? rows.find((r) => r.id === open) ?? null : null;
  const cols: TableColumn<SupplierRow>[] = [
    { key: 'name', header: 'Supplier', value: (r) => r.name, render: canManage ? (r) => <Link href={`#${r.id}`} onClick={(e) => (e.preventDefault(), setOpen(r.id))}>{r.name}</Link> : undefined, width: 240 },
    { key: 'gstin', header: 'GSTIN', type: 'id', value: (r) => r.gstin ?? '', width: 170 },
    {
      key: 'contacts',
      header: 'Contacts',
      value: (r) => r.contacts.map((c) => c.name).join(', '),
      render: (r) =>
        r.contacts.length ? (
          <span>
            {r.contacts.map((c, i) => (
              <Text key={i} size="sm" as="div">
                {[c.name, c.email, c.phone].filter(Boolean).join(' · ')}
              </Text>
            ))}
          </span>
        ) : (
          <span className="yx-table__none">—</span>
        ),
      width: 360,
    },
    { key: 'assets', header: 'Assets', type: 'number', value: (r) => r.assets, width: 100 },
  ];
  return (
    <PeopleFrame active="Assets">
      <PageHeader
        title="Asset suppliers"
        description="Who sells and services your IT and office assets. Hiring's staffing vendors and contract-labour contractors keep their own lists."
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => setOpen('new')}>Add supplier</Button> : undefined}
      />
      {state === 'no-access' ? (
        <NoAccessState what="the asset suppliers" grantedBy="your IT or HR admin" />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load the suppliers" description="Check your connection and try again." onRetry={onRetry} />
      ) : (
        <Card>
          <div className="yx-set-stack">
            <Segment<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'retired', label: 'Retired' }]} />
            <DataTable
              label="Asset suppliers"
              columns={cols}
              rows={shown}
              getRowId={(r) => r.id}
              state={state === 'loading' ? 'loading' : 'ready'}
              empty={
                show === 'retired' ? (
                  <EmptyState title="No retired suppliers" description="A retired supplier leaves the pickers; assets keep it." />
                ) : (
                  <EmptyState title="No suppliers yet" description="Add the companies you buy laptops, phones and their service from." action={canManage ? <Button onClick={() => setOpen('new')}>Add supplier</Button> : undefined} />
                )
              }
            />
          </div>
        </Card>
      )}
      {canManage && (open === 'new' || editing) && <SupplierDrawer key={open} supplier={editing} onClose={() => setOpen(null)} onSave={onSave} />}
    </PeopleFrame>
  );
}

type ContactDraft = { name: string; email: string; phone: string };
const blank = (): ContactDraft => ({ name: '', email: '', phone: '' });
const filled = (c: ContactDraft) => Boolean(c.name.trim() || c.email.trim() || c.phone.trim());

function SupplierDrawer({ supplier, onClose, onSave }: { supplier: SupplierRow | null; onClose: () => void; onSave: LiveSuppliers['onSave'] }) {
  const { toast } = useToast();
  const [name, setName] = useState(supplier?.name ?? '');
  const [gstin, setGstin] = useState(supplier?.gstin ?? '');
  const [contacts, setContacts] = useState<ContactDraft[]>(supplier?.contacts.length ? supplier.contacts.map((c) => ({ name: c.name, email: c.email ?? '', phone: c.phone ?? '' })) : [blank()]);
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [status, setStatus] = useState<Show>(supplier?.retired ? 'retired' : 'active');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = gstin.trim().toUpperCase();
  const problems: Record<string, string | null> = {
    name: name.trim().length >= 2 ? null : 'Enter the supplier name.',
    gstin: !g || GSTIN.test(g) ? null : 'A GSTIN has 15 characters, like 29ABCDE1234F1Z5.',
    ...Object.fromEntries(
      contacts.flatMap((c, i) =>
        !filled(c)
          ? []
          : [
              [`c${i}name`, c.name.trim().length >= 2 ? null : 'Enter the contact’s name.'],
              [`c${i}email`, !c.email.trim() || EMAIL.test(c.email.trim()) ? null : 'Enter an email like name@company.com.'],
              [`c${i}phone`, !c.phone.trim() || PHONE.test(c.phone.trim()) ? null : 'Enter 6 to 20 digits.'],
            ],
      ),
    ),
  };
  const shown = (k: string) => (tried ? problems[k] ?? null : null);
  const setContact = (i: number, k: keyof ContactDraft, v: string) => setContacts((xs) => xs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const save = async () => {
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(supplier?.id ?? null, {
        name: name.trim(),
        gstin: g || null,
        contacts: contacts.filter(filled).map((c) => ({ name: c.name.trim(), email: c.email.trim() || null, phone: c.phone.trim() || null })),
        notes: notes.trim() || null,
        ...(supplier ? { retired: status === 'retired', version: supplier.version } : {}),
      });
      toast({ tone: 'success', title: `${name.trim()} saved.` });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={supplier ? `Edit ${supplier.name}` : 'Add supplier'}
      dirty={Boolean(name || gstin)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {supplier ? 'Save supplier' : 'Add supplier'}
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <div className="yx-lif-grid">
          <FormField id="sp-name" label="Name" required error={shown('name')}>
            <TextField value={name} onChange={setName} maxLength={150} />
          </FormField>
          <FormField id="sp-gstin" label="GSTIN" optional helper="15 characters; it carries the supplier's PAN." error={shown('gstin')}>
            <TextField value={gstin} onChange={(v) => setGstin(v.toUpperCase())} maxLength={15} />
          </FormField>
        </div>
        {contacts.map((c, i) => (
          <div key={i} className="yx-set-stack">
            <Text size="sm" weight="semibold" as="div">{`Contact ${i + 1}`}</Text>
            <div className="yx-lif-grid">
              <FormField id={`sp-c${i}-name`} label="Contact name" optional error={shown(`c${i}name`)}>
                <TextField value={c.name} onChange={(v) => setContact(i, 'name', v)} maxLength={100} />
              </FormField>
              <FormField id={`sp-c${i}-email`} label="Email" optional error={shown(`c${i}email`)}>
                <TextField type="email" value={c.email} onChange={(v) => setContact(i, 'email', v)} maxLength={150} />
              </FormField>
              <FormField id={`sp-c${i}-phone`} label="Phone" optional error={shown(`c${i}phone`)}>
                <TextField type="tel" value={c.phone} onChange={(v) => setContact(i, 'phone', v)} maxLength={20} />
              </FormField>
            </div>
            {contacts.length > 1 && (
              <div>
                <Button size="sm" icon={Trash2} onClick={() => setContacts((xs) => xs.filter((_, j) => j !== i))}>
                  {`Remove contact ${i + 1}`}
                </Button>
              </div>
            )}
          </div>
        ))}
        {contacts.length < MAX_CONTACTS && (
          <div>
            <Button size="sm" icon={Plus} onClick={() => setContacts((xs) => [...xs, blank()])}>
              Add contact
            </Button>
          </div>
        )}
        <FormField id="sp-notes" label="Notes" optional helper="What they supply, account numbers, escalation route.">
          <TextArea rows={3} value={notes} onChange={setNotes} maxLength={500} />
        </FormField>
        {supplier && (
          <FormField id="sp-status" label="Status" helper="A retired supplier leaves the pickers. Assets and contracts that name it keep it.">
            <Segment<Show> label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'retired', label: 'Retired' }]} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}
