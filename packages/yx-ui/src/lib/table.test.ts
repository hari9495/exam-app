import { describe, expect, it } from 'vitest';
import {
  filtersFromQuery,
  filtersToQuery,
  formatHours,
  groupRows,
  matchesFilter,
  parseHours,
  sortRows,
  toCsv,
  total,
  type FilterField,
  type FilterValue,
} from './table';

const rows = [
  { n: 'Sana', ctc: 52000, d: new Date(2025, 7, 19), dept: 'Finance' },
  { n: 'arjun', ctc: 64200, d: new Date(2019, 5, 12), dept: 'Operations' },
  { n: 'Divya', ctc: null as number | null, d: new Date(2024, 2, 4), dept: '' },
  { n: 'Lakshmi', ctc: 96000, d: new Date(2017, 10, 22), dept: 'Finance' },
];

describe('sort', () => {
  it('sorts text case-insensitively and numbers numerically, empties last both ways', () => {
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['arjun', 'Divya', 'Lakshmi', 'Sana']);
    expect(sortRows(rows, (r) => r.ctc, 'asc').map((r) => r.n)).toEqual(['Sana', 'arjun', 'Lakshmi', 'Divya']);
    expect(sortRows(rows, (r) => r.ctc, 'desc').map((r) => r.n)).toEqual(['Lakshmi', 'arjun', 'Sana', 'Divya']);
    expect(sortRows(rows, (r) => r.d, 'asc')[0].n).toBe('Lakshmi');
  });
  it('sorts IDs naturally', () => {
    const ids = ['KF-10', 'KF-9', 'KF-100'].map((id) => ({ id }));
    expect(sortRows(ids, (r) => r.id, 'asc').map((r) => r.id)).toEqual(['KF-9', 'KF-10', 'KF-100']);
  });
});

describe('group and total', () => {
  it('groups in first-seen order with empties last', () => {
    const g = groupRows(rows, (r) => r.dept);
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([
      ['Finance', 2],
      ['Operations', 1],
      ['No value', 1],
    ]);
  });
  it('sums, averages and counts ignoring empties', () => {
    expect(total(rows, (r) => r.ctc, 'sum')).toBe(212200);
    expect(total(rows, (r) => r.ctc, 'avg')).toBe(70733.33);
    expect(total(rows, (r) => r.ctc, 'count')).toBe(4);
  });
});

describe('csv', () => {
  it('quotes, adds BOM and blocks formula injection', () => {
    const csv = toCsv(['Name', 'Note'], [['Menon, Prakash', '=HYPERLINK("x")'], ['Sana', 'said "hi"']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Menon, Prakash"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"said ""hi"""');
  });
});

describe('filters', () => {
  const fields: FilterField[] = [
    { key: 'dept', label: 'Department', type: 'multi', options: [{ value: 'fin', label: 'Finance' }, { value: 'ops', label: 'Operations' }] },
    { key: 'joined', label: 'Joined', type: 'date' },
    { key: 'ctc', label: 'CTC', type: 'number' },
    { key: 'name', label: 'Name', type: 'text' },
  ];
  it('matches each filter type', () => {
    expect(matchesFilter('fin', { key: 'dept', type: 'multi', values: ['fin'] })).toBe(true);
    expect(matchesFilter(['ops', 'fin'], { key: 'dept', type: 'multi', values: ['fin'] })).toBe(true);
    expect(matchesFilter('ops', { key: 'dept', type: 'multi', values: ['fin'] })).toBe(false);
    expect(matchesFilter(new Date(2024, 2, 4), { key: 'joined', type: 'date', from: '2024-01-01', to: '2024-03-04' })).toBe(true);
    expect(matchesFilter(new Date(2024, 2, 5), { key: 'joined', type: 'date', from: null, to: '2024-03-04' })).toBe(false);
    expect(matchesFilter(52000, { key: 'ctc', type: 'number', min: 50000, max: null })).toBe(true);
    expect(matchesFilter(null, { key: 'ctc', type: 'number', min: 50000, max: null })).toBe(false);
    expect(matchesFilter('Divya Raghunathan', { key: 'name', type: 'text', contains: 'ragh' })).toBe(true);
    expect(matchesFilter('anything', { key: 'dept', type: 'multi', values: [] })).toBe(true); // inactive
  });
  it('round-trips through the URL and drops unknown values', () => {
    const f: FilterValue[] = [
      { key: 'dept', type: 'multi', values: ['fin', 'ops'] },
      { key: 'joined', type: 'date', from: '2024-01-01', to: null },
      { key: 'ctc', type: 'number', min: null, max: 100000 },
      { key: 'name', type: 'text', contains: 'div' },
    ];
    const q = filtersToQuery(f, 'kaveri');
    expect(filtersFromQuery(q, fields)).toEqual({ filters: f, search: 'kaveri' });
    expect(filtersFromQuery('f.dept=fin,evil&f.joined=2024-13..x', fields).filters).toEqual([{ key: 'dept', type: 'multi', values: ['fin'] }]);
  });
});

describe('hours', () => {
  it('parses the ways people type hours', () => {
    expect(parseHours('7.5')).toBe(7.5);
    expect(parseHours('7,5')).toBe(7.5);
    expect(parseHours('7:30')).toBe(7.5);
    expect(parseHours('7h30')).toBe(7.5);
    expect(parseHours('7h 30m')).toBe(7.5);
    expect(parseHours('45m')).toBe(0.75);
    expect(parseHours('8h')).toBe(8);
    expect(parseHours('')).toBeNull();
    expect(parseHours('7:75')).toBeNaN();
    expect(parseHours('abc')).toBeNaN();
    expect(formatHours(7.5)).toBe('7.5');
    expect(formatHours(8)).toBe('8');
  });
});
