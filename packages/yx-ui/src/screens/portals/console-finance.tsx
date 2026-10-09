// YukthiX console: partner verification (YX-06), partner commissions and invoices (YX-07), partner directory moderation (YX-08),
// export invoices / LUT / FIRC reconciliation (YX-14), region catalogue (YX-15) and e-invoice log (YX-16).
import { useState } from 'react';
import { Check, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { MenuItem } from '../../components/menu';
import { formatDate, formatINR, formatMoney } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { commissionTotals, daysUntil, matchReceipt } from './portals-logic';
import { BlockNote, Fact, FactRow } from './portals-kit';
import { FilteredTable, opts } from './list-kit';
import { Console } from './console-kit';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const CHECK_TONE: Record<string, BadgeTone> = { verified: 'success', pending: 'warning', failed: 'danger', 'n/a': 'neutral' };

/* ================================================================== */
/* YX-06 Partner verification                                          */
/* ================================================================== */

type PartnerApp = { id: string; firm: string; types: string; gstin: string; pan: string; icai: string; agreement: string; identity: string; tax: string; icaiCheck: string; applied: Date };
type PartnerRow = { id: string; firm: string; types: string; parent: string; status: 'verified' | 'pending' | 'suspended'; clients: number; users: number; region: string };

// YX-06
/** Applications (identity, GSTIN / PAN, ICAI, G-34) and partner list (types, hierarchy ≤ 2 levels); suspend cuts all client access at once. */
export function PartnerVerificationScreen({ apps, partners, tab = 'queue', openId, suspendOpen }: { apps: PartnerApp[]; partners: PartnerRow[]; tab?: 'queue' | 'partners'; openId?: string; suspendOpen?: boolean }) {
  const [open, setOpen] = useState(openId ?? null);
  const [suspend, setSuspend] = useState(!!suspendOpen);
  const app = apps.find((a) => a.id === open);
  const allOk = app && [app.identity, app.tax, app.icaiCheck].every((c) => c === 'verified' || c === 'n/a') && app.agreement.startsWith('G-34');
  return (
    <Console page="Partner verification">
      <PageHeader title="Partner verification" description="No client link activates before a partner is verified and has accepted the current G-34 agreement." />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Partners">
          <TabsTrigger value="queue" count={apps.length}>
            Applications
          </TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          {apps.length === 0 ? (
            <EmptyState title="No applications waiting." />
          ) : (
            <Card>
              <ul className="yx-ps-list">
                {apps.map((a) => (
                  <li key={a.id}>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title">{a.firm}</span>
                      <span className="yx-ps-list__meta">
                        {a.types} · applied {formatDate(a.applied)}
                      </span>
                    </div>
                    <Badge tone={CHECK_TONE[a.identity]}>Identity {a.identity}</Badge>
                    <Badge tone={CHECK_TONE[a.tax]}>GSTIN / PAN {a.tax}</Badge>
                    <Badge tone={CHECK_TONE[a.icaiCheck]}>ICAI {a.icaiCheck}</Badge>
                    <Button variant="review" size="sm" onClick={() => setOpen(a.id)}>
                      Review
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="partners">
          <FilteredTable
            label="Partners"
            rows={partners}
            getRowId={(r) => r.id}
            searchText={(r) => r.firm}
            fields={[{ key: 'status', label: 'Status', type: 'multi', options: opts(['verified', 'pending', 'suspended']) }]}
            columns={[
              { key: 'firm', header: 'Firm', value: (r) => r.firm, width: 220 },
              { key: 'types', header: 'Types', value: (r) => r.types, width: 200 },
              { key: 'parent', header: 'Master partner', value: (r) => r.parent, width: 200 },
              { key: 'clients', header: 'Clients', type: 'number', value: (r) => r.clients, width: 90 },
              { key: 'users', header: 'Users', type: 'number', value: (r) => r.users, width: 80 },
              { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => (v === 'Verified' ? 'success' : v === 'Suspended' ? 'danger' : 'warning'), width: 110 },
            ]}
            rowActions={(r) =>
              r.status === 'suspended' ? (
                <MenuItem>Reinstate</MenuItem>
              ) : (
                <MenuItem destructive onSelect={() => setSuspend(true)}>
                  Suspend
                </MenuItem>
              )
            }
          />
        </TabsContent>
      </Tabs>
      {app && (
        <Drawer
          open
          onOpenChange={() => setOpen(null)}
          size="lg"
          title={app.firm}
          subtitle={app.types}
          footer={
            <>
              <Button icon={X}>Reject</Button>
              <Button variant="primary" icon={Check} disabled={!allOk}>
                Verify partner
              </Button>
            </>
          }
        >
          <div className="yx-ps-stack">
            <DescriptionList
              items={[
                { label: 'GSTIN', value: app.gstin, mono: true },
                { label: 'PAN', value: app.pan, mono: true },
                { label: 'ICAI firm registration', value: app.icai },
                { label: 'Agreement', value: app.agreement },
              ]}
            />
            <ul className="yx-ps-list">
              {[
                ['Identity of authorised signatory', app.identity],
                ['GSTIN and PAN match the firm name', app.tax],
                ['ICAI registration (CA firms)', app.icaiCheck],
              ].map(([k, v]) => (
                <li key={k}>
                  <span className="yx-ps-list__main">{k}</span>
                  <Badge tone={CHECK_TONE[v]}>{cap(v)}</Badge>
                </li>
              ))}
            </ul>
            {!allOk && <BlockNote>Every check must pass and G-34 must be accepted before you can verify.</BlockNote>}
          </div>
        </Drawer>
      )}
      <ConfirmDialog open={suspend} onOpenChange={setSuspend} destructive title="Suspend Sridhar & Rao Associates?" consequence="All 14 client links and 11 users lose access immediately, including sub-partner Kaveri Payroll Bureau's clients. Clients are told and can switch to direct billing." confirmLabel="Suspend partner" onConfirm={() => undefined}>
        <FormField label="Reason" required>
          <TextArea rows={2} />
        </FormField>
      </ConfirmDialog>
    </Console>
  );
}

/* ================================================================== */
/* YX-07 Partner commissions & invoices                                */
/* ================================================================== */

type CommissionRow = { id: string; partner: string; client: string; month: string; billed: number; basis: string; ratePct: number; status: 'accrued' | 'approved' | 'paid'; invoice: string; payout: string };

// YX-07
/** Monthly accruals linked to client invoices, approval, payouts, clawbacks; consolidated partner invoices. Rates are placeholders until adopted. */
export function CommissionsScreen({ rows, tab = 'commissions', state = 'ready' }: { rows: CommissionRow[]; tab?: 'commissions' | 'invoices'; state?: 'ready' | 'loading' | 'error' }) {
  const t = commissionTotals(rows);
  return (
    <Console page="Commissions">
      <PageHeader title="Partner commissions and invoices" description="Commission is on subscription only, never on add-ons or taxes. It stops from the month after a link ends." actions={<Button variant="primary">Approve accrued</Button>} />
      <InlineAlert tone="info" title="Rates shown are placeholders">
        Commission and discount rates are not adopted yet (deferred 27 Sep 2026). Every rate must pass the margin guard.
      </InlineAlert>
      <FactRow label="Totals">
        <Fact label="Accrued" value={formatINR(t.accrued)} />
        <Fact label="Approved, to pay" value={formatINR(t.approved)} tone="warning" />
        <Fact label="Paid" value={formatINR(t.paid)} tone="success" />
      </FactRow>
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Commissions">
          <TabsTrigger value="commissions">Commission lines</TabsTrigger>
          <TabsTrigger value="invoices">Consolidated partner invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="commissions">
          <FilteredTable
            label="Commission lines"
            rows={t.lines}
            state={state}
            getRowId={(r) => r.id}
            searchText={(r) => r.partner + r.client}
            fields={[{ key: 'status', label: 'Status', type: 'multi', options: opts(['accrued', 'approved', 'paid']) }]}
            columns={[
              { key: 'partner', header: 'Partner', value: (r) => r.partner, width: 200 },
              { key: 'client', header: 'Client', value: (r) => r.client, width: 180 },
              { key: 'month', header: 'Month', value: (r) => r.month, width: 90 },
              { key: 'invoice', header: 'Source invoice', type: 'id', value: (r) => r.invoice, width: 140 },
              { key: 'billed', header: 'Billed', type: 'money', value: (r) => r.billed, width: 110 },
              { key: 'basis', header: 'Basis', value: (r) => `${r.basis} · ${r.ratePct}%`, width: 230 },
              { key: 'amount', header: 'Commission', type: 'money', value: (r) => r.amount, total: 'sum', width: 120 },
              { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => (v === 'Paid' ? 'success' : v === 'Approved' ? 'info' : 'neutral'), width: 100 },
              { key: 'payout', header: 'Payout ref', type: 'id', value: (r) => r.payout || '—', width: 180 },
            ]}
            bulkActions={() => <Button variant="approve" size="sm">Approve</Button>}
          />
        </TabsContent>
        <TabsContent value="invoices">
          <Card>
            <ul className="yx-ps-list">
              <li>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">YX/PTR/26-27/0031 · Sridhar &amp; Rao Associates · September 2026</span>
                  <span className="yx-ps-list__meta">Partner-billed · 6 clients · {formatINR(1_12_640)} + GST {formatINR(20_275)}</span>
                </div>
                <Badge tone="warning">Due 15 Oct 2026</Badge>
              </li>
              <li>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">YX/PTR/26-27/0024 · Deccan HR Resellers · August 2026</span>
                  <span className="yx-ps-list__meta">Partner-billed · 9 clients · unpaid 34 days; clients offered direct billing</span>
                </div>
                <Badge tone="danger">Overdue</Badge>
              </li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </Console>
  );
}

/* ================================================================== */
/* YX-08 Partner directory moderation                                  */
/* ================================================================== */

type Listing = { id: string; firm: string; services: string; states: string; languages: string; band: string; fee: string; reviews: number; rating: number; status: 'listed' | 'delisted' | 'pending' };
type Review = { id: string; firm: string; reviewer: string; rating: number; text: string; flag: string; status: string };

// YX-08
/** Listings, verified reviews (linked clients only), complaints; delist with appeal. Ordered by fit and reviews only; no paid ranking. */
export function DirectoryModerationScreen({ listings, reviews, tab = 'listings' }: { listings: Listing[]; reviews: Review[]; tab?: 'listings' | 'reviews' }) {
  return (
    <Console page="Partner directory">
      <PageHeader title="Partner directory" description="Only verified, non-suspended partners can list. Ordering is by fit and verified reviews, never by payment." />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Directory">
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="reviews" count={reviews.filter((r) => r.status === 'held').length}>
            Reviews and complaints
          </TabsTrigger>
        </TabsList>
        <TabsContent value="listings">
          <FilteredTable
            label="Listings"
            rows={listings}
            getRowId={(r) => r.id}
            searchText={(r) => r.firm + r.services}
            fields={[{ key: 'status', label: 'Status', type: 'multi', options: opts(['listed', 'delisted', 'pending']) }]}
            columns={[
              { key: 'firm', header: 'Firm', value: (r) => r.firm, width: 200 },
              { key: 'services', header: 'Services', value: (r) => r.services, width: 220 },
              { key: 'states', header: 'States', value: (r) => r.states, width: 170 },
              { key: 'languages', header: 'Languages', value: (r) => r.languages, width: 170 },
              { key: 'band', header: 'Client size', value: (r) => r.band, width: 150 },
              { key: 'fee', header: 'Fee range', value: (r) => r.fee, width: 200 },
              { key: 'rating', header: 'Verified reviews', value: (r) => (r.reviews ? `${r.rating} from ${r.reviews}` : 'None yet'), width: 140 },
              { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => (v === 'Listed' ? 'success' : v === 'Delisted' ? 'danger' : 'warning'), width: 100 },
            ]}
            rowActions={(r) => (r.status === 'delisted' ? <MenuItem>Review appeal</MenuItem> : <MenuItem destructive>Delist</MenuItem>)}
          />
        </TabsContent>
        <TabsContent value="reviews">
          <Card>
            <ul className="yx-ps-list">
              {reviews.map((r) => (
                <li key={r.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">
                      {r.firm} · {r.rating} of 5
                    </span>
                    <span>"{r.text}"</span>
                    <span className="yx-ps-list__meta">
                      {r.reviewer} · flag: {r.flag}
                    </span>
                  </div>
                  <Badge tone={r.status === 'held' ? 'warning' : 'success'}>{cap(r.status)}</Badge>
                  {r.status === 'held' && (
                    <>
                      <Button size="sm">Publish</Button>
                      <Button size="sm">Remove</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </Console>
  );
}

/* ================================================================== */
/* YX-14 Export invoices, LUT and FIRC / e-BRC reconciliation          */
/* ================================================================== */

type Lut = { arn: string; filedOn: Date; from: Date; to: Date; filedBy: string; current: boolean };
type ExportInv = { id: string; customer: string; country: string; currency: string; amount: number; rate: number; inr: number; lut: string };
type Receipt = { id: string; ref: string; currency: string; amount: number; remitter: string; inr: number; firc: string; status: 'matched' | 'awaiting' | 'exception' };

// YX-14
/** LUT register, export invoices (zero-rated under LUT), foreign receipts matching queue; no valid LUT = staff review before issue. */
export function ExportBillingScreen({ luts, invoices, receipts, tab = 'receipts', today, noValidLut }: { luts: Lut[]; invoices: ExportInv[]; receipts: Receipt[]; tab?: 'lut' | 'invoices' | 'receipts'; today: Date; noValidLut?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const r = receipts.find((x) => x.id === open);
  const match = r ? matchReceipt(r, invoices) : null;
  const current = noValidLut ? undefined : luts.find((l) => l.current);
  return (
    <Console page="Export invoices and LUT">
      <PageHeader title="Export invoices, LUT and foreign receipts" actions={<Button variant="primary" icon={Plus}>Add LUT</Button>} />
      {current ? (
        <p className="yx-ps-muted">
          Current LUT {current.arn}, valid to {formatDate(current.to)} ({daysUntil(current.to, today)} days).
        </p>
      ) : (
        <InlineAlert tone="danger" title="No valid LUT">
          Export invoices can't be issued zero-rated. New export invoices go to staff review until a LUT for FY 2026-27 is added.
        </InlineAlert>
      )}
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Export billing">
          <TabsTrigger value="lut">LUT register</TabsTrigger>
          <TabsTrigger value="invoices">Export invoices</TabsTrigger>
          <TabsTrigger value="receipts" count={receipts.filter((x) => x.status !== 'matched').length}>
            Receipts to match
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lut">
          <Card>
            <ul className="yx-ps-list">
              {luts.map((l) => (
                <li key={l.arn}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title yx-ps-mono">{l.arn}</span>
                    <span className="yx-ps-list__meta">
                      Filed {formatDate(l.filedOn)} by {l.filedBy} · valid {formatDate(l.from)} to {formatDate(l.to)}
                    </span>
                  </div>
                  <Badge tone={l.current && !noValidLut ? 'success' : 'neutral'}>{l.current && !noValidLut ? 'Current' : 'Expired'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="invoices">
          <FilteredTable
            label="Export invoices"
            rows={invoices}
            getRowId={(x) => x.id}
            searchText={(x) => x.customer}
            fields={[]}
            columns={[
              { key: 'id', header: 'Invoice', type: 'id', value: (x) => x.id, width: 170 },
              { key: 'customer', header: 'Customer', value: (x) => `${x.customer} · ${x.country}`, width: 240 },
              { key: 'amount', header: 'Amount', value: (x) => formatMoney(x.amount, x.currency), width: 130 },
              { key: 'rate', header: 'Rate', type: 'number', value: (x) => x.rate, width: 80 },
              { key: 'inr', header: 'INR value', type: 'money', value: (x) => x.inr, total: 'sum', width: 130 },
              { key: 'lut', header: 'LUT', type: 'id', value: (x) => (noValidLut ? 'Staff review' : x.lut), width: 170 },
            ]}
          />
        </TabsContent>
        <TabsContent value="receipts">
          <Card>
            <ul className="yx-ps-list">
              {receipts.map((x) => (
                <li key={x.id}>
                  <div className="yx-ps-list__main">
                    <span className="yx-ps-list__title">
                      {x.remitter} · {formatMoney(x.amount, x.currency)}
                    </span>
                    <span className="yx-ps-list__meta">
                      {x.ref} · realised {formatINR(x.inr)} · {x.firc || 'FIRC / e-BRC not received'}
                    </span>
                  </div>
                  <Badge tone={x.status === 'matched' ? 'success' : x.status === 'exception' ? 'danger' : 'warning'}>{cap(x.status)}</Badge>
                  {x.status !== 'matched' && (
                    <Button size="sm" onClick={() => setOpen(x.id)}>
                      Match
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
      {r && match && (
        <Drawer
          open
          onOpenChange={() => setOpen(null)}
          title={`Match ${r.ref}`}
          subtitle={`${r.remitter} · ${formatMoney(r.amount, r.currency)}`}
          footer={
            <>
              <Button onClick={() => setOpen(null)}>Cancel</Button>
              <Button variant="primary" disabled={!match.invoice}>
                Confirm match
              </Button>
            </>
          }
        >
          <div className="yx-ps-stack">
            {match.invoice ? (
              <InlineAlert tone="success" title={`Suggested: ${match.invoice.id}`}>
                {match.reason}. Invoice {formatMoney(match.invoice.amount, match.invoice.currency)}; short by {formatMoney(match.invoice.amount - r.amount, r.currency)}.
              </InlineAlert>
            ) : (
              <InlineAlert tone="danger" title="No invoice matches">
                {match.reason}. Keep it in the queue and ask the customer for remittance details.
              </InlineAlert>
            )}
            <FormField label="FIRC / e-BRC number">
              <TextField />
            </FormField>
          </div>
        </Drawer>
      )}
    </Console>
  );
}

/* ================================================================== */
/* YX-15 Region catalogue                                              */
/* ================================================================== */

type Region = { code: string; hosting: string; countries: string; inCountry: boolean; dr: string; status: 'live' | 'planned'; gates: { item: string; live: Date | null }[] };

// YX-15
/** Regions, hosting, in-country options, gate checklist. A country is offered only when the region and every gate are live; no override. */
export function RegionCatalogueScreen({ regions }: { regions: Region[] }) {
  return (
    <Console page="Regions">
      <PageHeader title="Region catalogue" description="A country is offered only when its region and every gate item are live. There is no staff override." actions={<Button>Export catalogue</Button>} />
      <div className="yx-ps-grid">
        {regions.map((r) => {
          const open = r.gates.filter((g) => !g.live);
          return (
            <Card key={r.code} title={`${r.code} · ${r.hosting}`} actions={<Badge tone={r.status === 'live' && open.length === 0 ? 'success' : 'neutral'}>{r.status === 'live' ? 'Live' : 'Planned'}</Badge>}>
              <div className="yx-ps-stack">
                <DescriptionList
                  items={[
                    { label: 'Countries', value: r.countries },
                    { label: 'In-country hosting', value: r.inCountry ? 'Yes' : 'No' },
                    { label: 'Disaster recovery', value: r.dr },
                  ]}
                />
                <ul className="yx-ps-list">
                  {r.gates.map((g) => (
                    <li key={g.item}>
                      <span className="yx-ps-list__main">{g.item}</span>
                      <Badge tone={g.live ? 'success' : 'warning'}>{g.live ? `Live ${formatDate(g.live)}` : 'Not live'}</Badge>
                    </li>
                  ))}
                </ul>
                {open.length > 0 && <BlockNote>Not offered to customers until {open.map((g) => g.item).join(', ')} {open.length === 1 ? 'is' : 'are'} live.</BlockNote>}
              </div>
            </Card>
          );
        })}
      </div>
    </Console>
  );
}

/* ================================================================== */
/* YX-16 E-invoice log                                                 */
/* ================================================================== */

type EInv = { invoice: string; scheme: string; tenant: string; hash: string; clearance: string; status: 'accepted' | 'rejected' | 'pending'; errors: string; retries: number; at: Date };

// YX-16
/** Per-country e-invoice submissions (ZATCA, UAE, Peppol, India IRN): status, errors, retries. Final only after the scheme accepts. */
export function EInvoiceLogScreen({ rows, state = 'ready' }: { rows: EInv[]; state?: 'ready' | 'loading' | 'error' }) {
  return (
    <Console page="E-invoice log">
      <PageHeader title="E-invoice log" description="An invoice is final only after the scheme accepts it. India: finance is alerted from day 20; no final invoice after day 25 without an IRN; IRN within 30 days." />
      <FilteredTable
        label="E-invoice submissions"
        rows={rows}
        state={state}
        getRowId={(r) => r.invoice}
        searchText={(r) => r.invoice + r.tenant}
        fields={[
          { key: 'scheme', label: 'Scheme', type: 'multi', options: opts(['ZATCA', 'UAE', 'Peppol', 'IN GST (IRN)']) },
          { key: 'status', label: 'Status', type: 'multi', options: opts(['accepted', 'rejected', 'pending']) },
        ]}
        views={[{ id: 'all', name: 'All submissions' }, { id: 'problems', name: 'Rejected or pending', shared: true }]}
        viewFilters={{ problems: [{ key: 'status', type: 'multi', values: ['rejected', 'pending'] }] }}
        columns={[
          { key: 'invoice', header: 'Invoice', type: 'id', value: (r) => r.invoice, width: 170 },
          { key: 'scheme', header: 'Scheme', value: (r) => r.scheme, width: 120 },
          { key: 'tenant', header: 'Tenant', value: (r) => r.tenant, width: 190 },
          { key: 'hash', header: 'Payload hash', type: 'id', value: (r) => r.hash, width: 120 },
          { key: 'clearance', header: 'Clearance ID', type: 'id', value: (r) => r.clearance || '—', width: 150 },
          { key: 'status', header: 'Status', type: 'status', value: (r) => cap(r.status), statusTone: (v) => (v === 'Accepted' ? 'success' : v === 'Rejected' ? 'danger' : 'warning'), width: 100 },
          { key: 'errors', header: 'Errors', value: (r) => r.errors || '—', width: 280 },
          { key: 'retries', header: 'Retries', type: 'number', value: (r) => r.retries, width: 80 },
          { key: 'at', header: 'Last try', value: (r) => `${formatDate(r.at)}, ${timeOf(r.at)}`, width: 170 },
        ]}
        rowButtons={(r) => (r.status !== 'accepted' ? <Button size="sm" icon={RotateCcw}>Retry</Button> : null)}
        empty={<EmptyState title="No e-invoices submitted yet." />}
      />
    </Console>
  );
}
