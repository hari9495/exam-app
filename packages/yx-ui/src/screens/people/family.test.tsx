import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ageOn, familyProblem, FamilyCards, FamilyDrawer, schemeRows, type FamilyMember, type Nomination } from './family';

// PPL-03 family and nominees (founder 22 Oct 2026): nominees are family members and each scheme totals 100%.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const members: FamilyMember[] = [
  { name: 'Shalini Kulkarni', relation: 'Spouse', dateOfBirth: day('1994-11-02'), dependant: true },
  { name: 'Suman Kulkarni', relation: 'Mother', dateOfBirth: null, dependant: false },
];
const nom = (scheme: string, member: number | null, share: number): Nomination => ({ scheme, member, name: member === null ? 'Old nominee' : members[member].name, share });

describe('family rules', () => {
  it('each scheme totals exactly 100%, in hundredths', () => {
    expect(familyProblem(members, [nom('gratuity', 0, 60), nom('gratuity', 1, 40), nom('pf', 0, 100)])).toBeNull();
    expect(familyProblem(members, [nom('gratuity', 0, 60), nom('gratuity', 1, 30)])).toBe('Gratuity shares must total 100% (now 90%).');
    expect(familyProblem(members, [nom('pf', 0, 33.33), nom('pf', 1, 66.67)])).toBeNull();
  });

  it('a nominee is one of the family, once per scheme', () => {
    expect(familyProblem(members, [nom('pf', null, 100)])).toBe('Choose a family member as each nominee.');
    expect(familyProblem(members, [{ scheme: 'pf', member: 5, name: 'x', share: 100 }])).toBe('Choose a family member as each nominee.');
    expect(familyProblem(members, [nom('pf', 0, 50), nom('pf', 0, 50)])).toMatch(/nominated twice for PF/);
    expect(familyProblem([{ ...members[0], name: ' ' }], [])).toMatch(/name and a relation/);
  });

  it('expected schemes without a nominee are missing; "all" covers every scheme', () => {
    expect(schemeRows([nom('gratuity', 0, 100)], ['pf', 'eps', 'gratuity']).missing).toEqual(['pf', 'eps']);
    expect(schemeRows([nom('all', null, 100)], ['pf', 'gratuity']).missing).toEqual([]);
  });

  it('age in whole years', () => {
    expect(ageOn(day('1994-11-02'), day('2026-11-01'))).toBe(31);
    expect(ageOn(day('1994-11-02'), day('2026-11-02'))).toBe(32);
  });
});

describe('FamilyCards', () => {
  it('family with relation, age and a Dependant tag; nominations per scheme; first contact with a tel: link; the footnote', () => {
    render(
      <FamilyCards
        today={day('2026-10-22')}
        family={{ members, nominations: [nom('gratuity', 0, 60), nom('gratuity', 1, 40)], expected: ['eps', 'gratuity'], contacts: [{ name: 'Shalini Kulkarni', relation: 'Spouse', phone: '+919845022872' }, { name: 'Vinod Kulkarni', relation: 'Brother', phone: '+919900144120' }], note: 'Marital status changed on 2 Feb 2020. Nominations were reviewed after that change.' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Family (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nominations' })).toBeInTheDocument();
    expect(screen.getByText('31 yrs')).toBeInTheDocument();
    expect(screen.getAllByText('Dependant')).toHaveLength(1);
    const noms = within(screen.getByRole('region', { name: 'Nominations' }));
    // Each nominee on its own line with their share (founder, 22 Oct 2026).
    const gratuity = within(noms.getByText('Gratuity').closest('li')!);
    expect(gratuity.getByText('60%')).toBeInTheDocument();
    expect(gratuity.getByText('40%')).toBeInTheDocument();
    expect(gratuity.getAllByRole('listitem')).toHaveLength(2);
    expect(noms.getByText('100%')).toBeInTheDocument();
    expect(noms.getByText(/no nominee yet/)).toBeInTheDocument();
    const call = screen.getAllByRole('link');
    expect(call[0]).toHaveAttribute('href', 'tel:+919845022872');
    expect(screen.getAllByText('First contact')).toHaveLength(1);
    expect(screen.getByText(/Nominations were reviewed after that change/)).toBeInTheDocument();
  });
});

describe('FamilyDrawer', () => {
  it('saves only when every scheme totals 100%', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<FamilyDrawer name="Arjun Kulkarni" initial={{ members, nominations: [nom('gratuity', 0, 60)] }} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByText('Gratuity shares must total 100% (now 60%).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Add nomination' }));
    expect(screen.queryByText(/shares must total/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nominations: [expect.objectContaining({ scheme: 'gratuity', member: 0, share: 60 }), expect.objectContaining({ scheme: 'gratuity', member: 1, share: 40 })] }));
  });
});
