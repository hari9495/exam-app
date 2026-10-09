// Console shell for YX-* screens: ConsoleFrame with the console panel links, current page active.
import type { ReactNode } from 'react';
import { ConsoleFrame, type PanelSection } from '../_kit/frames';

export type ConsolePage =
  | 'Tenants'
  | 'Customer success'
  | 'Sales assist'
  | 'Cost per tenant'
  | 'Incidents and status'
  | 'Probes'
  | 'Feature flags'
  | 'Contain tenant'
  | 'Regions'
  | 'Rule sets'
  | 'Golden cases'
  | 'Publish scheduler'
  | 'AI governance'
  | 'Product analytics'
  | 'Help centre'
  | 'Nudges and copy'
  | 'Partner verification'
  | 'Commissions'
  | 'Partner directory'
  | 'Export invoices and LUT'
  | 'E-invoice log';

const GROUPS: { label: string; items: ConsolePage[] }[] = [
  { label: 'Customers', items: ['Tenants', 'Customer success', 'Sales assist', 'Cost per tenant'] },
  { label: 'Operations', items: ['Incidents and status', 'Probes', 'Feature flags', 'Contain tenant', 'Regions'] },
  { label: 'Statutory rules', items: ['Rule sets', 'Golden cases', 'Publish scheduler'] },
  { label: 'Product', items: ['AI governance', 'Product analytics', 'Help centre', 'Nudges and copy'] },
  { label: 'Partners', items: ['Partner verification', 'Commissions', 'Partner directory'] },
  { label: 'Billing', items: ['Export invoices and LUT', 'E-invoice log'] },
];

const COUNTS: Partial<Record<ConsolePage, number>> = { 'Customer success': 4, 'Golden cases': 3, 'Partner verification': 3, 'Sales assist': 2 };

export function Console({ page, children }: { page: ConsolePage; children: ReactNode }) {
  const panel: PanelSection[] = GROUPS.map((g) => ({ label: g.label, items: g.items.map((i) => ({ label: i, active: i === page, count: COUNTS[i] })) }));
  return <ConsoleFrame panel={panel}>{children}</ConsoleFrame>;
}
