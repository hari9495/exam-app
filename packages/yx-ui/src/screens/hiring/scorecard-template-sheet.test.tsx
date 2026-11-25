import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ScorecardTemplateSheet, asPerCent, type ScorecardTemplateSheetProps } from './scorecard-template-sheet';
import type { ScorecardTemplateView } from './live/types';

// Settings 6.1 › Scorecard templates (founder answer 345): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const PLANT: ScorecardTemplateView = {
  id: 'sc1',
  name: 'Plant technician',
  scaleMax: 4,
  passBar: 2.5,
  inUse: false,
  items: [
    { id: 'i1', label: 'Machine safety', guidance: null, weight: 60, competencyId: null },
    { id: 'i2', label: 'Teamwork', guidance: 'Helps the shift', weight: 40, competencyId: null },
  ],
};
const show = (p: Partial<ScorecardTemplateSheetProps> = {}) => {
  const props: ScorecardTemplateSheetProps = { open: true, onOpenChange: vi.fn(), template: PLANT, competencies: [{ value: 'c1', label: 'Problem solving' }], canEdit: true, onSave: vi.fn().mockResolvedValue({}), onArchive: vi.fn().mockResolvedValue({}), ...p };
  render(<ToastProvider><ScorecardTemplateSheet {...props} /></ToastProvider>);
  return props;
};
const save = () => ue.click(screen.getByRole('button', { name: /^Save (scorecard|as a copy)$/ }));

describe('asPerCent', () => {
  it('keeps per cent weights; turns older weights into whole per cent adding to 100', () => {
    expect(asPerCent([60, 40])).toEqual([60, 40]);
    expect(asPerCent([2, 1])).toEqual([67, 33]);
    expect(asPerCent([1, 1, 1])).toEqual([34, 33, 33]);
    expect(asPerCent([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(asPerCent([])).toEqual([]);
  });
});

describe('ScorecardTemplateSheet', () => {
  it('edits a template: saves its id, skills, per cent weights and pass bar, then a toast', async () => {
    const p = show();
    await ue.clear(screen.getByLabelText(/^Pass bar/));
    await ue.type(screen.getByLabelText(/^Pass bar/), '3');
    await save();
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith('sc1', { name: 'Plant technician', scaleMax: 4, passBar: 3, items: [{ label: 'Machine safety', guidance: null, weight: 60, competencyId: null }, { label: 'Teamwork', guidance: 'Helps the shift', weight: 40, competencyId: null }] }));
    expect((await screen.findAllByText('Scorecard saved')).length).toBeGreaterThan(0);
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('weights that do not add up to 100 save nothing and say the total (the button is never greyed out)', async () => {
    const p = show();
    const w = screen.getByLabelText(/^Weight 2/);
    await ue.clear(w);
    await ue.type(w, '30');
    expect(screen.getByText('Weights add up to 90 %, need 100 %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save scorecard' })).toBeEnabled();
    await save();
    expect(screen.getByText('The weights must add up to 100 per cent (now 90).')).toBeInTheDocument();
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('pressed too early: field errors and focus; a pass bar above the scale is refused', async () => {
    const p = show({ template: null });
    await save();
    expect(screen.getByText('Enter the name.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveFocus());
    await ue.type(screen.getByLabelText(/^Name/), 'Sales');
    await ue.clear(screen.getByLabelText(/^Pass bar/));
    await ue.type(screen.getByLabelText(/^Pass bar/), '5');
    await save();
    expect(screen.getByText('Enter 1 to 4.')).toBeInTheDocument();
    await ue.clear(screen.getByLabelText(/^Pass bar/));
    await ue.type(screen.getByLabelText(/^Pass bar/), '2');
    await save();
    expect(screen.getByText('Enter what the panel rates.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Skill 1/), 'Negotiation');
    await save();
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Sales', passBar: 2, items: [expect.objectContaining({ label: 'Negotiation', weight: 100 })] })));
  });

  it('a used template is saved as a new copy, never changed', async () => {
    const p = show({ template: { ...PLANT, inUse: true } });
    expect(screen.getByText(/saved as a new copy/)).toBeInTheDocument();
    await save();
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Plant technician (copy)' })));
  });

  it('adds a skill and a competency from the library; choosing none first shows an error', async () => {
    show();
    await ue.click(screen.getByRole('button', { name: 'Add a skill' }));
    expect(screen.getByLabelText(/^Skill 3/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add competency' }));
    expect(screen.getByText('Choose a competency.')).toBeInTheDocument();
  });

  it('a refusal from the API stays in the sheet', async () => {
    show({ onSave: vi.fn().mockRejectedValue(new Error('This scorecard has been used, so it cannot change.')) });
    await save();
    expect(await screen.findByText('This scorecard has been used, so it cannot change.')).toBeInTheDocument();
  });

  it('archives after a confirmation, then a toast', async () => {
    const p = show();
    await ue.click(screen.getByRole('button', { name: 'Archive scorecard' }));
    await ue.click(screen.getAllByRole('button', { name: 'Archive scorecard' }).at(-1)!);
    await waitFor(() => expect(p.onArchive).toHaveBeenCalledWith('sc1'));
    expect((await screen.findAllByText('Scorecard archived')).length).toBeGreaterThan(0);
  });

  it('without the key: read-only, no save or archive', () => {
    show({ canEdit: false });
    expect(screen.getByText('60 %')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save|Archive/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });
});
