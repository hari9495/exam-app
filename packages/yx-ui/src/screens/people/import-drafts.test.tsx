import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LiveEmployeeImport, type ImportDraftState, type LiveImport } from './import';

// PPL-07 "Save and exit": a saved import is offered on the upload step, resumed where it was left, and discarded
// only after a confirmation.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'pan', label: 'PAN', required: false },
];
const saved: ImportDraftState = {
  legalEntityId: 'le1',
  step: 'map',
  file: { name: 'joiners.csv', columns: [{ column: 'Full name', sample: 'Kavya', field: 'name' }, { column: 'Tax id', sample: '', field: null }], rows: [{ row: 2, cells: ['Kavya Rao', 'ABCPK1234Q'] }], fields },
  mapping: { 'Full name': 'name', 'Tax id': 'pan' },
  edits: { 2: { pan: 'ABCPK1234Q' } },
};
const make = (o: Partial<LiveImport> = {}): LiveImport => ({
  entities: [{ value: 'le1', label: 'Kaveri Foods Pvt Ltd' }],
  onRead: vi.fn(),
  onCheck: vi.fn(async () => ({ rows: [], ready: 0 })),
  onImport: vi.fn(),
  onSaveFile: vi.fn(),
  draft: { fileName: 'joiners.csv', rows: 1, entity: 'Kaveri Foods Pvt Ltd', step: 'map', savedAt: '2026-10-21T09:40:00Z', keptUntil: '2026-11-20T09:40:00Z' },
  onSaveDraft: vi.fn(async () => undefined),
  onResume: vi.fn(async () => saved),
  onDiscard: vi.fn(async () => undefined),
  ...o,
});

describe('Employee import: save and exit (PPL-07)', () => {
  it('offers the saved import, resumes it on its step with the matching, and saves it again whole', async () => {
    const live = make();
    render(<ToastProvider><LiveEmployeeImport live={live} /></ToastProvider>);
    expect(screen.getByText('Saved import: joiners.csv')).toBeInTheDocument();
    expect(screen.getByText(/1 row for Kaveri Foods Pvt Ltd, saved on 21 Oct 2026 at Match columns\. Only you can see it\. It is kept until 20 Nov 2026/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Resume' }));
    expect(live.onResume).toHaveBeenCalled();
    expect(await screen.findByRole('combobox', { name: 'Field for Tax id' })).toBeInTheDocument();
    expect(screen.queryByText('Saved import: joiners.csv')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save and exit' }));
    await waitFor(() => expect(live.onSaveDraft).toHaveBeenCalledWith({ legalEntityId: 'le1', step: 'map', file: { name: 'joiners.csv', columns: saved.file.columns, rows: saved.file.rows }, mapping: saved.mapping, edits: saved.edits }));
  });

  it('discards only after a confirmation', async () => {
    const live = make();
    render(<ToastProvider><LiveEmployeeImport live={live} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Discard' }));
    expect(live.onDiscard).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Discard the saved import of joiners.csv?' });
    await ue.click(within(dialog).getByRole('button', { name: 'Discard import' }));
    await waitFor(() => expect(live.onDiscard).toHaveBeenCalled());
  });

  it('no saved import, no file: no notice and no Save and exit', () => {
    render(<ToastProvider><LiveEmployeeImport live={make({ draft: null })} /></ToastProvider>);
    expect(screen.queryByText(/Saved import/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save and exit' })).toBeNull();
  });
});
