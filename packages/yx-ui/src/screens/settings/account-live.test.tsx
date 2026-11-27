import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SETTINGS_GROUPS } from './settings-groups';
import { allSettings } from './settings-logic';
import { ClosureRequestDrawer, StorageDrawer, dataPage, invoicesPage, planPage, usagePage, type AccountBilling, type AccountData, type ScheduledExport } from './account-live';

// Settings S-9 (answers 1328, 1332): group 8 live.
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const B: AccountBilling = {
  plan: { name: 'Growth', priceLabel: '₹99 a person a month', billingInterval: 'month' },
  lifecycle: 'trial',
  trialEndsAt: '2026-12-01',
  products: [{ code: 'hrms', name: 'YukthiX HR', since: '2026-04-01' }],
  usage: { seats: { used: 412, limit: 500 }, candidates: { used: 3, limit: null }, aiCredits: { used: 0, limit: 100 }, proctoringMinutes: { used: 0, limit: 60 }, periodStart: '2026-11-01' },
  invoices: [{ number: 'YX-1', status: 'paid', amountPaid: 409900, currency: 'inr', createdAt: '2026-11-01T00:00:00Z', invoicePdf: null }],
};
const D: AccountData = { companyName: 'Kaveri Foods', linkHours: 24, keepDays: 30, exports: [], closure: null };
const field = (page: ReturnType<typeof planPage>, key: string) => allSettings(page).find((d) => d.key === key);

