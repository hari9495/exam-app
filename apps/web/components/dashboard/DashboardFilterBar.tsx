'use client';

import { RotateCcw } from 'lucide-react';
import { Select, type SelectOption } from '../ui';
import { AnalyticsFilters } from '../../lib/hooks/useDashboard';
import { DashboardWindow } from '../../lib/types';

export type TimeMode = 'relative' | 'month' | 'year' | 'custom';

export interface DashboardFilterState {
  examId: string; // 'all' or an exam id
  candidateId: string; // 'all' or a candidate id
  timeMode: TimeMode;
  window: DashboardWindow; // used when timeMode === 'relative'
  year: number; // used for 'year' and 'month'
  month: number; // 0-11, used for 'month'
  from: string; // yyyy-mm-dd, used for 'custom'
  to: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export function defaultFilterState(): DashboardFilterState {
  return { examId: 'all', candidateId: 'all', timeMode: 'relative', window: '14d', year: CURRENT_YEAR, month: new Date().getMonth(), from: '', to: '' };
}

// Shared with the page's "Analysis" context chips (dashboard/page.tsx) -- that row
// only needs to exist when it's telling the recruiter something the filter bar
// above doesn't already say, i.e. when a filter has actually been narrowed.
export function isDefaultFilterState(s: DashboardFilterState): boolean {
  return s.examId === 'all' && s.candidateId === 'all' && s.timeMode === 'relative' && s.window === '14d';
}

const pad = (n: number) => String(n).padStart(2, '0');

// Turns the UI filter state into the query the analytics endpoint understands.
export function toAnalyticsFilters(s: DashboardFilterState): AnalyticsFilters {
  const base: AnalyticsFilters = {
    window: s.window,
    examId: s.examId === 'all' ? undefined : s.examId,
    candidateId: s.candidateId === 'all' ? undefined : s.candidateId,
  };
  if (s.timeMode === 'year') {
    return { ...base, from: `${s.year}-01-01`, to: `${s.year}-12-31` };
  }
  if (s.timeMode === 'month') {
    const lastDay = new Date(s.year, s.month + 1, 0).getDate();
    return { ...base, from: `${s.year}-${pad(s.month + 1)}-01`, to: `${s.year}-${pad(s.month + 1)}-${pad(lastDay)}` };
  }
  if (s.timeMode === 'custom') {
    return { ...base, from: s.from || undefined, to: s.to || undefined };
  }
  return base; // relative -> window
}

// Human summary of the active time filter, for the panels' subheading.
export function describeTimeFilter(s: DashboardFilterState): string {
  if (s.timeMode === 'year') return String(s.year);
  if (s.timeMode === 'month') return `${MONTHS[s.month]} ${s.year}`;
  if (s.timeMode === 'custom') return s.from && s.to ? `${s.from} → ${s.to}` : s.from ? `from ${s.from}` : s.to ? `until ${s.to}` : 'custom range';
  const labels: Record<DashboardWindow, string> = { '7d': 'Last 7 days', '14d': 'Last 14 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };
  return labels[s.window];
}

const WINDOW_OPTIONS: SelectOption[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];
const TIME_MODE_OPTIONS: SelectOption[] = [
  { value: 'relative', label: 'Recent' },
  { value: 'month', label: 'By month' },
  { value: 'year', label: 'By year' },
  { value: 'custom', label: 'Custom range' },
];

interface FilterBarProps {
  value: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
  exams: { id: string; title: string }[];
  candidates: { id: string; name: string }[];
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-rule px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}

export function DashboardFilterBar({ value, onChange, exams, candidates }: FilterBarProps) {
  const set = (patch: Partial<DashboardFilterState>) => onChange({ ...value, ...patch });
  const isDefault = isDefaultFilterState(value);

  const examOptions: SelectOption[] = [{ value: 'all', label: 'All exams' }, ...exams.map((e) => ({ value: e.id, label: e.title }))];
  const candidateOptions: SelectOption[] = [{ value: 'all', label: 'All candidates' }, ...candidates.map((c) => ({ value: c.id, label: c.name }))];
  const yearOptions: SelectOption[] = YEARS.map((y) => ({ value: String(y), label: String(y) }));
  const monthOptions: SelectOption[] = MONTHS.map((m, i) => ({ value: String(i), label: m }));

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-paper p-3">
      <div className="min-w-[160px] flex-1"><Select label="Exam" value={value.examId} onChange={(v) => set({ examId: v })} options={examOptions} /></div>
      <div className="min-w-[160px] flex-1"><Select label="Candidate" value={value.candidateId} onChange={(v) => set({ candidateId: v })} options={candidateOptions} /></div>
      <div className="min-w-[130px]"><Select label="Period" value={value.timeMode} onChange={(v) => set({ timeMode: v as TimeMode })} options={TIME_MODE_OPTIONS} /></div>

      {value.timeMode === 'relative' && (
        <div className="min-w-[130px]"><Select label="Range" value={value.window} onChange={(v) => set({ window: v as DashboardWindow })} options={WINDOW_OPTIONS} /></div>
      )}
      {value.timeMode === 'year' && (
        <div className="min-w-[100px]"><Select label="Year" value={String(value.year)} onChange={(v) => set({ year: Number(v) })} options={yearOptions} /></div>
      )}
      {value.timeMode === 'month' && (
        <>
          <div className="min-w-[100px]"><Select label="Month" value={String(value.month)} onChange={(v) => set({ month: Number(v) })} options={monthOptions} /></div>
          <div className="min-w-[100px]"><Select label="Year" value={String(value.year)} onChange={(v) => set({ year: Number(v) })} options={yearOptions} /></div>
        </>
      )}
      {value.timeMode === 'custom' && (
        <>
          <DateInput label="From" value={value.from} onChange={(v) => set({ from: v })} />
          <DateInput label="To" value={value.to} onChange={(v) => set({ to: v })} />
        </>
      )}

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(defaultFilterState())}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-ground hover:text-ink"
        >
          <RotateCcw size={13} /> Reset
        </button>
      )}
    </div>
  );
}
