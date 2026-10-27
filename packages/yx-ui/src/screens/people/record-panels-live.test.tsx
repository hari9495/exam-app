import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PersonWorkspace, type LiveRecord } from './record';

// The person record's panels and tabs with the live app's data: Person roles (PPL-35).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const live = (o: Partial<LiveRecord>): LiveRecord => ({
  directoryHref: '/d', name: 'Arjun Kulkarni', role: 'Quality Analyst', department: 'Quality', location: 'Hosur plant', code: 'KF-0142', manager: 'Divya Raghunathan', joined: day('2021-03-12'), grade: 'G2', badges: [], facts: [], events: [],
  personal: null, identity: null, pending: [], job: [['Designation', 'Quality Analyst']], scheduled: [], pastChanges: 0, pay: { kind: 'none', grantedBy: 'HR' }, time: null, documents: null, assets: null, history: null, asOf: null, onAsOf: vi.fn(), ...o,
});

describe('Person roles panel (PPL-35), live', () => {
  const roles = [
    { role: 'Joiner', from: day('2021-02-20'), to: day('2021-03-12'), link: 'Pre-boarding · Quality Inspector' },
    { role: 'Employee', from: day('2021-03-12'), to: null, link: 'Employment KF-0142 · Kaveri Foods Pvt Ltd' },
  ];

  it('names the company and lists every role, oldest first, from the menu', async () => {
    wrap(<PersonWorkspace persona="hr" relation="other" today={day('2026-10-20')} live={live({ history: { rows: [], roles: [...roles].reverse(), company: 'Kaveri Foods' }, activity: [] })} />);
    expect(screen.queryByText(/links every role/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: /More actions|Actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'All roles of this person' }));
    expect(screen.getByText('One person record links every role in Kaveri Foods.')).toBeInTheDocument();
    const items = screen.getByRole('list', { name: 'Roles over time' }).querySelectorAll('li');
    expect([...items].map((li) => li.textContent)).toEqual(['Joiner · 20 Feb 2021 to 12 Mar 2021Pre-boarding · Quality Inspector', 'Employee · 12 Mar 2021 to nowEmployment KF-0142 · Kaveri Foods Pvt Ltd']);
    await ue.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/links every role/)).toBeNull();
  });

  it('is not offered to someone who is not HR', () => {
    wrap(<PersonWorkspace persona="mgr" relation="team" today={day('2026-10-20')} live={live({ history: { rows: [], roles, company: 'Kaveri Foods' }, activity: [] })} />);
    expect(screen.queryByRole('button', { name: /More actions|Actions/ })).toBeNull();
    expect(screen.queryByText(/links every role/)).toBeNull();
  });
});
