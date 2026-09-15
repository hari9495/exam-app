'use client';

// v2 Billing (org-admin). A plan hero + labelled usage meters (value + %, threshold-coloured track),
// plus self-serve Stripe checkout: a purchasable-plan picker, a "Manage subscription" button
// (Stripe Billing Portal), and the invoice history. The picker + manage controls only appear when
// Stripe is configured (the plans endpoint returns purchasable plans) — otherwise it falls back to
// the old "Contact us" note.
import { useEffect, useState } from 'react';
import { useOrgUsage, usePurchasablePlans, useBillingInvoices, useStartCheckout, useOpenBillingPortal } from '../../../../../lib/hooks/useBilling';
import { STATUS } from '../../../../../components/ui-v2/viz';
import type { DimensionUsage, PurchasablePlan, BillingInvoice } from '../../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };

// Same thresholds as before: at/over limit = danger, >=80% = warn, else ok.
function meterColor(pct: number): string {
  if (pct >= 100) return STATUS.bad;
  if (pct >= 80) return STATUS.warn;
  return STATUS.ok;
}

function Meter({ label, used, limit }: { label: string } & DimensionUsage) {
  const pct = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  const width = Math.min(100, pct);
  const over = used >= limit;
  const color = meterColor(pct);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>{label}</span>
        <span style={{ fontSize: 12.5, color: muted, fontFamily: 'var(--font-mono)' }}>
          {used.toLocaleString()} / {limit.toLocaleString()}
          {over && <span aria-label="over limit" style={{ marginLeft: 5, color: STATUS.bad }}>⚠</span>}
        </span>
      </div>
      <div style={{ marginTop: 7, position: 'relative', height: 8, width: '100%', overflow: 'hidden', borderRadius: 99, background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
        {/* Fill via transform:scaleX (not width) so the bar animates on the GPU without layout
            thrash; the track's overflow:hidden + radius round the ends. */}
        <div style={{ height: '100%', width: '100%', background: color, transformOrigin: 'left', transform: `scaleX(${width / 100})`, transition: 'transform .3s ease' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: muted }}>{Math.round(pct)}% used</div>
    </div>
  );
}

// Usage resets on a calendar-month cycle: the first of the month after periodStart.
function nextResetDate(periodStart: string): Date {
  const start = new Date(periodStart);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '8px 15px',
  borderRadius: 9, border: 'none', background: 'var(--org-primary)', color: 'var(--org-on-primary)', cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '8px 15px',
  borderRadius: 9, border: '1px solid color-mix(in srgb, var(--ink) 16%, var(--hair))', background: 'var(--paper)', color: ink, cursor: 'pointer',
};

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function PlanCard({ plan, busy, onSubscribe }: { plan: PurchasablePlan; busy: boolean; onSubscribe: () => void }) {
  return (
    <div style={{ border: `1px solid ${plan.current ? 'color-mix(in srgb, var(--org-primary) 35%, var(--hair))' : 'var(--hair)'}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: plan.current ? 'color-mix(in srgb, var(--org-primary) 5%, var(--paper))' : 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: ink, textTransform: 'capitalize' }}>{plan.name}</span>
        <span style={{ fontSize: 13, color: muted, fontFamily: 'var(--font-mono)' }}>{plan.priceLabel ?? '—'}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: muted }}>
        <li>{plan.seatLimit.toLocaleString()} seats</li>
        <li>{plan.candidateLimit.toLocaleString()} candidates</li>
        <li>{plan.aiCreditLimit.toLocaleString()} AI credits / cycle</li>
        <li>{plan.proctoringMinutesLimit.toLocaleString()} proctoring minutes / cycle</li>
      </ul>
      {plan.current ? (
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--org-primary)', alignSelf: 'flex-start' }}>Current plan</span>
      ) : (
        <button type="button" style={{ ...primaryBtn, alignSelf: 'flex-start', opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={onSubscribe}>
          {busy ? 'Redirecting…' : 'Choose plan'}
        </button>
      )}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: BillingInvoice }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid var(--hair)', fontSize: 13 }}>
      <span style={{ color: muted, fontFamily: 'var(--font-mono)' }}>{new Date(invoice.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      <span style={{ color: ink }}>{invoice.number ?? invoice.id}</span>
      <span style={{ color: ink, fontFamily: 'var(--font-mono)' }}>{formatAmount(invoice.amountPaid, invoice.currency)}</span>
      <span style={{ color: muted, textTransform: 'capitalize' }}>{invoice.status ?? ''}</span>
      {invoice.hostedInvoiceUrl ? (
        <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--org-primary)', textDecoration: 'none', fontWeight: 500 }}>View</a>
      ) : <span />}
    </div>
  );
}

export default function V2BillingPage() {
  const { data: usage } = useOrgUsage();
  const { data: plans } = usePurchasablePlans();
  const { data: invoices } = useBillingInvoices();
  const startCheckout = useStartCheckout();
  const openPortal = useOpenBillingPortal();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  // Read the post-redirect result client-side (avoids useSearchParams' prerender Suspense rule).
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('checkout');
    if (outcome === 'success') setNotice('Subscription updated — thank you. It can take a moment to appear below.');
    else if (outcome === 'cancelled') setNotice('Checkout cancelled — no changes were made.');
  }, []);

  const hasPlans = (plans?.length ?? 0) > 0;

  async function redirectTo(run: () => Promise<{ url: string }>) {
    setError(null);
    try {
      const { url } = await run();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again.');
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Billing</h1>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Your current plan, this cycle&apos;s usage, and your subscription.</p>
      </div>

      {notice && (
        <div role="status" style={{ ...card, padding: '12px 16px', marginBottom: 14, background: 'color-mix(in srgb, var(--org-primary) 6%, var(--paper))', fontSize: 13, color: ink }}>{notice}</div>
      )}
      {error && (
        <div role="alert" style={{ ...card, padding: '12px 16px', marginBottom: 14, background: `color-mix(in srgb, ${STATUS.bad} 8%, var(--paper))`, borderColor: `color-mix(in srgb, ${STATUS.bad} 30%, var(--hair))`, fontSize: 13, color: ink }}>{error}</div>
      )}

      {!usage ? (
        <div style={card} aria-busy="true"><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Plan hero */}
          <div style={{ ...card, background: 'color-mix(in srgb, var(--org-primary) 6%, var(--paper))', borderColor: 'color-mix(in srgb, var(--org-primary) 22%, var(--hair))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, margin: 0 }}>Current plan</p>
              <p style={{ fontFamily: 'var(--font-disp)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', color: ink, margin: '4px 0 0', textTransform: 'capitalize' }}>{usage.planName}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--org-primary)', background: 'color-mix(in srgb, var(--org-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--org-primary) 25%, transparent)', borderRadius: 99, padding: '5px 12px' }}>
                Resets {nextResetDate(usage.periodStart).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {hasPlans && (
                <button type="button" style={{ ...ghostBtn, opacity: openPortal.isPending ? 0.6 : 1 }} disabled={openPortal.isPending} onClick={() => redirectTo(() => openPortal.mutateAsync())}>
                  {openPortal.isPending ? 'Opening…' : 'Manage subscription'}
                </button>
              )}
            </div>
          </div>

          {/* Usage meters */}
          <div style={card}>
            <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: '0 0 16px' }}>This cycle&apos;s usage</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px 28px' }}>
              <Meter label="Seats" used={usage.seats.used} limit={usage.seats.limit} />
              <Meter label="Candidates" used={usage.candidates.used} limit={usage.candidates.limit} />
              <Meter label="AI credits" used={usage.aiCredits.used} limit={usage.aiCredits.limit} />
              <Meter label="Proctoring minutes" used={usage.proctoringMinutes.used} limit={usage.proctoringMinutes.limit} />
            </div>
            {!hasPlans && (
              <p style={{ fontSize: 12.5, color: muted, margin: '18px 0 0', borderTop: '1px solid var(--hair)', paddingTop: 14 }}>Need a different plan? Contact us.</p>
            )}
          </div>

          {/* Self-serve plan picker (only when Stripe is configured with purchasable plans) */}
          {hasPlans && (
            <div style={card}>
              <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: '0 0 4px' }}>Plans</h2>
              <p style={{ fontSize: 12.5, color: muted, margin: '0 0 16px' }}>Choose a plan to subscribe or change. You&apos;ll be taken to our secure payment page.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {plans!.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    busy={startCheckout.isPending && pendingPlanId === plan.id}
                    onSubscribe={() => {
                      setPendingPlanId(plan.id);
                      void redirectTo(() => startCheckout.mutateAsync({ planId: plan.id }));
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Invoice history (only once there are invoices) */}
          {(invoices?.length ?? 0) > 0 && (
            <div style={card}>
              <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: '0 0 12px' }}>Invoices</h2>
              <div>
                {invoices!.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
