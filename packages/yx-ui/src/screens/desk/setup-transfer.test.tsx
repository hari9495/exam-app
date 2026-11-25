import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { DeskSetupTransfer, type DeskImportItem } from './setup-transfer';

// Batch F GLPI 10 (answer 2574): copy a desk's set-up as a file; a dry run, then the import.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ITEMS: DeskImportItem[] = [
  { kind: 'category', name: 'Laptop policy', outcome: 'add', note: null },
  { kind: 'template', name: 'Joiner', outcome: 'failed', note: 'No ticket type named "Joiner" on this desk.' },
];
const fileOf = (text: string) => new File([text], 'desk.json', { type: 'application/json' });
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('DeskSetupTransfer', () => {
  it('a checked file shows what will be added and why not; Import asks first, then imports with a toast', async () => {
    const onImport = vi.fn(async (_f: unknown, dryRun: boolean) => ({ dryRun, items: dryRun ? ITEMS : [{ ...ITEMS[0]!, outcome: 'added' as const }, ITEMS[1]!] }));
    render(<ToastProvider><DeskSetupTransfer live={{ onExport: vi.fn(async () => undefined), onImport }} /></ToastProvider>);
    await ue.upload(input(), fileOf(JSON.stringify({ format: 'yukthix-desk-setup', version: 1 })));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ format: 'yukthix-desk-setup', version: 1 }, true));
    const table = await screen.findByRole('table', { name: 'Set-up file items' });
    expect(within(table).getByText('Will be added')).toBeInTheDocument();
    expect(within(table).getByText(/No ticket type named "Joiner"/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Import 1' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import 1' }));
    await waitFor(() => expect(onImport).toHaveBeenLastCalledWith({ format: 'yukthix-desk-setup', version: 1 }, false));
    expect((await screen.findAllByText(/Imported 1; 1 not added/)).length).toBeGreaterThan(0);
  });

  it('negative: a file that is not JSON is refused before anything is sent; Download calls the export', async () => {
    const onImport = vi.fn();
    const onExport = vi.fn(async () => undefined);
    render(<ToastProvider><DeskSetupTransfer live={{ onExport, onImport }} /></ToastProvider>);
    await ue.upload(input(), fileOf('not json'));
    expect(await screen.findByText(/This is not a set-up file/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Download set-up file' }));
    expect(onExport).toHaveBeenCalled();
  });
});
