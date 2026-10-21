import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/notify';
import { PlacementsLiveScreen, type LivePlacement } from './placements-live';

const row = (over: Partial<LivePlacement> = {}): LivePlacement => ({ id: 'p1', personId: 'x', name: 'Aravind Kumar', legalEntity: { id: 'ka', name: 'Kaveri Foods' }, client: 'Nilgiri Retail', role: 'Java Developer', startOn: '2026-01-05', endOn: '2026-12-31', billRate: '1200.00', payRate: '800.00', statutoryPerHour: '96.00', supply: 'own', vendor: null, status: 'active', endedOn: null, ...over });
const show = (over: Partial<Parameters<typeof PlacementsLiveScreen>[0]> = {}) =>
  render(
    <ToastProvider>
      <PlacementsLiveScreen state="ready" today="2026-09-29" rows={[row(), row({ id: 'p2', name: 'Priya Nair', supply: 'vendor', vendor: 'Sahyadri Staffing', payRate: '900.00', statutoryPerHour: '0.00', status: 'ending_soon' })]} entities={[{ id: 'ka', name: 'Kaveri Foods' }]} canManage onCreate={vi.fn(async () => ({}))} onEnd={vi.fn(async () => ({}))} {...over} />
    </ToastProvider>,
  );

describe('Placements, live (HIR-17)', () => {
  it('shows the margin as designed: bill − pay − statutory cost, or bill − vendor rate', () => {
    show();
    expect(screen.getByRole('row', { name: /Aravind Kumar/ })).toHaveTextContent('₹304');
    const vendor = screen.getByRole('row', { name: /Priya Nair/ });
    expect(vendor).toHaveTextContent('Vendor: Sahyadri Staffing');
    expect(vendor).toHaveTextContent('₹300');
    expect(vendor).toHaveTextContent('Ending soon');
  });

  it('read only: no New placement', () => {
    show({ canManage: false });
    expect(screen.queryByRole('button', { name: 'New placement' })).not.toBeInTheDocument();
  });

  it('asks for the client, dates and rates before adding a placement', () => {
    show({ defaultNewOpen: true });
    expect(screen.getByRole('button', { name: 'Add placement' })).toBeDisabled();
  });
});
