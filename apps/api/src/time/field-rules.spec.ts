import { MAX_DUTY_HOURS, dutyWindows, onDutyAt, pingFlags, retentionCutoff, speedKmh, trailKm, visitVerdict } from './field-rules';

const t = (hhmm: string, day = '2026-10-29') => new Date(`${day}T${hhmm}:00+05:30`);
const at = (lat: number, lng: number, time: string, accuracyM = 10) => ({ lat, lng, accuracyM, at: t(time) });

describe('on duty (TIM-32 rule 15)', () => {
  it('only between an accepted check-in and the check-out after it', () => {
    const w = dutyWindows([{ kind: 'in', at: t('09:00') }, { kind: 'break_start', at: t('13:00') }, { kind: 'break_end', at: t('13:30') }, { kind: 'out', at: t('18:00') }], t('20:00'));
    expect(w).toHaveLength(1);
    expect(onDutyAt(w, t('08:59'))).toBe(false);
    expect(onDutyAt(w, t('09:00'))).toBe(true);
    expect(onDutyAt(w, t('13:15'))).toBe(true); // a break is still duty
    expect(onDutyAt(w, t('18:00'))).toBe(true);
    expect(onDutyAt(w, t('18:01'))).toBe(false);
  });

  it('not checked in: no window; still checked in: open until now', () => {
    expect(dutyWindows([], t('10:00'))).toEqual([]);
    const w = dutyWindows([{ kind: 'in', at: t('09:00') }], t('10:00'));
    expect(onDutyAt(w, t('09:59'))).toBe(true);
    expect(onDutyAt(w, t('10:01'))).toBe(false);
  });

  it(`a forgotten check-out stops counting after ${MAX_DUTY_HOURS} hours`, () => {
    const w = dutyWindows([{ kind: 'in', at: t('09:00') }], t('12:00', '2026-10-30'));
    expect(onDutyAt(w, t('02:59', '2026-10-30'))).toBe(true);
    expect(onDutyAt(w, t('03:01', '2026-10-30'))).toBe(false);
  });

  it('two duty spells in a day; an "out" with no "in" opens nothing', () => {
    const w = dutyWindows([{ kind: 'out', at: t('08:00') }, { kind: 'in', at: t('09:00') }, { kind: 'out', at: t('12:00') }, { kind: 'in', at: t('14:00') }, { kind: 'out', at: t('17:00') }], t('20:00'));
    expect(w).toHaveLength(2);
    expect(onDutyAt(w, t('13:00'))).toBe(false);
    expect(onDutyAt(w, t('15:00'))).toBe(true);
  });
});

describe('integrity flags', () => {
  it('speed above 200 km/h beyond the accuracy circles is flagged; within the circles it is not', () => {
    // ~11.1 km in 5 minutes = 133 km/h: allowed. ~22 km in 5 minutes: flagged.
    expect(speedKmh(at(13, 80, '09:00'), at(13.1, 80, '09:05'))).toBeLessThan(200);
    expect(pingFlags(at(13.2, 80, '09:05'), at(13, 80, '09:00'), 100, false)).toEqual(['speed']);
    // A 50 m jump with 40 m accuracy each, a second apart: jitter, not speed.
    expect(speedKmh(at(13, 80, '09:00', 40), { ...at(13.00045, 80, '09:00', 40), at: new Date(t('09:00').getTime() + 1000) })).toBe(0);
  });

  it('poor accuracy is flagged (kept, left out of the speed check); mock and skew too', () => {
    expect(pingFlags(at(14, 80, '09:05', 101), at(13, 80, '09:00'), 100, false)).toEqual(['accuracy']);
    expect(pingFlags(at(13, 80, '09:05', 100), null, 100, false)).toEqual([]);
    expect(pingFlags({ ...at(13, 80, '09:05'), mock: true }, null, 100, true)).toEqual(['mock', 'skew']);
  });
});

describe('visits and distance', () => {
  it('inside the radius up to the edge, outside one metre past it', () => {
    const site = { lat: 13, lng: 80, radiusM: 200 };
    expect(visitVerdict({ lat: 13, lng: 80 }, site)).toEqual({ distanceM: 0, inside: true });
    const edge = visitVerdict({ lat: 13 + 200 / 111_195, lng: 80 }, site);
    expect(edge).toEqual({ distanceM: 200, inside: true });
    expect(visitVerdict({ lat: 13 + 201 / 111_195, lng: 80 }, site).inside).toBe(false);
    expect(visitVerdict({ lat: 13, lng: 80 }, null)).toEqual({ distanceM: null, inside: null });
  });

  it('trail distance in km', () => {
    expect(trailKm([])).toBe(0);
    expect(trailKm([{ lat: 13, lng: 80 }, { lat: 13.01, lng: 80 }, { lat: 13.02, lng: 80 }])).toBe(2.2);
  });
});

describe('retention cut-off', () => {
  it('30 days kept before today; across a leap day', () => {
    expect(retentionCutoff('2026-10-29', 30)).toBe('2026-09-29');
    expect(retentionCutoff('2028-03-01', 1)).toBe('2028-02-29');
    expect(retentionCutoff('2026-10-29', 0)).toBe('2026-10-29');
  });
});
