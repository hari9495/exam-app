import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { FacilitiesScreen, TicketPlaceCard, type EquipmentPageView, type FacilitiesRegister } from './facilities';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const REG: FacilitiesRegister = {
  canEdit: true,
  desks: [{ id: 'd1', name: 'Facilities desk', groups: [{ id: 'g1', name: 'Electrical' }] }],
  buildings: [{ id: 'l1', name: 'Bengaluru office', code: 'BLR', areas: [{ id: 'a1', name: '2nd floor', status: 'active', version: 1 }, { id: 'a2', name: 'Old canteen', status: 'retired', version: 1 }] }],
  equipment: [
    { id: 'e1', name: 'Passenger lift', tag: 'LIFT-1', category: 'Lift', status: 'active', version: 1, deskId: 'd1', ownerGroupId: 'g1', ownerTeam: 'Electrical', locationId: 'l1', building: 'Bengaluru office', areaId: 'a1', area: '2nd floor', canEdit: true },
    { id: 'e2', name: 'Old AC', tag: 'AC-9', category: null, status: 'retired', version: 2, deskId: 'd1', ownerGroupId: 'g1', ownerTeam: 'Electrical', locationId: 'l1', building: 'Bengaluru office', areaId: null, area: null, canEdit: true },
  ],
};
const PAGE: EquipmentPageView = { id: 'e1', name: 'Passenger lift', tag: 'LIFT-1', category: 'Lift', status: 'active', building: 'Bengaluru office', area: '2nd floor', ownerTeam: 'Electrical', maintenance: [{ id: 'r1', name: 'Lift monthly service', rrule: 'FREQ=MONTHLY', nextRunAt: '2026-12-05T04:30:00Z', state: 'active' }], workOrders: [{ id: 't1', number: 'FAC-1042', subject: 'Lift monthly service', systemState: 'open', createdAt: '2026-11-05T04:30:00Z', resolvedAt: null, recurring: true }] };
const show = (over: Partial<React.ComponentProps<typeof FacilitiesScreen>> = {}) =>
  render(
    <ToastProvider>
      <FacilitiesScreen state="ready" register={REG} onSaveArea={vi.fn().mockResolvedValue(undefined)} onSaveEquipment={vi.fn().mockResolvedValue(undefined)} onOpenEquipment={vi.fn().mockResolvedValue(PAGE)} onOpenTicket={vi.fn()} {...over} />
    </ToastProvider>,
  );

describe('buildings and equipment (Helpdesk plan item 4)', () => {
  it('lists equipment with place and owner team; a retired one is marked; read-only staff get no New or Edit', () => {
    const { unmount } = show();
    const list = screen.getByRole('list', { name: 'Equipment' });
    expect(within(list).getByText('Bengaluru office · 2nd floor · Electrical · Lift')).toBeInTheDocument();
    expect(within(list).getByText('Retired')).toBeInTheDocument();
    unmount();
    show({ register: { ...REG, canEdit: false, desks: [], equipment: REG.equipment.map((e) => ({ ...e, canEdit: false })) } });
    expect(screen.queryByRole('button', { name: 'New equipment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Passenger lift' })).toBeNull();
  });

  it('new equipment: nothing filled is stopped; the area list leaves out retired areas; then it is saved', async () => {
    const onSaveEquipment = vi.fn().mockResolvedValue(undefined);
    show({ onSaveEquipment });
    await ue.click(screen.getByRole('button', { name: 'New equipment' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save equipment' }));
    expect(within(dialog).getByText('Name the equipment.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose the building.')).toBeInTheDocument();
    expect(onSaveEquipment).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Chiller');
    await ue.type(within(dialog).getByRole('textbox', { name: /^Tag/ }), 'CH-1');
    await ue.click(within(dialog).getByRole('combobox', { name: /Owner team/ }));
    await ue.click(await screen.findByRole('option', { name: 'Electrical' }));
    await ue.click(within(dialog).getByRole('combobox', { name: /^Building/ }));
    await ue.click(await screen.findByRole('option', { name: 'Bengaluru office' }));
    await ue.click(within(dialog).getByRole('combobox', { name: /Floor or area/ }));
    expect(screen.queryByRole('option', { name: 'Old canteen' })).toBeNull();
    await ue.click(await screen.findByRole('option', { name: '2nd floor' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save equipment' }));
    await waitFor(() => expect(onSaveEquipment).toHaveBeenCalledWith(null, { deskId: 'd1', ownerGroupId: 'g1', locationId: 'l1', areaId: 'a1', name: 'Chiller', tag: 'CH-1', category: null, status: 'active' }));
  });

  it('the equipment page shows its maintenance and its work orders; a work order opens the ticket', async () => {
    const onOpenTicket = vi.fn();
    show({ onOpenTicket });
    await ue.click(screen.getByRole('button', { name: 'Open Passenger lift' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Lift monthly service', { selector: '.yx-ops-list__main, .yx-ops-list__main *' })).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Open FAC-1042' }));
    expect(onOpenTicket).toHaveBeenCalledWith('t1');
  });

  it('a new area for a building; nothing written is stopped', async () => {
    const onSaveArea = vi.fn().mockResolvedValue(undefined);
    show({ onSaveArea, start: { tab: 'buildings' } });
    await ue.click(screen.getByRole('button', { name: 'Add an area to Bengaluru office' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save area' }));
    expect(within(dialog).getByText('Name the floor or area.')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /Floor or area/ }), 'Server room');
    await ue.click(within(dialog).getByRole('button', { name: 'Save area' }));
    await waitFor(() => expect(onSaveArea).toHaveBeenCalledWith(null, { locationId: 'l1', name: 'Server room', status: 'active' }));
  });

  it('the ticket Place card: an agent picks equipment and saves; others see it read only', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onPick = vi.fn(async (kind: string) => (kind === 'equipment' ? [{ id: 'e1', label: 'Passenger lift (LIFT-1)', detail: 'Lift' }] : []));
    const empty = { building: null, area: null, equipment: null };
    const { unmount } = render(<ToastProvider><TicketPlaceCard place={empty} canSet onPick={onPick} onSave={onSave} /></ToastProvider>);
    await ue.click(screen.getByRole('combobox', { name: 'Equipment' }));
    await ue.click(await screen.findByRole('option', { name: /Passenger lift/ }));
    await ue.click(screen.getByRole('button', { name: 'Save place' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ locationId: null, areaId: null, equipmentId: 'e1' }));
    unmount();
    render(<TicketPlaceCard place={{ building: { id: 'l1', name: 'Bengaluru office' }, area: null, equipment: null }} canSet={false} />);
    expect(screen.getByText('Bengaluru office')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save place' })).toBeNull();
  });
});
