import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinerPanel } from './joining';
import type { JoinerForms, JoinerPlaces } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PLACES: JoinerPlaces = { entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }], locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }], departments: [], designations: [], employmentTypes: [], managers: [] };
const SECTIONS = { personal: 'done', identity: 'done', bank: 'to_do', emergency: 'to_do', nominees: 'to_do', tax: 'to_do' } as const;
const ANSWERS = { personal: null, identity: { legalName: 'Sneha Pillai', pan: '••••••234F', aadhaar: null, uan: null }, bank: null, emergency: null, nominees: null, tax: null };

describe('Joiner panel (6b)', () => {
  const forms: JoinerForms = { id: 'pb1', status: 'invited', outcome: null, completion: 40, sections: { ...SECTIONS }, answers: ANSWERS, identityAttested: false, bgv: { requested: false, consent: null, checks: [] }, version: 3 };
  const base = { forms, places: PLACES, plan: { departmentId: 'd', designationId: 'g', employmentTypeId: 't' }, canJoin: true, onPlan: vi.fn(), bgv: { onAsk: vi.fn(), onAdd: vi.fn(), onUpdate: vi.fn() } };

  it('Mark joined waits for the joining day and needs the identity check', async () => {
    const onJoin = vi.fn(async () => ({}));
    const { rerender } = render(<JoinerPanel {...base} onJoin={onJoin} today="2026-10-09" joiningOn="2026-10-19" />);
    // Never disabled: pressed before the day, the reason turns red and no dialog opens.
    await ue.click(screen.getByRole('button', { name: 'Mark joined' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Mark joined becomes available on/)).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByText('••••••234F')).toBeInTheDocument();
    rerender(<JoinerPanel {...base} onJoin={onJoin} today="2026-10-19" joiningOn="2026-10-19" />);
    await ue.click(screen.getByRole('button', { name: 'Mark joined' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Mark joined' }));
    expect(within(dialog).getByText("Tick that you checked the joiner's original ID today.")).toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('checkbox', { name: /original ID/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Mark joined' }));
    expect(onJoin).toHaveBeenCalledWith({ identityAttested: true, status: 'probation' });
  });

  it('no background check before consent: HR can only ask for it', () => {
    render(<JoinerPanel {...base} onJoin={vi.fn()} today="2026-10-09" joiningOn="2026-10-19" />);
    expect(screen.getByRole('button', { name: 'Ask for consent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a check' })).toBeNull();
  });
});
