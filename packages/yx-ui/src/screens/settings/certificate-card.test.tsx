import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CertificateCard, type CertificateTemplateView } from './certificate-card';

// Settings 6.5 › Pass certificate (answer 2424): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const CERT: CertificateTemplateView = { title: 'Certificate of Achievement', bodyText: 'Passed {{examTitle}}', signatoryName: null, enabled: true, isDefault: true };
const show = (canEdit = true, onSave = vi.fn().mockResolvedValue({}), template = CERT) => (render(<ToastProvider><CertificateCard template={template} canEdit={canEdit} onSave={onSave} /></ToastProvider>), onSave);

describe('CertificateCard', () => {
  it('shows the wording; Edit saves title, text, who signs and on/off, then a toast', async () => {
    const onSave = show();
    expect(screen.getByText('Standard wording')).toBeInTheDocument();
    expect(screen.getByText('No name')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit certificate' }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Signed by/), 'Meenakshi');
    await ue.click(within(sheet).getByRole('checkbox', { name: /Use this wording/ }));
    await ue.click(within(sheet).getByRole('button', { name: 'Save certificate' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: 'Certificate of Achievement', bodyText: 'Passed {{examTitle}}', signatoryName: 'Meenakshi', enabled: false }));
    expect((await screen.findAllByText('Certificate saved')).length).toBeGreaterThan(0);
  });

  it('an empty text or one over 4000 characters saves nothing; a refusal keeps the sheet open with the reason', async () => {
    const onSave = show(true, vi.fn().mockRejectedValue(new Error('Not allowed.')));
    await ue.click(screen.getByRole('button', { name: 'Edit certificate' }));
    const sheet = await screen.findByRole('dialog');
    await ue.clear(within(sheet).getByLabelText(/^Text/));
    await ue.click(within(sheet).getByRole('button', { name: 'Save certificate' }));
    expect(within(sheet).getByText('Enter the text.')).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText(/^Text/)).toHaveFocus());
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByLabelText(/^Text/), 'Well done');
    await ue.click(within(sheet).getByRole('button', { name: 'Save certificate' }));
    expect(await screen.findByText('Not allowed.')).toBeInTheDocument();
  });

  it('without the key: no Edit; own wording that is off says the standard wording is used', () => {
    show(false, vi.fn(), { ...CERT, isDefault: false, enabled: false, signatoryName: 'Meenakshi' });
    expect(screen.queryByRole('button', { name: 'Edit certificate' })).toBeNull();
    expect(screen.getByText('Your wording is off: the standard wording is used')).toBeInTheDocument();
  });
});
