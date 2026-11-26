import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CompanyDocumentsScreen, SAMPLE_DOCS, type LiveCompanyDocs } from './company-docs';
import { ReportLibraryScreen } from '../proctoring/analytics';

// G4: company documents and the report library with real records. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ok = () => Promise.resolve();
const live = (over: Partial<LiveCompanyDocs> = {}): LiveCompanyDocs => ({ state: 'ready', data: SAMPLE_DOCS, onFolder: vi.fn(), onAddFolder: ok, onRemoveFolder: ok, onUpload: ok, onRemove: ok, onDownload: ok, ...over });

describe('PPL-51 company documents (live)', () => {
  it('shows folders with counts and the expiry status in words; a folder opens', async () => {
    const onFolder = vi.fn();
    show(<CompanyDocumentsScreen live={live({ onFolder })} />);
    expect(screen.getByText('Expiring soon')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Handbooks and forms (5)' }));
    expect(onFolder).toHaveBeenCalledWith('f2');
  });

  it('upload checks title, folder and file first; an employee gets no upload or new folder', async () => {
    const onUpload = vi.fn().mockResolvedValue({ id: 'x' });
    const { unmount } = show(<CompanyDocumentsScreen live={live({ onUpload, data: { ...SAMPLE_DOCS, folderId: null } })} />);
    await ue.click(screen.getByRole('button', { name: 'Upload document' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Upload' }));
    expect(await within(d).findByText('Give the document a title.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the folder.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the file.')).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
    unmount();
    show(<CompanyDocumentsScreen live={live({ data: { ...SAMPLE_DOCS, canManage: false } })} />);
    expect(screen.queryByRole('button', { name: 'Upload document' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New folder' })).toBeNull();
  });

  it('a new folder needs a name; download reports a refusal', async () => {
    const onAddFolder = vi.fn().mockResolvedValue({ id: 'f9' });
    const onDownload = vi.fn().mockRejectedValue(new Error('This file is still being checked for viruses. Try again in a minute.'));
    show(<CompanyDocumentsScreen live={live({ onAddFolder, onDownload })} />);
    await ue.click(screen.getByRole('button', { name: 'New folder' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add folder' }));
    expect(await within(d).findByText('Name the folder (2 letters or more).')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Insurance');
    await ue.click(within(d).getByRole('radio', { name: 'Document managers only' }));
    await ue.click(within(d).getByRole('button', { name: 'Add folder' }));
    expect(onAddFolder).toHaveBeenCalledWith('Insurance', 'managers');
    await ue.click(screen.getAllByRole('button', { name: 'Download' })[0]);
    expect((await screen.findAllByText(/still being checked/)).length).toBeGreaterThan(0);
  });
});

describe('ANL-06 report library (live)', () => {
  const reports = [
    { id: 'pay.register', name: 'Salary register', question: 'How much do we pay, and is it right?', area: 'Payroll', href: '/yx/payroll/reports', format: 'Table · CSV', sensitivity: 'Confidential' as const, favourite: true },
    { id: 'learning.compliance', name: 'Mandatory training compliance', question: 'Are people trained for their work?', area: 'Learning', href: '/yx/learning/compliance', format: 'Table · CSV', sensitivity: 'Internal' as const, favourite: false },
  ];
  it('groups by question; favourites only; the star toggles; Open goes to the area', async () => {
    const onFavourite = vi.fn().mockResolvedValue({});
    const onOpen = vi.fn();
    show(<ReportLibraryScreen live={{ state: 'ready', reports, onFavourite, onOpen }} />);
    expect(screen.getByText('Are people trained for their work?')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add Mandatory training compliance to favourites' }));
    expect(onFavourite).toHaveBeenCalledWith('learning.compliance', true);
    await ue.click(screen.getByRole('switch', { name: 'Favourites only' }));
    expect(screen.queryByText('Mandatory training compliance')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('/yx/payroll/reports');
  });

  it('nothing to open says so; a search with no match offers to show all', async () => {
    const { unmount } = show(<ReportLibraryScreen live={{ state: 'ready', reports: [], onFavourite: vi.fn(), onOpen: vi.fn() }} />);
    expect(screen.getByText('No reports for you yet')).toBeInTheDocument();
    unmount();
    show(<ReportLibraryScreen live={{ state: 'ready', reports, onFavourite: vi.fn(), onOpen: vi.fn() }} />);
    await ue.type(screen.getByRole('textbox', { name: 'Search reports' }), 'canteen');
    expect(screen.getByText('No reports match "canteen".')).toBeInTheDocument();
  });
});
