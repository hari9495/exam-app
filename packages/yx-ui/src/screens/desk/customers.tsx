import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card, DescriptionList } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage } from './desk-kit';
import type { ContactRole, CustomerAccount, CustomerAccountRow, CustomerPlan, DeskSummary, Entitlement, LoadState, Product } from './types';

// Customers (SD-1.21, SD-1.22, SD-1.28): the companies a Customer support desk serves, their people, their plans (a
// sub-company uses its parent's plan unless it has its own), products, and which companies an agent may work on.

const ROLE_LABEL: Record<ContactRole, string> = { primary: 'Main contact', billing: 'Billing', technical: 'Technical', member: 'Member' };
const today = () => new Date().toISOString().slice(0, 10);
const list = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export interface CustomersScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** desk.customer.manage: agents on Customer support desks may only read. */
  canManage: boolean;
  accounts: CustomerAccountRow[];
  search: string;
  onSearch: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  account: CustomerAccount | null;
  products: Product[];
  desks: DeskSummary[];
  onCreateAccount: (input: { name: string; emailDomains: string[]; parentId?: string }) => Promise<void>;
  onUpdateAccount: (account: CustomerAccount, change: { name?: string; emailDomains?: string[]; ownerUserId?: string | null; parentId?: string | null; status?: 'active' | 'inactive' }) => Promise<void>;
  onAddContact: (input: { name: string; email: string; role: ContactRole; seesAccountTickets: boolean }) => Promise<void>;
  onUpdateContact: (contactId: string, change: { role?: ContactRole; seesAccountTickets?: boolean; status?: 'active' | 'inactive' }) => Promise<void>;
  onAddPlan: (input: { plan: string; tier: string; ticketsAllowed?: number; hoursAllowed?: number; whenUsedUp: 'flag' | 'hold'; validFrom: string; validTo?: string }) => Promise<void>;
  onEndPlan: (entitlementId: string, validTo: string) => Promise<void>;
  onSaveProduct: (id: string | null, input: { name: string; deskId: string | null; active: boolean }) => Promise<void>;
  onSearchUsers: (q: string) => Promise<{ id: string; name: string | null; email: string }[]>;
  onLoadAgentAccounts: (userId: string) => Promise<string[]>;
  onSetAgentAccounts: (userId: string, accountIds: string[]) => Promise<void>;
}

export const planText = (p: CustomerPlan | null) => (p ? `${p.plan} (${p.tier})${p.inherited ? ' · from the parent company' : ''}` : 'No plan');

