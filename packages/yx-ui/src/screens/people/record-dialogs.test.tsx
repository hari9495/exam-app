import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonWorkspace } from './record';
import { AboutMeDialog, AskDocumentDialog, ClearAboutMeDialog, PersonTagsDialog, SendBackDialog, UploadForPersonDialog, WorkPhoneDialog, workPhoneOk } from './record-dialogs';

// PPL-03 record dialogs (work phone, ask for a document, send back, upload for the person): the stories are the live
// dialogs; pressed too early they show the field error and focus it; a refusal stays in the open dialog.
// A fresh user per test: one shared across tests kept the last dialog's focus and pointer state.
let ue: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  ue = userEvent.setup({ pointerEventsCheck: 0 });
});
const TYPES = [
  { key: 'pan_card', name: 'PAN card' },
  { key: 'passport', name: 'Passport', expiryTracked: true },
];
const pdf = () => new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
const choose = async (label: string, name: string) => {
  await ue.click(screen.getByRole('combobox', { name: label }));
  await ue.click(await screen.findByRole('option', { name }));
  // The picker hands the focus back to its box a moment later; wait so the next typing lands where it is aimed.
  await new Promise((r) => setTimeout(r, 50));
};

describe('WorkPhoneDialog', () => {
  it('saves the trimmed number, or null to clear it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkPhoneDialog name="Arjun" initial="" onSave={onSave} onClose={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    expect(workPhoneOk('+91 44 4012 3142')).toBe(true);
    expect(workPhoneOk('12345')).toBe(false);
    expect(workPhoneOk('+91 abc 1234567')).toBe(false);
  });
});

describe('PersonTagsDialog and the Tags card (T2-G 2903)', () => {
  const OPTIONS = [{ value: 't1', label: 'First aider' }, { value: 't2', label: 'Fire warden' }];
  it('saves the picked tags; a refusal stays in the open dialog', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Fire warden is archived; choose an active tag.')).mockResolvedValue(undefined);
    render(<PersonTagsDialog name="Arjun" initial={['t1']} options={OPTIONS} onSave={onSave} onClose={vi.fn()} />);
    await ue.click(screen.getByRole('combobox', { name: 'Tags' }));
    await ue.click(await screen.findByRole('option', { name: 'Fire warden' }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['t1', 't2']));
    expect(await screen.findByText(/Fire warden is archived/)).toBeInTheDocument();
  });
  it('HR sees the tags with Edit on the Job tab; the person and their manager never see the card', () => {
    const day = new Date(2026, 8, 30);
    const hr = render(<PersonWorkspace persona="hr" relation="other" today={day} defaultTab="job" />);
    const card = within(screen.getByRole('region', { name: 'Tags' }));
    expect(card.getByText('First aider')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    hr.unmount();
    const self = render(<PersonWorkspace persona="emp" relation="self" today={day} defaultTab="job" />);
    expect(screen.queryByRole('region', { name: 'Tags' })).toBeNull();
    self.unmount();
    render(<PersonWorkspace persona="mgr" relation="team" today={day} defaultTab="job" />);
    expect(screen.queryByRole('region', { name: 'Tags' })).toBeNull();
  });
});

describe('AskDocumentDialog and SendBackDialog', () => {
  it('sends the chosen type with its name', async () => {
    const onRequest = vi.fn().mockResolvedValue(undefined);
    render(<AskDocumentDialog name="Arjun" types={TYPES} onRequest={onRequest} onClose={vi.fn()} />);
    await choose('Document', 'PAN card');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith('pan_card', 'PAN card'));
  });
  it('sends the reason and the message together', async () => {
    const onSendBack = vi.fn().mockResolvedValue(undefined);
    render(<SendBackDialog name="Arjun" docType="PAN card" onSendBack={onSendBack} onClose={vi.fn()} />);
    await ue.type(screen.getByRole('textbox', { name: /Message to Arjun/ }), 'Scan it in daylight');
    await choose('Reason', 'Image is unclear');
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(onSendBack).toHaveBeenCalledWith('Image is unclear. Scan it in daylight'));
  });
});

describe('UploadForPersonDialog (ported from the web dialog)', () => {
  it('nothing is sent until Upload; the file box waits for the type; Upload is never disabled', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<UploadForPersonDialog name="Arjun" types={TYPES} onUpload={onUpload} onClose={onClose} />);
    expect(screen.queryByLabelText('File')).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    await choose('Document', 'PAN card');
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findAllByText('Choose the file to upload.')).length).toBeGreaterThan(0);
    await ue.upload(screen.getByLabelText('File'), pdf());
    expect(onUpload).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('pan_card', expect.any(File), null));
    expect(onClose).toHaveBeenCalled();
  });

  it('an expiry-tracked type needs the expiry date before Upload', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<UploadForPersonDialog name="Arjun" types={TYPES} onUpload={onUpload} onClose={vi.fn()} />);
    await choose('Document', 'Passport');
    await ue.upload(screen.getByLabelText('File'), pdf());
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findAllByText('Enter the expiry date.')).length).toBeGreaterThan(0);
    expect(onUpload).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Expiry date/ }), '08 Feb 2031');
    await ue.tab();
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('passport', expect.any(File), '2031-02-08'));
  });

  it('a refusal from the server is a plain message and the dialog stays open', async () => {
    const onClose = vi.fn();
    render(<UploadForPersonDialog name="Arjun" types={TYPES} onUpload={() => Promise.reject(new Error('The file has not passed the virus check yet.'))} onClose={onClose} />);
    await choose('Document', 'PAN card');
    await ue.upload(screen.getByLabelText('File'), pdf());
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('The file has not passed the virus check yet.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a wrong file type is refused before anything is sent', async () => {
    const onUpload = vi.fn();
    render(<UploadForPersonDialog name="Arjun" types={TYPES} onUpload={onUpload} onClose={vi.fn()} />);
    await choose('Document', 'PAN card');
    await userEvent.setup({ applyAccept: false, pointerEventsCheck: 0 }).upload(screen.getByLabelText('File'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getAllByText('Choose a PDF, PNG or JPEG file.').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe('About me (T2-F 87)', () => {
  it('saves the trimmed text; over 500 characters shows the field error and saves nothing', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AboutMeDialog initial={'x'.repeat(501)} onSave={onSave} onClose={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Keep it to 500 characters.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /About me/ }));
    await ue.type(screen.getByRole('textbox', { name: /About me/ }), '  Hosur quality  ');
    expect(screen.getByText(/^13 of 500 characters/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Hosur quality'));
  });

  it('HR clears it only with a reason', async () => {
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(<ClearAboutMeDialog name="Arjun" onClear={onClear} onClose={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Say why in a few words.')).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Has a phone number');
    await ue.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(onClear).toHaveBeenCalledWith('Has a phone number'));
  });

  it('the record shows it: Edit for the person, Clear for HR, read only for the manager', () => {
    const card = () => within(screen.getByRole('region', { name: 'About me' }));
    const day = new Date(2026, 8, 30);
    const self = render(<PersonWorkspace persona="emp" relation="self" today={day} />);
    expect(card().getByText(/incoming quality at the Hosur plant/)).toBeInTheDocument();
    expect(card().getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    self.unmount();
    const hr = render(<PersonWorkspace persona="hr" relation="other" today={day} />);
    expect(card().getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    hr.unmount();
    render(<PersonWorkspace persona="mgr" relation="team" today={day} />);
    expect(card().getByText(/incoming quality at the Hosur plant/)).toBeInTheDocument();
    expect(card().queryByRole('button')).toBeNull();
  });
});
