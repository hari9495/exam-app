import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceDayList, AttendanceDayTable, type DayViewRow } from './attendance-views-live';
import { PunchList, placeOfDay, punchPlace } from './time-kit';
import type { Punch } from './time-logic';

// Batch A A9 (answer 2312): office or remote on each punch (day panel) and on the month's list and table rows.

const P = (x: Partial<Punch>): Punch => ({ id: Math.random().toString(36), kind: 'in', time: '09:10', source: 'web', where: 'Chennai office', verdict: 'inside', ...x });

describe('A9 punch place', () => {
  it('the server place wins; a story punch is worked out from its checks; refused is unknown', () => {
    expect(punchPlace(P({ place: 'remote' }))).toBe('remote');
    expect(punchPlace(P({ verdict: 'network' }))).toBe('office');
    expect(punchPlace(P({ verdict: 'field' }))).toBe('remote');
    expect(punchPlace(P({ source: 'biometric', verdict: 'field' }))).toBe('office');
    expect(punchPlace(P({ refusal: 'Outside the office' }))).toBe('unknown');
  });
  it('a story day with both is office (the default rule); none known is unknown', () => {
    expect(placeOfDay([P({ verdict: 'field' }), P({ verdict: 'inside' })])).toBe('office');
    expect(placeOfDay([P({ verdict: 'field' })])).toBe('remote');
    expect(placeOfDay([P({ refusal: 'No location' })])).toBe('unknown');
  });
  it('the day panel lists Office / Remote per punch; an unknown place shows no badge', () => {
    render(<PunchList punches={[P({ place: 'office' }), P({ id: 'r', kind: 'out', verdict: 'field', place: 'remote', where: 'Home' }), P({ id: 'u', kind: 'out', place: 'unknown', verdict: 'outside', refusal: 'Outside the office' })]} />);
    expect(screen.getAllByText('Office')).toHaveLength(1);
    expect(screen.getAllByText('Remote')).toHaveLength(1);
    expect(screen.queryByText('Not known')).toBeNull();
  });
});

describe('A9 list and table rows', () => {
  const rows: DayViewRow[] = [
    { on: '2026-11-02', code: 'P', firstIn: '9:10 am', lastOut: '6:20 pm', workedMin: 540, shiftMin: 540, lateMin: null, place: 'office' },
    { on: '2026-11-03', code: 'P', firstIn: '9:05 am', lastOut: '6:00 pm', workedMin: 535, shiftMin: 540, lateMin: null, place: 'remote' },
    { on: '2026-11-04', code: 'A', firstIn: null, lastOut: null, workedMin: null, shiftMin: 540, lateMin: null, place: 'unknown' },
  ];
  it('the list shows the day place as a badge (none when unknown)', () => {
    render(<AttendanceDayList rows={rows} onOpen={vi.fn()} />);
    expect(screen.getByText('Office')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.queryByText('Not known')).toBeNull();
  });
  it('the table has a Where column; unknown is a dash', () => {
    render(<AttendanceDayTable rows={rows} onOpen={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: /Where/ })).toBeInTheDocument();
    expect(screen.getAllByText('Remote').length).toBeGreaterThan(0);
  });
});
