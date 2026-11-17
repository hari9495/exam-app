import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveAuditLogScreen, type LiveAuditEntry, type LiveAuditLog } from './audit-log-live';

const ENTRIES: LiveAuditEntry[] = [
  { id: 'a', at: '2026-11-13T05:20:00Z', action: 'org.setting.changed', sentence: 'Company setting changed by Lakshmi Venkatesan.', entityType: 'setting', entityId: 's1', actor: 'Lakshmi Venkatesan', actorRole: 'org_admin', details: { key: 'grace', from: '15', to: '10' } },
  { id: 'b', at: '2026-11-12T05:20:00Z', action: 'legacy.thing.done', entityType: 'thing', entityId: null, actor: 'Suresh Pillai', actorRole: null, details: null },
];
const live = (over: Partial<LiveAuditLog> = {}): LiveAuditLog => ({ state: 'ready', onRetry: () => {}, entries: ENTRIES, areas: [], filters: {}, onFilters: () => {}, ...over });

describe('Activity log in plain sentences (admin B1)', () => {
  it('shows each entry as a sentence, falling back to the event code when the API sent none', () => {
    render(<LiveAuditLogScreen live={live()} />);
    const table = screen.getByRole('table', { name: 'Audit entries' });
    expect(within(table).getByRole('columnheader', { name: /What happened/ })).toBeInTheDocument();
    expect(within(table).getByText('Company setting changed by Lakshmi Venkatesan.')).toBeInTheDocument();
    expect(within(table).getByText('legacy.thing.done')).toBeInTheDocument();
  });

  it('opens an entry with the sentence as the title and the event code beside it', async () => {
    const u = userEvent.setup();
    render(<LiveAuditLogScreen live={live()} />);
    await u.click(screen.getByText('Company setting changed by Lakshmi Venkatesan.'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Company setting changed by Lakshmi Venkatesan.')).toBeInTheDocument();
    expect(within(drawer).getByText('org.setting.changed')).toBeInTheDocument();
  });
});
