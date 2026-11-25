import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FieldForceScreen } from './field';
import { projector, type FieldMap, type FieldMapPerson, type FieldPersonDay, type LiveFieldForce } from './field-force-live';

// TIM-32 field-force map on the live app's data: every state the stories show (map, person trail, integrity flag,
// tracking off, not checked in, consent withdrawn) plus loading, error and no access.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const T = '2026-10-29';
const base: FieldMapPerson = { id: 'v', name: 'Vikram Rao', code: 'KF-0007', beat: 'Chennai', reportsTo: 'Anita Shah', today: T, shiftStart: '09:00', inAt: '08:55', onDuty: true, tracking: true, consent: 'given', withdrawnAt: null, km: 4.2, last: { lat: 13.0012, lng: 80.2565, at: `${T}T05:00:00Z`, accuracyM: 12 }, flag: null, reviewed: null };
const MAP: FieldMap = {
  today: T,
  scope: 'team',
  trackingOff: false,
  retentionDays: 30,
  fences: [{ id: 'l1', name: 'Chennai office', lat: 13.0, lng: 80.25, radiusM: 200 }],
  people: [
    base,
    { ...base, id: 's', name: 'Suganya Ramesh', flag: { at: `${T}T03:50:00Z`, kinds: ['mock'], count: 1 } },
    { ...base, id: 'b', name: 'Bharath Reddy', inAt: null, onDuty: false, km: null, last: null },
    { ...base, id: 'p', name: 'Pooja Iyengar', consent: 'withdrawn', withdrawnAt: `${T}T03:35:00Z`, km: null, last: null },
    { ...base, id: 'n', name: 'Nisha Menon', tracking: false, km: null, last: null },
  ],
  visits: [
    { id: 'x1', employeeId: 'v', on: T, place: 'Anand Stores, Adyar', site: { lat: 13.0012, lng: 80.2565, radiusM: 100 }, plannedMinute: 555, planned: true, status: 'done', checkInAt: `${T}T03:46:00Z`, checkOutAt: `${T}T03:57:00Z`, point: { lat: 13.0013, lng: 80.2565 }, inside: true, distanceM: 22, outcome: 'Order taken', note: null, flags: [] },
    { id: 'x2', employeeId: 's', on: T, place: 'Vel Murugan Stores, Koyambedu', site: null, plannedMinute: 550, planned: true, status: 'done', checkInAt: `${T}T03:40:00Z`, checkOutAt: `${T}T03:55:00Z`, point: { lat: 13.07, lng: 80.19 }, inside: null, distanceM: null, outcome: null, note: null, flags: ['mock'] },
  ],
};
const DAY: FieldPersonDay = { person: base, visits: MAP.visits.slice(0, 1), fences: MAP.fences, trail: [{ lat: 13.0, lng: 80.25, at: `${T}T03:30:00Z`, accuracyM: 10, flags: [], }, { lat: 13.0012, lng: 80.2565, at: `${T}T03:45:00Z`, accuracyM: 10, flags: [] }] };
const live = (over: Partial<LiveFieldForce> = {}): LiveFieldForce => ({ state: 'ready', data: MAP, openId: null, onOpen: vi.fn(), person: { state: 'loading', data: null }, onReview: vi.fn(async () => ({})), settingsHref: '/yx/settings/company-rules', ...over });

