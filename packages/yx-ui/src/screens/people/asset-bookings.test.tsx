import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AssetBookingsScreen, MyAssetBookingsScreen } from './asset-bookings';
import { AssetPageScreen } from './asset-page';
import { ASSET_PAGE, liveAssetPage } from './asset-page-samples';
import { liveItBookings, liveMyBookings } from './it-asset-samples';

// IT assets part 5 (answer 2715): asset booking, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const dates = async (d: HTMLElement, from: string, to: string) => {
  await ue.type(within(d).getByRole('textbox', { name: /^First day/ }), `${from}{Enter}`);
  await ue.type(within(d).getByRole('textbox', { name: /^Last day/ }), `${to}{Enter}`);
};

describe('Me › Asset bookings (live)', () => {
  it('lists my bookings to come and with me; past ones apart with the reason', async () => {
    show(<MyAssetBookingsScreen live={liveMyBookings()} />);
    const t = screen.getByRole('table', { name: 'My asset bookings' });
    expect(within(t).getByText('Handed over')).toBeInTheDocument();
    expect(within(t).getByText('Waiting for IT')).toBeInTheDocument();
    expect(within(t).queryByText('Declined')).toBeNull();
    await ue.click(screen.getByRole('radio', { name: 'Past' }));
    const p = screen.getByRole('table', { name: 'My asset bookings' });
    expect(within(p).getByText('Declined')).toBeInTheDocument();
    expect(within(p).getByText('Booked for the town hall that day')).toBeInTheDocument();
  });

  it('cancel a repeat: asks first, can take the later repeats too, toast', async () => {
    const onCancel = vi.fn().mockResolvedValue({ cancelled: 2 });
    show(<MyAssetBookingsScreen live={liveMyBookings({ onCancel })} />);
    // The handed-over one has no Cancel; the first to come is the weekly repeat.
    expect(screen.getAllByRole('button', { name: 'Cancel booking' })).toHaveLength(3);
    await ue.click(screen.getAllByRole('button', { name: 'Cancel booking' })[0]);
    const c = await screen.findByRole('dialog', { name: /Cancel your booking of Epson EB-X51 projector/ });
    await ue.click(within(c).getByRole('checkbox', { name: /Also cancel the later repeats/ }));
    await ue.click(within(c).getByRole('button', { name: 'Cancel booking' }));
    expect(onCancel).toHaveBeenCalledWith('b2', true);
    expect((await screen.findAllByText('Booking of Epson EB-X51 projector cancelled.')).length).toBeGreaterThan(0);
  });

  it('book: the free-between search lists free assets by category and location; Book sends the booking', async () => {
    const onSearch = vi.fn(liveMyBookings().onSearch);
    const onBook = vi.fn().mockResolvedValue({ ids: ['b9'], status: 'booked' });
    show(<MyAssetBookingsScreen live={liveMyBookings({ onSearch, onBook })} />);
    await ue.click(screen.getByRole('button', { name: 'Book an asset' }));
    const d = await screen.findByRole('dialog', { name: 'Book an asset' });
    await dates(d, '01/12/2026', '03/12/2026');
    await ue.type(within(d).getByRole('textbox', { name: /^Purpose/ }), 'Client demo');
    await ue.click(within(d).getByRole('button', { name: 'Find free assets' }));
    expect(onSearch).toHaveBeenCalledWith('2026-12-01', '2026-12-03');
    const t = await within(d).findByRole('table', { name: 'Free assets' });
    expect(within(t).getByText('Dell Latitude 5440 (spare)')).toBeInTheDocument();
    await ue.click(within(d).getByRole('combobox', { name: 'Category' }));
    await ue.click(await screen.findByRole('option', { name: 'Projector' }));
    expect(within(t).queryByText('Dell Latitude 5440 (spare)')).toBeNull();
    await ue.click(within(t).getByRole('button', { name: 'Book' }));
    expect(onBook).toHaveBeenCalledWith({ assetId: 'a7', startsOn: '2026-12-01', endsOn: '2026-12-03', repeat: 'none', until: null, purpose: 'Client demo' });
    expect((await screen.findAllByText('Booked: Epson EB-X51 projector, 1 Dec 2026 to 3 Dec 2026.')).length).toBeGreaterThan(0);
  });

  it('negative: no dates, too long, a weekly repeat without its end or longer than a week: refused before searching', async () => {
    const onSearch = vi.fn(liveMyBookings().onSearch);
    show(<MyAssetBookingsScreen live={liveMyBookings({ onSearch })} />);
    await ue.click(screen.getByRole('button', { name: 'Book an asset' }));
    const d = await screen.findByRole('dialog', { name: 'Book an asset' });
    await ue.click(within(d).getByRole('button', { name: 'Find free assets' }));
    expect(within(d).getByText('Choose the first day.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the last day.')).toBeInTheDocument();
    await dates(d, '01/12/2026', '20/12/2026');
    await ue.click(within(d).getByRole('button', { name: 'Find free assets' }));
    expect(within(d).getByText('A booking is at most 14 days.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Every week' }));
    await ue.click(within(d).getByRole('button', { name: 'Find free assets' }));
    expect(within(d).getByText('A weekly repeat books at most 7 days at a time.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the day the repeats end, after the first day.')).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('a weekly repeat sends its end; a clash from the server shows and nothing closes; with approval the toast says IT decides', async () => {
    const onBook = vi.fn().mockRejectedValueOnce(new Error('Epson EB-X51 projector (PJ-0003) is already booked on 2026-12-15. Nothing was booked.')).mockResolvedValueOnce({ ids: ['b9', 'b10', 'b11'], status: 'pending' });
    show(<MyAssetBookingsScreen live={liveMyBookings({ onBook, approval: true })} />);
    await ue.click(screen.getByRole('button', { name: 'Book an asset' }));
    const d = await screen.findByRole('dialog', { name: 'Book an asset' });
    expect(within(d).getByText('IT approves each booking.')).toBeInTheDocument();
    await dates(d, '01/12/2026', '01/12/2026');
    await ue.click(within(d).getByRole('radio', { name: 'Every week' }));
    await ue.type(within(d).getByRole('textbox', { name: /^Repeat until/ }), '15/12/2026{Enter}');
    await ue.click(within(d).getByRole('button', { name: 'Find free assets' }));
    const t = await within(d).findByRole('table', { name: 'Free assets' });
    await ue.click(within(t).getAllByRole('button', { name: 'Book' })[0]);
    expect(await within(d).findByText('Epson EB-X51 projector (PJ-0003) is already booked on 2026-12-15. Nothing was booked.')).toBeInTheDocument();
    expect(onBook).toHaveBeenCalledWith(expect.objectContaining({ repeat: 'weekly', until: '2026-12-15' }));
    await ue.click(within(t).getAllByRole('button', { name: 'Book' })[0]);
    expect((await screen.findAllByText('Sent to IT: Epson EB-X51 projector (3 times). You are told when they decide.')).length).toBeGreaterThan(0);
  });
});

describe('People › Asset bookings (live, IT)', () => {
  it('opens on the bookings waiting for approval; Approve sends and toasts', async () => {
    const onApprove = vi.fn().mockResolvedValue({ approved: 1 });
    show(<AssetBookingsScreen live={liveItBookings({ onApprove })} />);
    const t = screen.getByRole('table', { name: 'Asset bookings' });
    expect(within(t).getByText('Meera Iyer')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Waiting (1)' })).toHaveAttribute('aria-checked', 'true');
    await ue.click(within(t).getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith('k1');
    expect((await screen.findAllByText('Approved: CM-0002 for Meera Iyer.')).length).toBeGreaterThan(0);
  });

  it('negative: decline and cancel need a reason; the reason is sent', async () => {
    const onDecline = vi.fn().mockResolvedValue({ declined: 1 });
    show(<AssetBookingsScreen live={liveItBookings({ onDecline })} />);
    await ue.click(screen.getByRole('button', { name: 'Decline' }));
    const c = await screen.findByRole('dialog', { name: /Decline Meera Iyer's booking of CM-0002/ });
    expect(within(c).getByRole('button', { name: 'Decline' })).toBeDisabled();
    await ue.type(within(c).getByRole('textbox', { name: /^Reason/ }), 'Camera at the plant shoot');
    await ue.click(within(c).getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalledWith('k1', 'Camera at the plant shoot');
  });

  it('hand over only on a day of the booking; take back with where it goes; overdue in red', async () => {
    const onHandOver = vi.fn().mockResolvedValue({ assignmentId: 'x1' });
    const onTakeBack = vi.fn().mockResolvedValue({ ok: true });
    show(<AssetBookingsScreen live={liveItBookings({ onHandOver, onTakeBack })} />);
    await ue.click(screen.getByRole('radio', { name: 'Booked (3)' }));
    const t = screen.getByRole('table', { name: 'Asset bookings' });
    // Today's booking can be handed over; the one next week only cancelled; another place's: no buttons.
    expect(within(t).getAllByRole('button', { name: 'Hand over' })).toHaveLength(1);
    expect(within(t).getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    await ue.click(within(t).getByRole('button', { name: 'Hand over' }));
    const h = await screen.findByRole('dialog', { name: /Hand PJ-0003 over to Arjun Kulkarni/ });
    await ue.click(within(h).getByRole('button', { name: 'Hand over' }));
    expect(onHandOver).toHaveBeenCalledWith('k2', 'Good');
    await ue.click(screen.getByRole('radio', { name: 'Handed over (1)' }));
    const o = screen.getByRole('table', { name: 'Asset bookings' });
    expect(within(o).getByText('Overdue').closest('[data-tone]')).toHaveAttribute('data-tone', 'danger');
    await ue.click(within(o).getByRole('button', { name: 'Take back' }));
    const b = await screen.findByRole('dialog', { name: /Take LT-0507 back from Kavya Reddy/ });
    await ue.click(within(b).getByRole('radio', { name: 'In repair' }));
    await ue.click(within(b).getByRole('button', { name: 'Take back' }));
    expect(onTakeBack).toHaveBeenCalledWith(expect.objectContaining({ id: 'k3', assetId: 'a8' }), { condition: 'Good', status: 'in_repair' });
  });

  it('the loan report: a person picked shows all their bookings, past and to come', async () => {
    show(<AssetBookingsScreen live={liveItBookings()} />);
    await ue.click(screen.getByRole('combobox', { name: 'Person' }));
    await ue.click(await screen.findByRole('option', { name: 'Meera Iyer' }));
    const t = screen.getByRole('table', { name: 'Asset bookings' });
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    expect(within(t).getAllByText('Meera Iyer')).toHaveLength(3);
    expect(within(t).queryByText('Kavya Reddy')).toBeNull();
    expect(within(t).getByText('Returned')).toBeInTheDocument();
  });
});

describe('Asset page › Bookings', () => {
  it('lists its bookings; an asset manager makes an in-stock asset bookable', async () => {
    const onSetBookable = vi.fn().mockResolvedValue({ bookable: true });
    show(<AssetPageScreen live={liveAssetPage({ onSetBookable, data: { ...ASSET_PAGE, asset: { ...ASSET_PAGE.asset, status: 'in_stock' } } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Bookings (2)' }));
    expect(within(screen.getByRole('table', { name: 'Bookings of this asset' })).getByText('Arjun Nair')).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: /Bookable/ }));
    expect(onSetBookable).toHaveBeenCalledWith(true);
    expect((await screen.findAllByText('Employees can now book it.')).length).toBeGreaterThan(0);
  });

  it('negative: not in stock cannot be made bookable; a viewer without asset.manage has no switch', async () => {
    const { unmount } = show(<AssetPageScreen live={liveAssetPage({ onSetBookable: vi.fn() })} />);
    await ue.click(screen.getByRole('tab', { name: 'Bookings (2)' }));
    expect(screen.getByRole('checkbox', { name: /Bookable/ })).toBeDisabled();
    expect(screen.getByText('Only an asset in stock can be made bookable.')).toBeInTheDocument();
    unmount();
    show(<AssetPageScreen live={liveAssetPage({ onSetBookable: vi.fn(), data: { ...ASSET_PAGE, canManage: false } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Bookings (2)' }));
    expect(screen.queryByRole('checkbox', { name: /Bookable/ })).toBeNull();
    expect(screen.getByText('It is not bookable.')).toBeInTheDocument();
  });
});
