// PAY-37 wage-settlement arrears, live: the designed SettlementArrearsScreen (offcycle.tsx) with a settlement from the
// API, inside the special pay page (special-pay-live.tsx). A leaf module, so offcycle.tsx can import it without an
// import cycle back through the Pay designs.
import { useState, type ReactNode } from 'react';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { Select } from '../../components/select';
import { DescriptionList } from '../../components/shell';
import { Stepper } from '../../components/stepper';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { dateText } from '../time/live/kit';
import { SectionTitle } from './pay-kit';
import type { LiveSpecialPay } from './special-pay-live';

/** "2026-09" → "September 2026". */
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A tab's head: the design's page title and actions, as a section inside the special pay page. */
export function Head({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <SectionTitle actions={actions}>{title}</SectionTitle>
      {description && <p className="yx-pay-muted">{description}</p>}
    </>
  );
}

/* ================================================================== PAY-37 Wage-settlement arrears */

export function LiveSettlementArrears({ live }: { live: LiveSpecialPay }) {
  const { toast } = useToast();
  const settlements = live.unions?.settlements ?? null;
  const [id, setId] = useState<string | null>(null);
  const s = settlements?.find((x) => x.id === id) ?? settlements?.[0] ?? null;
  const { busy, error, run } = useRun();
  const month = monthName(live.month);
  const unionName = (uid: string | null) => (uid ? live.unions?.unions.find((x) => x.id === uid)?.name ?? 'Union' : 'No union (company settlement)');
  if (!settlements)
    return (
      <div role="status" aria-busy="true" aria-label="Loading wage settlements">
        <Skeleton height={240} />
      </div>
    );
  if (!s) return <EmptyState title="No wage settlements yet" description="A long-term settlement with a union sets a monthly increase per worker category from an effective date; its arrears are worked out here." />;
  return (
    <div className="yx-pay-stack">
      <Head
        title={s.title}
        description={`${unionName(s.unionId)} · settlement signed ${dateText(s.signedOn)} · effective ${dateText(s.effectiveFrom)}`}
        actions={settlements.length > 1 && <Select aria-label="Settlement" value={s.id} onChange={(v) => v && setId(v)} options={settlements.map((x) => ({ value: x.id, label: x.title }))} />}
      />
      {error && (
        <InlineAlert tone="danger" title="The arrears were not sent">
          {error}
        </InlineAlert>
      )}
      <Stepper
        key={s.id}
        title="Settlement arrears"
        defaultCurrent="categories"
        anyOrder
        finishLabel={`Send arrears to ${month}`}
        finishing={busy === 'send'}
        onFinish={() =>
          void run('send', async () => {
            await live.onPost({ kind: 'settlement', id: s.id });
            toast({ tone: 'success', title: `${s.title} arrears sent to payroll for ${month}, for approval.` });
          })
        }
        steps={[
          { id: 'settlement', title: 'Settlement', description: 'Terms and effective date', content: <DescriptionList columns={2} items={[{ label: 'Union', value: unionName(s.unionId) }, { label: 'Signed', value: dateText(s.signedOn) }, { label: 'Effective from', value: dateText(s.effectiveFrom) }]} /> },
          {
            id: 'categories',
            title: 'Categories',
            description: 'Increase per worker category',
            content: (
              <table className="yx-pay-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" data-num>
                      Increase a month
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.rates.map((r) => (
                    <tr key={r.category}>
                      <th scope="row">{r.category.replace(/_/g, ' ')}</th>
                      <td data-num>{formatINR(Number(r.monthlyIncrease))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
          },
          { id: 'worksheet', title: 'Arrears', description: `Paid in ${month}`, content: <p className="yx-pay-muted">Arrears from {dateText(s.effectiveFrom)} are worked out for each worker in a category on the as-paid pay of every month, and go to payroll as one sheet for a payroll approver to approve.</p> },
        ]}
      />
    </div>
  );
}
