import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Review } from '../../history/job-changes';
import { CHANGES, IMPACT } from '../../history/data';
import { ASSET_CATEGORY_CHOICES, ENTITY_CHOICES, IMPORT_PREVIEW, JOINER_PLACES, LIVE_BATCH, WAITING_JOINERS } from '../people-data';
import { AddAssetDrawer } from './exits';
import { ImportDrawer } from './lifecycle';
import { AddMembersDialog, BatchDialog, BuddyCard } from './special';

// People popups (founder 28 Oct 2026): a confirm button is never disabled; pressed too early, it says what is missing.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('People popups explain instead of disabling', () => {
  it('Add asset: empty and bad fields are named; a filled form is sent', async () => {
    const onAdd = vi.fn(async () => undefined);
    render(<AddAssetDrawer categories={ASSET_CATEGORY_CHOICES} entities={ENTITY_CHOICES} locations={JOINER_PLACES.locations} onClose={vi.fn()} onAdd={onAdd} />);
    const add = screen.getByRole('button', { name: 'Add asset' });
    expect(add).toBeEnabled();
    await ue.type(screen.getByRole('textbox', { name: /^Cost/ }), '12,000');
    await ue.click(add);
    expect(screen.getByText('Choose the category.')).toBeInTheDocument();
    expect(screen.getByText('Enter the asset tag.')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount like 54000 or 54000.50.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: 'Category' }));
    await ue.click(screen.getByRole('option', { name: 'Laptop' }));
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Dell Latitude 5450');
    await ue.type(screen.getByRole('textbox', { name: /^Asset tag/ }), 'LT-0418');
    await ue.clear(screen.getByRole('textbox', { name: /^Cost/ }));
    await ue.click(add);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'cat-laptop', tag: 'LT-0418', cost: null }));
  });

  it('Import joiners: Check the file with nothing asks for a file; with rows it previews', async () => {
    const onImport = vi.fn(async () => IMPORT_PREVIEW);
    render(<ImportDrawer onClose={vi.fn()} onImport={onImport} onDone={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Check the file' }));
    expect(screen.getByText('Choose a CSV file or paste the rows.')).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /^Or paste the rows/ }), 'Kavya,Reddy');
    await ue.click(screen.getByRole('button', { name: 'Check the file' }));
    expect(await screen.findByText('2 of 3 rows can be added')).toBeInTheDocument();
  });

  it('Buddy: Save without a change says so; a new pick is saved', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<BuddyCard people={JOINER_PLACES.managers} current="m-ramesh" managerEmployeeId="m-divya" onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Save buddy' }));
    expect(screen.getByText(/This is already their buddy/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: 'Buddy' }));
    await ue.click(screen.getByRole('option', { name: /Joseph Mathew/ }));
    await ue.click(screen.getByRole('button', { name: 'Save buddy' }));
    expect(onSave).toHaveBeenCalledWith('m-joseph');
  });

  it('Add joiners: nobody waiting explains on press; nobody picked asks for one', async () => {
    const onAdd = vi.fn(async () => undefined);
    const { unmount } = render(<AddMembersDialog batch={LIVE_BATCH} joiners={[]} onClose={vi.fn()} onAdd={onAdd} />);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add joiners' }));
    expect(screen.getByText(/Nobody to add yet/)).toBeInTheDocument();
    unmount();
    render(<AddMembersDialog batch={LIVE_BATCH} joiners={WAITING_JOINERS} onClose={vi.fn()} onAdd={onAdd} />);
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Add joiners' }));
    expect(within(dialog).getByText('Choose at least one joiner.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('checkbox', { name: /Rahul Verma/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add joiners' }));
    expect(onAdd).toHaveBeenCalledWith(LIVE_BATCH, ['pb-rahul']);
  });

  it('New batch: touchpoints are a day and what happens; missing parts are named, then it saves', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<BatchDialog batch={null} entities={ENTITY_CHOICES} today="2026-10-28" onClose={vi.fn()} onSave={onSave} />);
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Add a touchpoint' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save batch' }));
    expect(within(dialog).getByText('Enter a name of at least 2 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose the day.')).toBeInTheDocument();
    expect(within(dialog).getByText('Say what happens, for example Welcome call.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/yyyy-mm-dd/)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Campus 2027');
    await ue.click(within(dialog).getByRole('combobox', { name: 'Legal entity' }));
    await ue.click(screen.getByRole('option', { name: ENTITY_CHOICES[0].label }));
    await ue.type(within(dialog).getByRole('textbox', { name: 'Joining day' }), '01 Jul 2027{Enter}');
    await ue.type(within(dialog).getByRole('textbox', { name: 'Touchpoint 1 day' }), '01 Jun 2027{Enter}');
    await ue.type(within(dialog).getByRole('textbox', { name: /^Touchpoint 1(?! day)/ }), 'Welcome call');
    await ue.click(within(dialog).getByRole('button', { name: 'Save batch' }));
    expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Campus 2027', joiningOn: '2027-07-01', touchpoints: [{ on: '2027-06-01', title: 'Welcome call' }] }));
  });

  it('Review a change: Approve before the impact shows waits; after, it approves', async () => {
    let show: (i: typeof IMPACT) => void = () => undefined;
    const onApprove = vi.fn(async () => undefined);
    render(<Review row={CHANGES[3]} onPreview={() => new Promise((r) => (show = r))} onApprove={onApprove} onReject={vi.fn()} onClose={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByText('Approve once the impact shows')).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
    show(IMPACT);
    await ue.click(await screen.findByRole('button', { name: 'Approve and recalculate' }));
    expect(onApprove).toHaveBeenCalledWith(true);
  });
});