export function CustomersScreen(props: CustomersScreenProps) {
  const [creating, setCreating] = useState(false);
  const a = props.account;
  return (
    <DeskPage
      title="Customers"
      description="The companies your Customer support desks serve, their people and their plans."
      state={props.state}
      onRetry={props.onRetry}
      what="the customers"
      actions={
        props.canManage ? (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New company
          </Button>
        ) : undefined
      }
    >
      <div className="yx-desk-setup">
        <Card title="Companies">
          <div className="yx-ops-stack" data-gap="sm">
            <TextField type="search" aria-label="Find a company" placeholder="Find a company" value={props.search} onChange={props.onSearch} />
            {props.accounts.length === 0 ? (
              <EmptyState compact title={props.search ? 'No company matches.' : 'No companies yet.'} />
            ) : (
              <ul className="yx-ops-list" aria-label="Companies">
                {props.accounts.map((x) => (
                  <li key={x.id} className="yx-ops-list__item" data-active={x.id === props.selectedId || undefined}>
                    <span className="yx-ops-list__main">
                      <button type="button" className="yx-desk-link" aria-current={x.id === props.selectedId ? 'true' : undefined} onClick={() => props.onSelect(x.id)}>
                        {x.name}
                      </button>
                      <span className="yx-ops-list__sub">
                        {x.contacts} {x.contacts === 1 ? 'person' : 'people'} · {planText(x.plan)}
                        {x.parent ? ` · part of ${x.parent}` : ''}
                        {x.status === 'inactive' ? ' · off' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        {a ? <AccountPanel key={a.id} {...props} account={a} /> : <EmptyState compact title="Choose a company to see its people and plans." />}
      </div>
      <div className="yx-ops-ws">
        <div className="yx-ops-ws__main">
          <ProductsCard {...props} />
        </div>
        <div className="yx-ops-ws__rail">{props.canManage && <AgentLimitsCard {...props} />}</div>
      </div>
      {creating && <AccountDrawer accounts={props.accounts} onClose={() => setCreating(false)} onSave={async (i) => { await props.onCreateAccount({ name: i.name, emailDomains: i.emailDomains, ...(i.parentId ? { parentId: i.parentId } : {}) }); setCreating(false); }} />}
    </DeskPage>
  );
}

function AccountDrawer({ account, accounts, onClose, onSave, onSearchUsers }: { account?: CustomerAccount; accounts: CustomerAccountRow[]; onClose: () => void; onSave: (i: { name: string; emailDomains: string[]; parentId: string | null; ownerUserId?: string | null; status: 'active' | 'inactive' }) => Promise<void>; onSearchUsers?: CustomersScreenProps['onSearchUsers'] }) {
  const [name, setName] = useState(account?.name ?? '');
  const [domains, setDomains] = useState((account?.emailDomains ?? []).join(', '));
  const [parentId, setParentId] = useState<string | null>(account?.parent?.id ?? null);
  const [owner, setOwner] = useState<string | null>(account?.owner?.id ?? null);
  const [find, setFind] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>(account?.owner ? [{ id: account.owner.id, name: account.owner.name, email: '' }] : []);
  const [status, setStatus] = useState<'active' | 'inactive'>(account?.status ?? 'active');
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (!onSearchUsers || !find.trim()) return;
    const h = setTimeout(() => void onSearchUsers(find.trim()).then(setUsers).catch(() => setUsers([])), 250);
    return () => clearTimeout(h);
  }, [find]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={account ? `Edit ${account.name}` : 'New company'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={busy === 'save'} onClick={() => void run('save', () => onSave({ name: name.trim(), emailDomains: list(domains), parentId, ...(account ? { ownerUserId: owner } : {}), status }))}>
            {account ? 'Save company' : 'Add company'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="The company was not saved">{error}</InlineAlert>}
        <FormField label="Company name" required>
          <TextField value={name} onChange={setName} maxLength={200} />
        </FormField>
        <FormField label="Email domains" optional helper="Email from these domains is matched to this company. Separated by commas, like acme.com">
          <TextField value={domains} onChange={setDomains} maxLength={1000} />
        </FormField>
        <FormField label="Part of" optional helper="A sub-company uses its parent’s plan unless it has its own.">
          <Select value={parentId} onChange={setParentId} clearable searchable options={accounts.filter((x) => x.id !== account?.id).map((x) => ({ value: x.id, label: x.name }))} placeholder="Not part of another company" />
        </FormField>
        {account && onSearchUsers && (
          <>
            <FormField label="Find the account owner" helper="Name or email">
              <TextField value={find} onChange={setFind} />
            </FormField>
            <FormField label="Account owner" optional>
              <Select value={owner} onChange={setOwner} clearable options={users.map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email || undefined }))} placeholder="Nobody" />
            </FormField>
            <FormField label="Company">
              <Segment label="Company" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Off' }]} value={status} onChange={setStatus} />
            </FormField>
          </>
        )}
      </div>
    </Drawer>
  );
}

function AccountPanel(props: CustomersScreenProps & { account: CustomerAccount }) {
  const a = props.account;
  const can = props.canManage;
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      <Card title={a.name} actions={can ? <Button size="sm" onClick={() => setEditing(true)}>Edit company</Button> : undefined}>
        <DescriptionList
          items={[
            { label: 'Email domains', value: a.emailDomains.join(', ') || '—' },
            { label: 'Plan', value: planText(a.plan) },
            { label: 'Account owner', value: a.owner?.name ?? 'Nobody' },
            { label: 'Part of', value: a.parent?.name ?? '—' },
            { label: 'Sub-companies', value: a.children.map((c) => c.name).join(', ') || 'None' },
            { label: 'Status', value: a.status === 'active' ? 'Active' : 'Off' },
          ]}
        />
      </Card>
      <ContactsCard {...props} run={run} busy={busy} />
      <PlansCard {...props} run={run} busy={busy} />
      {editing && <AccountDrawer account={a} accounts={props.accounts} onSearchUsers={props.onSearchUsers} onClose={() => setEditing(false)} onSave={async (i) => { await props.onUpdateAccount(a, i); setEditing(false); }} />}
    </div>
  );
}

type Runner = { run: (key: string, fn: () => Promise<unknown>) => Promise<boolean>; busy: string | null };

function ContactsCard(props: CustomersScreenProps & { account: CustomerAccount } & Runner) {
  const { account: a, canManage: can, run, busy } = props;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ContactRole>('member');
  const [sees, setSees] = useState(false);
  return (
    <Card title="People">
      <div className="yx-ops-stack">
        {a.contacts.length === 0 ? (
          <EmptyState compact title="Nobody added yet." description="People added here can sign in to your help page with an email code." />
        ) : (
          <ul className="yx-ops-list" aria-label="People at this company">
            {a.contacts.map((c) => (
              <li key={c.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">
                    {c.name}
                    {c.status === 'inactive' ? ' · off' : ''}
                  </span>
                  <span className="yx-ops-list__sub">
                    {c.email} · {ROLE_LABEL[c.role]}
                  </span>
                  {can ? (
                    <Checkbox checked={c.seesAccountTickets} onChange={(v) => void run(`see-${c.id}`, () => props.onUpdateContact(c.id, { seesAccountTickets: v }))} label="Can see all the company's tickets" aria-label={`${c.name} can see all the company's tickets`} />
                  ) : (
                    c.seesAccountTickets && <span className="yx-ops-list__sub">Sees all the company’s tickets</span>
                  )}
                </span>
                {can && (
                  <span className="yx-ops-row">
                    <Select size="sm" aria-label={`Role of ${c.name}`} value={c.role} onChange={(v) => v && v !== c.role && void run(`role-${c.id}`, () => props.onUpdateContact(c.id, { role: v }))} options={(Object.keys(ROLE_LABEL) as ContactRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
                    <Button size="sm" aria-label={`${c.status === 'active' ? 'Turn off' : 'Turn on'} ${c.name}`} loading={busy === `st-${c.id}`} onClick={() => void run(`st-${c.id}`, () => props.onUpdateContact(c.id, { status: c.status === 'active' ? 'inactive' : 'active' }))}>
                      {c.status === 'active' ? 'Turn off' : 'Turn on'}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {can && (
          <>
            <h3 className="yx-ops-card__title">Add a person</h3>
            <FormField label="Name" required>
              <TextField value={name} onChange={setName} maxLength={100} />
            </FormField>
            <FormField label="Email" required>
              <TextField type="email" value={email} onChange={setEmail} maxLength={254} />
            </FormField>
            <FormField label="Role">
              <Segment label="Role" options={(Object.keys(ROLE_LABEL) as ContactRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={role} onChange={setRole} />
            </FormField>
            <Checkbox checked={sees} onChange={setSees} label="Can see all the company's tickets" description="Otherwise they see only the tickets they raised." />
            <div className="yx-ops-row">
              <Button disabled={!name.trim() || !email.includes('@')} loading={busy === 'contact'} onClick={() => void run('contact', async () => { await props.onAddContact({ name: name.trim(), email: email.trim().toLowerCase(), role, seesAccountTickets: sees }); setName(''); setEmail(''); setSees(false); })}>
                Add person
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

const planLine = (e: Entitlement) =>
  [e.ticketsAllowed !== null ? `${e.ticketsAllowed} tickets` : 'Any number of tickets', e.hoursAllowed !== null ? `${e.hoursAllowed} hours` : null, `from ${e.validFrom}${e.validTo ? ` to ${e.validTo}` : ''}`, e.whenUsedUp === 'hold' ? 'new tickets wait when used up' : 'flagged when used up'].filter(Boolean).join(' · ');

function PlansCard(props: CustomersScreenProps & { account: CustomerAccount } & Runner) {
  const { account: a, canManage: can, run, busy } = props;
  const [plan, setPlan] = useState('');
  const [tier, setTier] = useState('');
  const [tickets, setTickets] = useState<number | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [usedUp, setUsedUp] = useState<'flag' | 'hold'>('flag');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState('');
  const tierOk = /^[a-z][a-z0-9_-]{0,39}$/.test(tier);
  return (
    <Card title="Plans">
      <div className="yx-ops-stack">
        {a.plan?.inherited && <InlineAlert tone="info">Uses {a.plan.plan} from the parent company{a.parent ? ` (${a.parent.name})` : ''}.</InlineAlert>}
        {a.entitlements.length === 0 ? (
          !a.plan?.inherited && <EmptyState compact title="No plan." description="Without a plan, tickets are not counted against anything." />
        ) : (
          <ul className="yx-ops-list" aria-label="Plans">
            {a.entitlements.map((e) => (
              <li key={e.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">
                    {e.plan} <Badge tone="neutral">{e.tier}</Badge>
                  </span>
                  <span className="yx-ops-list__sub">{planLine(e)}</span>
                </span>
                {can && (!e.validTo || e.validTo >= today()) && (
                  <Button size="sm" aria-label={`End plan ${e.plan}`} loading={busy === `end-${e.id}`} onClick={() => void run(`end-${e.id}`, () => props.onEndPlan(e.id, today()))}>
                    End plan
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {can && (
          <>
            <h3 className="yx-ops-card__title">Add a plan</h3>
            <FormField label="Plan name" required>
              <TextField value={plan} onChange={setPlan} maxLength={60} placeholder="Gold support" />
            </FormField>
            <FormField label="Tier" required helper="One short word in small letters, like gold. Response targets can use it." error={tier && !tierOk ? 'Use one short word in small letters' : null}>
              <TextField value={tier} onChange={(v) => setTier(v.toLowerCase())} maxLength={40} />
            </FormField>
            <span className="yx-ops-row">
              <FormField label="Tickets allowed" optional>
                <NumberField value={tickets} onChange={setTickets} min={0} max={100000} />
              </FormField>
              <FormField label="Hours allowed" optional>
                <NumberField value={hours} onChange={setHours} min={0} max={100000} />
              </FormField>
            </span>
            <FormField label="When it is used up">
              <Segment label="When it is used up" options={[{ value: 'flag', label: 'Flag new tickets' }, { value: 'hold', label: 'Hold new tickets' }]} value={usedUp} onChange={setUsedUp} />
            </FormField>
            <span className="yx-ops-row">
              <FormField label="From" required>
                <TextField type="date" value={from} onChange={setFrom} />
              </FormField>
              <FormField label="Until" optional>
                <TextField type="date" value={to} onChange={setTo} />
              </FormField>
            </span>
            <div className="yx-ops-row">
              <Button
                disabled={!plan.trim() || !tierOk || !from || Boolean(to && to < from)}
                loading={busy === 'plan'}
                onClick={() =>
                  void run('plan', async () => {
                    await props.onAddPlan({ plan: plan.trim(), tier, ...(tickets !== null ? { ticketsAllowed: tickets } : {}), ...(hours !== null ? { hoursAllowed: hours } : {}), whenUsedUp: usedUp, validFrom: from, ...(to ? { validTo: to } : {}) });
                    setPlan('');
                    setTier('');
                  })
                }
              >
                Add plan
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ProductsCard(props: CustomersScreenProps) {
  const [name, setName] = useState('');
  const [deskId, setDeskId] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const desks = props.desks.filter((d) => d.audience === 'customer');
  return (
    <Card title="Products">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <p className="yx-ops-muted">Customers pick a product when they raise a ticket on your help page.</p>
        {props.products.length === 0 ? (
          <EmptyState compact title="No products yet." />
        ) : (
          <ul className="yx-ops-list" aria-label="Products">
            {props.products.map((p) => (
              <li key={p.id} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span className="yx-ops-list__title">
                    {p.name}
                    {p.active ? '' : ' · off'}
                  </span>
                  <span className="yx-ops-list__sub">{desks.find((d) => d.id === p.deskId)?.name ?? 'Every desk'}</span>
                </span>
                {props.canManage && (
                  <Button size="sm" aria-label={`${p.active ? 'Turn off' : 'Turn on'} ${p.name}`} loading={busy === p.id} onClick={() => void run(p.id, () => props.onSaveProduct(p.id, { name: p.name, deskId: p.deskId, active: !p.active }))}>
                    {p.active ? 'Turn off' : 'Turn on'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {props.canManage && (
          <span className="yx-ops-row">
            <TextField size="sm" aria-label="New product name" placeholder="New product name" value={name} onChange={setName} maxLength={100} />
            <Select size="sm" aria-label="Desk for the product" value={deskId} onChange={setDeskId} clearable options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Every desk" />
            <Button size="sm" disabled={!name.trim()} loading={busy === 'add'} onClick={() => void run('add', async () => { await props.onSaveProduct(null, { name: name.trim(), deskId, active: true }); setName(''); })}>
              Add product
            </Button>
          </span>
        )}
      </div>
    </Card>
  );
}

function AgentLimitsCard(props: CustomersScreenProps) {
  const [find, setFind] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [ids, setIds] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRun();
  useEffect(() => {
    const h = setTimeout(() => void props.onSearchUsers(find.trim()).then(setUsers).catch(() => setUsers([])), 250);
    return () => clearTimeout(h);
  }, [find]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setIds(null);
    setSaved(false);
    if (userId) void run('load', async () => setIds(await props.onLoadAgentAccounts(userId)));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Agent limits">
      <div className="yx-ops-stack">
        <p className="yx-ops-muted">Limit an agent to some companies. With none chosen, the agent works on every company.</p>
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <FormField label="Find an agent" helper="Name or email">
          <TextField value={find} onChange={setFind} />
        </FormField>
        <FormField label="Agent">
          <Select value={userId} onChange={setUserId} options={users.map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email }))} placeholder="Choose an agent" emptyText="Nobody matches" />
        </FormField>
        {userId && ids && (
          <>
            <FormField label="Companies this agent works on" helper="Empty: every company.">
              <MultiSelect value={ids} onChange={setIds} options={props.accounts.map((x) => ({ value: x.id, label: x.name }))} placeholder="Every company" />
            </FormField>
            {saved && <p className="yx-ops-muted">Saved.</p>}
            <div className="yx-ops-row">
              <Button loading={busy === 'save'} onClick={() => void run('save', async () => { await props.onSetAgentAccounts(userId, ids); setSaved(true); })}>
                Save limits
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
