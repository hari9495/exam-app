import { badgeText, checkInProblem, dayBounds, localDay, maskMobile, normalCode, normalMobile, noticeVersion, passCode, passToken, visitWindow } from './visitor-rules';

// Visitors slice 1: the pure rules (positive and negative).
const IST = 'Asia/Kolkata';
const NOW = new Date('2026-11-12T05:00:00Z'); // 10:30 IST, Thursday

describe('pass codes and links', () => {
  it('a pass code is V-XXXX-XXXX without look-alike characters; a typed code is forgiven its case and spaces', () => {
    for (let i = 0; i < 50; i++) expect(passCode()).toMatch(/^V-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalCode(' v 7kq2 mx4p ')).toBe('V-7KQ2-MX4P');
    expect(normalCode('V-7KQ2-MX4P')).toBe('V-7KQ2-MX4P');
    expect(normalCode('V-7KQ2-MX40')).toBeNull(); // 0 is never in a code
    expect(normalCode('7KQ2MX4P')).toBeNull();
    expect(normalCode('')).toBeNull();
  });

  it('the link is 32 unguessable characters, different every time', () => {
    const a = passToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(passToken()).not.toBe(a);
  });
});

describe('mobile numbers', () => {
  it('Indian 10 digits (6-9) become +91; +country code numbers stay; the page shows only the last 3', () => {
    expect(normalMobile('98401 22871')).toBe('+919840122871');
    expect(normalMobile('+91 98401 22871')).toBe('+919840122871');
    expect(normalMobile('919840122871')).toBe('+919840122871');
    expect(normalMobile('+44 7400 123456')).toBe('+447400123456');
    expect(normalMobile('5840122871')).toBeNull();
    expect(normalMobile('12345')).toBeNull();
    expect(normalMobile('+12')).toBeNull();
    expect(maskMobile('+919840122871')).toBe('+91 ••••• ••871');
    expect(maskMobile('+447400123456')).toBe('•••• 456');
  });
});

describe('the visit window (location time zone)', () => {
  it('a later window today or ahead is taken in the location’s zone', () => {
    const w = visitWindow('2026-11-12', '14:00', '15:00', IST, NOW);
    expect(w).toEqual({ startsAt: new Date('2026-11-12T08:30:00Z'), endsAt: new Date('2026-11-12T09:30:00Z') });
    const ny = visitWindow('2026-11-12', '09:00', '10:00', 'America/New_York', NOW);
    expect(ny).toEqual({ startsAt: new Date('2026-11-12T14:00:00Z'), endsAt: new Date('2026-11-12T15:00:00Z') });
  });

  it('refused: leaving before arriving, already over, too far ahead, not a day', () => {
    expect(visitWindow('2026-11-12', '15:00', '14:00', IST, NOW)).toEqual({ problem: 'The visitor must leave after they arrive.' });
    expect(visitWindow('2026-11-12', '09:00', '10:00', IST, NOW)).toEqual({ problem: 'This visit would already be over. Choose a later time.' });
    expect(visitWindow('2027-11-12', '09:00', '10:00', IST, NOW)).toEqual({ problem: 'Invite a visitor up to 180 days ahead.' });
    expect(visitWindow('2026-13-40', '09:00', '10:00', IST, NOW)).toEqual({ problem: 'Enter the day and the arrival and leaving times.' });
  });

  it('a location’s day and its bounds', () => {
    expect(localDay(new Date('2026-11-12T20:00:00Z'), IST)).toBe('2026-11-13');
    expect(dayBounds('2026-11-12', IST)).toEqual({ from: new Date('2026-11-11T18:30:00Z'), to: new Date('2026-11-12T18:30:00Z') });
  });
});

describe('check-in', () => {
  const v = (over: Partial<Parameters<typeof checkInProblem>[0]> = {}) => ({ status: 'expected' as const, startsAt: new Date('2026-11-12T08:30:00Z'), endsAt: new Date('2026-11-12T09:30:00Z'), ...over });
  it('an expected visitor on their day, before the window ends (early arrival allowed)', () => {
    expect(checkInProblem(v(), IST, NOW)).toBeNull();
  });
  it('refused: cancelled, already in, used, expired, another day', () => {
    expect(checkInProblem(v({ status: 'cancelled' }), IST, NOW)).toMatch(/cancelled/);
    expect(checkInProblem(v({ status: 'on_site' }), IST, NOW)).toMatch(/already checked in/);
    expect(checkInProblem(v({ status: 'checked_out' }), IST, NOW)).toMatch(/used or has expired/);
    expect(checkInProblem(v(), IST, new Date('2026-11-12T10:00:00Z'))).toMatch(/expired/);
    expect(checkInProblem(v({ startsAt: new Date('2026-11-13T05:00:00Z'), endsAt: new Date('2026-11-13T06:00:00Z') }), IST, NOW)).toBe('This pass is for 13 Nov 2026, not today.');
  });
});

describe('notice version and badge', () => {
  it('the same notice has the same version; any change makes a new one; badge numbers are 4 digits', () => {
    expect(noticeVersion('Wear your badge.')).toBe(noticeVersion('  Wear your badge. '));
    expect(noticeVersion('Wear your badge.')).not.toBe(noticeVersion('Wear your badge!'));
    expect(badgeText(413)).toBe('V-0413');
    expect(badgeText(null)).toBeNull();
  });
});