describe('TIM-32 field force, live', () => {
  it('the team list shows each state; only tracked people get a map pin', async () => {
    const onOpen = vi.fn();
    render(<FieldForceScreen live={live({ onOpen })} />);
    expect(screen.getByText(/Your team · duty time only · trails kept 30 days/)).toBeInTheDocument();
    const team = screen.getByRole('heading', { name: 'Team' }).closest('section, div')!.parentElement!;
    expect(within(team).getByText('Flag: mock location')).toBeInTheDocument();
    expect(within(team).getByText('Not checked in')).toBeInTheDocument();
    expect(within(team).getByText('No trail')).toBeInTheDocument();
    expect(within(team).getByText(/Tracking off/)).toBeInTheDocument();
    // Vikram and Suganya have a position; the others never get one.
    expect(screen.getByText(/V = Vikram, S = Suganya$/)).toBeInTheDocument();
    await ue.click(within(team).getAllByRole('button', { name: 'Open' })[0]);
    expect(onOpen).toHaveBeenCalledWith('v');
  });

  it("a person's trail and visits; loading first", () => {
    const { rerender } = render(<FieldForceScreen live={live({ openId: 'v' })} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Trail during duty only')).toBeNull();
    rerender(<FieldForceScreen live={live({ openId: 'v', person: { state: 'ready', data: DAY } })} />);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('Trail during duty only')).toBeInTheDocument();
    expect(within(d).getByText('4.2 km')).toBeInTheDocument();
    expect(within(d).getByText(/Inside site · 22 m · Order taken/)).toBeInTheDocument();
  });

  it('an integrity flag is reviewed through the API; the reviewed state follows the data', async () => {
    const onReview = vi.fn(async () => ({}));
    const { rerender } = render(<FieldForceScreen live={live({ openId: 's', onReview })} />);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/Mock location detected 9:20 am/)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /for a note/ })).toBeNull();
    expect(within(d).getByText('Flagged')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Mark reviewed' }));
    expect(onReview).toHaveBeenCalledWith('s');
    const after = { ...MAP, people: MAP.people.map((p) => (p.id === 's' ? { ...p, flag: null, reviewed: { at: `${T}T06:00:00Z`, by: 'Anita Shah' } } : p)) };
    rerender(<FieldForceScreen live={live({ openId: 's', onReview, data: after })} />);
    expect(screen.getByText('Marked reviewed by Anita Shah.')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByText('Flagged')).toBeNull();
  });

  it('not checked in, consent withdrawn and tracking off show no location', () => {
    const { rerender } = render(<FieldForceScreen live={live({ openId: 'b' })} />);
    expect(screen.getByText(/Shift started 9:00 am\. Nothing is recorded until Bharath checks in\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Message/ })).toBeNull();
    rerender(<FieldForceScreen live={live({ openId: 'p' })} />);
    expect(screen.getByText('No trail: consent withdrawn at 9:05 am')).toBeInTheDocument();
    rerender(<FieldForceScreen live={live({ openId: 'n' })} />);
    expect(screen.getByText('Tracking off today: turned off for this group')).toBeInTheDocument();
    expect(screen.queryByText('Trail during duty only')).toBeNull();
  });

  it('tracking off for the whole group: HR gets the settings link, a manager the advice', () => {
    const off = { ...MAP, trackingOff: true, people: [], visits: [] };
    const { rerender } = render(<FieldForceScreen live={live({ data: { ...off, scope: 'granted' } })} />);
    expect(screen.getByText('Field tracking is off for this group')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/yx/settings/company-rules');
    rerender(<FieldForceScreen live={live({ data: off })} />);
    expect(screen.getByText('Field tracking is off for your group')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask HR' })).toBeNull();
  });

  it('loading, error (with retry) and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<FieldForceScreen live={live({ state: 'loading', data: null })} />);
    expect(screen.queryByText('Live map')).toBeNull();
    rerender(<FieldForceScreen live={live({ state: 'error', data: null, onRetry })} />);
    expect(screen.getByText("The field force map didn't load")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<FieldForceScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.queryByText('Live map')).toBeNull();
  });

  it('the projection keeps points inside the drawing, north up', () => {
    const pr = projector([{ lat: 13.0, lng: 80.2 }, { lat: 13.1, lng: 80.3 }]);
    const a = pr.at({ lat: 13.0, lng: 80.2 });
    const b = pr.at({ lat: 13.1, lng: 80.3 });
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(320);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    }
    expect(b.y).toBeLessThan(a.y);
    expect(b.x).toBeGreaterThan(a.x);
  });
});
