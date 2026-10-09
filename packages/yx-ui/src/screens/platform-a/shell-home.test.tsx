import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AccessStateBody, RoleHomeScreen, SearchResultsScreen, explainedHits, paletteFor, searchableFor, type SearchHit } from './shell-home';

describe('Role home loading (founder review 30 Sep 2026)', () => {
  it('keeps the clock usable while every other widget loads, and announces once', () => {
    render(<RoleHomeScreen persona="manager" data={{ actions: [] }} loading />);
    expect(screen.getByRole('button', { name: /clock out/i })).toBeEnabled();
    const home = screen.getByRole('region', { name: 'Your home' });
    expect(home).toHaveAttribute('aria-busy', 'true');
    expect(within(home).getAllByRole('status').filter((s) => s.textContent === 'Loading your home')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Team today' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows slow and failed widgets with Retry while the rest of the page works', () => {
    render(<RoleHomeScreen persona="manager" data={{ actions: [] }} widgetStates={{ today: 'slow', goals: 'error' }} />);
    expect(screen.getByText('Taking longer than usual.')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load goals and 1:1s.")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
    expect(screen.getByText("Who's off this week")).toBeInTheDocument();
  });

  it('keeps the clock pinned: no remove option in edit mode', () => {
    render(<RoleHomeScreen persona="hr" data={{ actions: [] }} editing customisable />);
    expect(screen.queryByRole('button', { name: 'Options for Attendance today' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Options for Due dates' })).toBeInTheDocument();
    expect(screen.getByText('Always shown')).toBeInTheDocument();
    expect(screen.getByText(/Needs your action and Attendance today always stay first/)).toBeInTheDocument();
  });
});

describe('Command palette by role (founder review 30 Sep 2026)', () => {
  const labels = (p: Parameters<typeof paletteFor>[0]) => paletteFor(p).flatMap((g) => g.items.map((i) => i.label));
  it('never suggests payroll or candidates to a manager', () => {
    expect(labels('manager')).not.toContain('September payroll run');
    expect(labels('manager')).not.toContain('Ananya Kulkarni');
    expect(labels('hr')).toContain('September payroll run');
  });
});

describe('Search results by role (founder review 30 Sep 2026)', () => {
  const hit = (id: string, source: SearchHit['source'], title: string): SearchHit => ({ id, source, title, subtitle: 'x', entity: 'Kaveri Foods Pvt Ltd', updated: new Date(2026, 8, 1) });
  const hits = [hit('a', 'People', 'Arjun Mehta'), hit('b', 'Documents', 'Appointment letter · Arjun Mehta'), hit('c', 'Tickets', 'TKT-5519 · Arjun'), hit('d', 'Candidates', 'Arjun Menon')];
  it('never shows a manager personal documents, tickets or candidates', () => {
    expect(searchableFor('manager', hits).map((h) => h.id)).toEqual(['a']);
    expect(searchableFor('hr', hits)).toHaveLength(4);
  });
  it('bolds the match and explains an unknown employee code', () => {
    render(<SearchResultsScreen query="arjun" hits={hits} persona="manager" />);
    expect(screen.getByText('Arjun', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Company/ })).not.toBeInTheDocument();
  });
  it('says when an employee code has no match', () => {
    render(<SearchResultsScreen query="kf-9999" hits={[]} />);
    expect(screen.getByText('No employee with code KF-9999.')).toBeInTheDocument();
  });
});

describe('Search only shows results it can explain', () => {
  it('drops a result whose visible text does not contain the search', () => {
    const base = { entity: 'Kaveri Foods Pvt Ltd', updated: new Date(2026, 3, 1) };
    const hits: SearchHit[] = [
      { id: 'p1', source: 'Policies', title: 'Leave policy 2026', subtitle: 'Policies · v3', snippet: 'casual leave can be combined with', ...base },
      { id: 'p2', source: 'Policies', title: 'Travel policy 2026', subtitle: 'Policies · v2', snippet: 'approved by the plant head (for example Arjun Mehta)', ...base },
    ];
    expect(explainedHits(hits, 'arjun').map((h) => h.id)).toEqual(['p2']);
  });
});

describe('Access states (founder review 30 Sep 2026)', () => {
  it("shows Not found for someone else's payslip, never Request access", () => {
    render(<AccessStateBody kind="denied" recordType="payslip" />);
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
  });
  it('names the person who decides and shows a request already waiting', () => {
    render(<AccessStateBody kind="requested" />);
    expect(screen.getByText('Lakshmi Venkatesan')).toBeInTheDocument();
    expect(screen.getByText(/You asked on 28 Sep · waiting for Lakshmi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
  });
  it('gives a non-admin no enable button on a disabled add-on', () => {
    render(<AccessStateBody kind="not-enabled" />);
    expect(screen.queryByRole('button', { name: /Enable/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeInTheDocument();
  });
});
