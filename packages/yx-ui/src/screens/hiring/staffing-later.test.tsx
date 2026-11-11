import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PlacementHours, type LiveHours } from './hiring-staffing';

// Answer 497: weeks from an own-payroll worker's approved Time timesheet show where they came from. Positive and negative.
const live = (rows: LiveHours['rows']): LiveHours => ({ canEnter: true, today: new Date(2026, 9, 31), contacts: [], rows, onSave: async () => {}, onApprove: async () => {} });

describe('PlacementHours source (answer 497)', () => {
  it('a Time week says so; changed by the account manager it shows the timesheet’s hours', () => {
    render(
      <ToastProvider>
        <PlacementHours
          live={live([
            { id: 'h2', weekStart: '2026-09-21', hours: '38', overtime: '0', status: 'waiting', note: null, invoiced: false, version: 2, source: 'time', timeHours: '40' },
            { id: 'h3', weekStart: '2026-09-28', hours: '40.5', overtime: '0', status: 'waiting', note: null, invoiced: false, version: 1, source: 'time', timeHours: '40.5' },
          ])}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByText('From the Time timesheet')).toHaveLength(2);
    const changed = screen.getByText(/Week of 21 Sept? 2026/).closest('li')!;
    expect(within(changed).getByText(/the timesheet had 40 h/)).toBeInTheDocument();
    const same = screen.getByText(/Week of 28 Sept? 2026/).closest('li')!;
    expect(within(same).queryByText(/the timesheet had/)).not.toBeInTheDocument();
  });

  it('negative: a week the account manager entered has no Time label', () => {
    render(
      <ToastProvider>
        <PlacementHours live={live([{ id: 'h1', weekStart: '2026-09-14', hours: '40', overtime: '0', status: 'approved', note: null, invoiced: true, version: 2, source: 'manual', timeHours: null }])} />
      </ToastProvider>,
    );
    expect(screen.queryByText('From the Time timesheet')).not.toBeInTheDocument();
  });
});