describe('group 8 live (S-9)', () => {
  it('8.1 to 8.3 show the plan, products, usage and invoices, read only, with no drawn sample values', () => {
    const p = planPage(pageOf('8.1'), B);
    expect(field(p, 'plan.current')!.value).toBe('Growth · ₹99 a person a month · billed monthly');
    expect(field(p, 'plan.trial')!.value).toBe('Until 1 Dec 2026');
    expect(field(p, 'plan.products')).toMatchObject({ readOnlyList: true, rows: [['YukthiX HR', '1 Apr 2026']] });
    expect(field(p, 'plan.addons')).toBeUndefined();
    expect(field(usagePage(pageOf('8.2'), B), 'usage.meters')!.rows).toEqual([['People who can sign in', '412', '500'], ['Candidates', '3', 'No limit'], ['AI credits', '0', '100'], ['Proctoring', '0 min', '60 min']]);
    expect(field(invoicesPage(pageOf('8.3'), B), 'invoice.list')!.rows).toEqual([['YX-1', '1 Nov 2026', '₹4,099.00', 'Paid']]);
  });

  it('negative: invoices that could not be read say so; no export yet offers no download', () => {
    expect(field(invoicesPage(pageOf('8.3'), { ...B, invoices: null }), 'invoice.list')).toMatchObject({ rows: [], helper: expect.stringMatching(/could not be read/) });
    const p = dataPage(pageOf('8.5'), D, true);
    expect(field(p, 'export.download')).toBeUndefined();
    expect(field(p, 'closure.start')!.helper).toMatch(/kept for 30 days/);
  });

  it('8.5: an open link offers Download; an expired one says so; a request can be withdrawn; a viewer gets no actions', () => {
    const e = { id: 'x', by: 'Arjun', at: '2026-11-13T09:00:00Z', expiresAt: '2026-11-14T09:00:00Z', open: true, sizeBytes: 2_097_152, tables: 3, rows: 10, downloads: 0 };
    expect(field(dataPage(pageOf('8.5'), { ...D, exports: [e] }, true), 'export.download')).toMatchObject({ linkLabel: 'Download' });
    const gone = dataPage(pageOf('8.5'), { ...D, exports: [{ ...e, open: false }] }, true);
    expect(field(gone, 'export.download')).toBeUndefined();
    expect(field(gone, 'export.last')!.locked).toMatch(/expired/);
    const asked = { ...D, closure: { id: 'c', status: 'requested' as const, by: 'Arjun', at: '2026-11-13T10:00:00Z', reason: 'Moving', keepUntil: null } };
    expect(field(dataPage(pageOf('8.5'), asked, true), 'closure.withdraw')).toBeDefined();
    expect(field(dataPage(pageOf('8.5'), asked, false), 'closure.withdraw')).toBeUndefined();
    expect(field(dataPage(pageOf('8.5'), { ...asked, closure: { ...asked.closure, status: 'closed', keepUntil: '2026-12-13' } }, true), 'closure.state')!.value).toMatch(/kept until 13 Dec 2026/);
  });

  it('the closure drawer asks for the company name and why before sending', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ToastProvider><ClosureRequestDrawer companyName="Kaveri Foods" keepDays={30} onClose={() => {}} onSend={onSend} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Ask to close' }));
    expect(screen.getAllByText('Type Kaveri Foods to confirm.').length).toBeGreaterThan(0);
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox', { name: /Company name/ }), 'kaveri foods');
    await userEvent.type(screen.getByRole('textbox', { name: /Why/ }), 'Moving to another tool');
    await userEvent.click(screen.getByRole('button', { name: 'Ask to close' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ companyName: 'kaveri foods', reason: 'Moving to another tool' }));
  });

  // T2-G 45 (answer 2744): the scheduled export to the company's storage. Fake values only.
  const SCHED: ScheduledExport = { frequency: 'weekly', destination: { kind: 's3', where: 's3://kaveri-backups/yukthix', by: 'Arjun', at: '2026-11-20T10:00:00Z', lastAttemptAt: '2026-11-22T20:30:00Z', lastSuccessAt: null, lastError: 'Amazon S3 did not take the file: Access Denied' } };
  it('8.5 scheduled export: where it goes, how often and a failed run; actions only for the System Admin', () => {
    const p = dataPage(pageOf('8.5'), D, true, SCHED);
    expect(field(p, 'export.schedule.where')!.value).toBe('Amazon S3 · s3://kaveri-backups/yukthix');
    expect(field(p, 'export.schedule.frequency')!.value).toBe('Weekly');
    expect(field(p, 'export.schedule.last')).toMatchObject({ status: { tone: 'warning', text: 'Not sent' }, locked: 'Amazon S3 did not take the file: Access Denied' });
    expect(field(p, 'export.schedule.send')).toMatchObject({ linkLabel: 'Send now' });
    const viewer = dataPage(pageOf('8.5'), D, false, SCHED);
    expect(field(viewer, 'export.schedule.connect')).toBeUndefined();
    expect(field(viewer, 'export.schedule.send')).toBeUndefined();
    const none = dataPage(pageOf('8.5'), D, true, { frequency: 'weekly', destination: null });
    expect(field(none, 'export.schedule.where')!.value).toBe('Not connected');
    expect(field(none, 'export.schedule.connect')).toMatchObject({ linkLabel: 'Connect storage' });
    expect(field(none, 'export.schedule.send')).toBeUndefined();
  });

  it('the storage drawer needs every field and a 12-character password typed twice; then sends kind, fields and how often', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ToastProvider><StorageDrawer current={{ frequency: 'weekly', destination: null }} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    await userEvent.click(screen.getByRole('radio', { name: 'Azure Blob' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter the storage account.')).toBeTruthy();
    expect(screen.getByText('Use at least 12 characters.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox', { name: /Storage account/ }), 'kaverifoods');
    await userEvent.type(screen.getByRole('textbox', { name: /^Container/ }), 'exports');
    await userEvent.type(screen.getByLabelText(/Account key/), 'ZmFrZWtleQ==');
    await userEvent.type(screen.getByLabelText(/^Zip password(?! again)/), 'a-long-zip-password');
    await userEvent.type(screen.getByLabelText(/Zip password again/), 'a-long-zip-passwore');
    await userEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('The two passwords are not the same.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Zip password again/), '{Backspace}d');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ kind: 'azure_blob', accountName: 'kaverifoods', container: 'exports', prefix: '', accountKey: 'ZmFrZWtleQ==', zipPassword: 'a-long-zip-password' }, 'monthly'));
  });
});
