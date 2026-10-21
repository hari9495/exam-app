import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorText, reportErrors, UploadDocDialog } from './upload-doc-dialog';

// PPL-03 Documents upload (founder 22 Oct 2026): type, then file (and expiry when tracked), then an explicit Upload;
// a refusal shows as a plain message in the dialog.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const TYPES = [
  { key: 'pan_card', name: 'PAN card', expiryTracked: false },
  { key: 'passport', name: 'Passport', expiryTracked: true },
];
const pdf = () => new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
const choose = async (name: string) => {
  await ue.click(screen.getByRole('combobox', { name: 'Document' }));
  await ue.click(await screen.findByRole('option', { name }));
};

describe('UploadDocDialog', () => {
  it('nothing is sent until Upload; the file box waits for the type', async () => {
    const onUpload = jest.fn(async () => undefined);
    const onClose = jest.fn();
    render(<UploadDocDialog name="Arjun" types={TYPES} onUpload={onUpload} onClose={onClose} />);
    expect(screen.queryByLabelText('File')).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    await choose('PAN card');
    await ue.upload(screen.getByLabelText('File'), pdf());
    expect(onUpload).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('pan_card', expect.any(File), null));
    expect(onClose).toHaveBeenCalled();
  });

  it('an expiry-tracked type needs the expiry date before Upload', async () => {
    const onUpload = jest.fn(async () => undefined);
    render(<UploadDocDialog name="Arjun" types={TYPES} onUpload={onUpload} onClose={jest.fn()} />);
    await choose('Passport');
    await ue.upload(screen.getByLabelText('File'), pdf());
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: 'Expiry date' }), '08 Feb 2031');
    await ue.tab();
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('passport', expect.any(File), '2031-02-08'));
  });

  it('a refusal from the server is a plain message and the dialog stays open', async () => {
    const onClose = jest.fn();
    render(<UploadDocDialog name="Arjun" types={TYPES} onUpload={async () => Promise.reject(new Error('The file has not passed the virus check yet.'))} onClose={onClose} />);
    await choose('PAN card');
    await ue.upload(screen.getByLabelText('File'), pdf());
    await ue.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('The file has not passed the virus check yet.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a wrong file type is refused before anything is sent', async () => {
    render(<UploadDocDialog name="Arjun" types={TYPES} onUpload={jest.fn()} onClose={jest.fn()} />);
    await choose('PAN card');
    await userEvent.setup({ applyAccept: false, pointerEventsCheck: 0 }).upload(screen.getByLabelText('File'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByText('Choose a PDF, PNG or JPEG file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('errorText gives the server message, or a plain fallback', () => {
    expect(errorText(new Error('Not allowed'))).toBe('Not allowed');
    expect(errorText('x')).toBe('That did not work. Try again in a moment.');
  });

  it('verify, reject and download refusals become a plain message, not an uncaught error', async () => {
    const show = jest.fn();
    await expect(reportErrors(async () => Promise.reject(new Error('The file has not passed the virus check yet.')), show)).resolves.toBeUndefined();
    await reportErrors(() => {
      throw new Error('Not found');
    }, show);
    await reportErrors(async () => 'ok', show);
    expect(show.mock.calls).toEqual([['The file has not passed the virus check yet.'], ['Not found']]);
  });
});
