import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { WorkersView } from './contract';
import { CONTRACTORS, WORKERS } from './contract-data';
import { ClWorkerList } from '../portals/contractor-portal';

// Answer 754: the contractor sends the worker's photo with the worker; the site checks it at approval. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date(2026, 10, 11);
const pending = { ...WORKERS.find((w) => w.status === 'Pending approval')!, photo: true };
const view = (over: Record<string, unknown> = {}) => (
  <WorkersView workers={[pending]} contractors={CONTRACTORS} locations={[{ id: 'hsr', name: 'Hosur plant', state: 'TN' }]} today={TODAY} state="ready" sheet={{ kind: 'approve', id: pending.id }} canManage inductionRequired={false} inductionMonths={12} {...over} />
);

describe('site approval checks the photo (754)', () => {
  it('a worker with a photo: the photo shows and must be ticked as the person before approval', async () => {
    const onApprove = vi.fn(async () => undefined);
    show(view({ onApprove, photoUrl: vi.fn(async () => 'blob:photo') }));
    const d = screen.getByRole('dialog', { name: new RegExp(`Approve ${pending.name}`) });
    expect(await within(d).findByAltText(`Photo of ${pending.name}`)).toHaveAttribute('src', 'blob:photo');
    await ue.click(within(d).getByRole('button', { name: 'Approve and issue gate pass' }));
    expect(onApprove).not.toHaveBeenCalled();
    expect(within(d).getByText('Tick that the person at the site is the one in the photo.')).toBeInTheDocument();
    await ue.click(within(d).getByLabelText('The person at the site is the one in this photo'));
    await ue.click(within(d).getByRole('button', { name: 'Approve and issue gate pass' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(pending.id, expect.any(Number), { on: null, by: null, photoChecked: true }));
  });

  it('a worker without a photo: no photo check', async () => {
    const onApprove = vi.fn(async () => undefined);
    show(view({ workers: [{ ...pending, photo: false }], onApprove }));
    const d = screen.getByRole('dialog', { name: new RegExp(`Approve ${pending.name}`) });
    expect(within(d).queryByLabelText('The person at the site is the one in this photo')).not.toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Approve and issue gate pass' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(pending.id, expect.any(Number), { on: null, by: null }));
  });
});

describe('the contractor sends the photo with the worker (754)', () => {
  const fill = async () => {
    await ue.type(screen.getByLabelText(/^Name/), 'Ramesh');
    await ue.type(screen.getByLabelText(/^Date of birth/), '01/01/1995');
    await ue.type(screen.getByLabelText(/^Aadhaar number/), '234567890123');
    await ue.type(screen.getByLabelText(/^First day/), '20/11/2026');
  };
  it('the photo goes up once the worker is sent', async () => {
    const onAdd = vi.fn(async () => ({ id: 'd9' }));
    const onPhoto = vi.fn(async () => undefined);
    show(<ClWorkerList workers={[]} sites={[{ id: 'hsr', name: 'Hosur plant' }]} today={TODAY} adding onCheck={vi.fn(async () => [])} onAdd={onAdd} onPhoto={onPhoto} />);
    await fill();
    await ue.upload(document.querySelector('#aw-photo input[type="file"], input[type="file"]') as HTMLInputElement, new File(['x'], 'face.jpg', { type: 'image/jpeg' }));
    await ue.click(screen.getByRole('button', { name: 'Send for site approval' }));
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith('d9', expect.any(File)));
    expect((await screen.findAllByText('Sent for site approval with the photo')).length).toBeGreaterThan(0);
  });

  it('a photo that fails to upload still sends the worker and says so; no photo, no upload', async () => {
    const onAdd = vi.fn(async () => ({ id: 'd9' }));
    const onPhoto = vi.fn(async () => { throw new Error('too big'); });
    const { unmount } = show(<ClWorkerList workers={[]} sites={[{ id: 'hsr', name: 'Hosur plant' }]} today={TODAY} adding onCheck={vi.fn(async () => [])} onAdd={onAdd} onPhoto={onPhoto} />);
    await fill();
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'face.png', { type: 'image/png' }));
    await ue.click(screen.getByRole('button', { name: 'Send for site approval' }));
    expect((await screen.findAllByText('Sent for site approval; the photo did not upload')).length).toBeGreaterThan(0);
    unmount();
    const onPhoto2 = vi.fn();
    show(<ClWorkerList workers={[]} sites={[{ id: 'hsr', name: 'Hosur plant' }]} today={TODAY} adding onCheck={vi.fn(async () => [])} onAdd={onAdd} onPhoto={onPhoto2} />);
    await fill();
    await ue.click(screen.getByRole('button', { name: 'Send for site approval' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
    expect(onPhoto2).not.toHaveBeenCalled();
  });
});
