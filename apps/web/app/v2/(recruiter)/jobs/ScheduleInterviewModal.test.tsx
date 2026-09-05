import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';

// The ui-v2 barrel's `export ... from './DataTable'` pulls in @tanstack/react-table (a pure-ESM
// package), which breaks the ts-jest CJS transform -- see Task 4's report and lib/types.ts's
// GLOBAL_STAGES comment for the same runtime-import restriction. Stub out just the DataTable
// submodule (dt/Cb are the only exports this modal actually uses) so the barrel's other real
// exports (Dialog, TextField, Combobox, Button) still render for real.
jest.mock('../../../../components/ui-v2/DataTable', () => ({
  dt: { toolBtn: {}, primaryBtn: {}, iconBtn: {}, muted: {}, bulkBar: {}, th: {}, td: {} },
  Cb: ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  ),
  DataTable: () => null,
  DT_FEATURES: {},
  SortHead: () => null,
  Pill: () => null,
}));

jest.mock('../../../../components/ui', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('../../../../lib/hooks/useInterviews', () => ({
  useCreateInterview: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendInterview: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../../../../lib/hooks/useUsers', () => ({
  useUsers: () => ({ data: { data: [] } }),
}));

jest.mock('../../../../lib/hooks/useIntegrations', () => ({
  useIntegrations: () => ({ data: { smtpConfigured: true }, isSuccess: true }),
}));

const mockUseBusinessHours = jest.fn();
jest.mock('../../../../lib/hooks/useBusinessHours', () => ({
  useBusinessHours: () => mockUseBusinessHours(),
}));

const BUSINESS_HOURS = {
  timeZone: 'Asia/Kolkata',
  days: {
    mon: { enabled: true, open: '09:00', close: '18:00' },
    tue: { enabled: true, open: '09:00', close: '18:00' },
    wed: { enabled: true, open: '09:00', close: '18:00' },
    thu: { enabled: true, open: '09:00', close: '18:00' },
    fri: { enabled: true, open: '09:00', close: '18:00' },
    sat: { enabled: false, open: '09:00', close: '18:00' },
    sun: { enabled: false, open: '09:00', close: '18:00' },
  },
};
const HOLIDAYS = [{ date: '2026-01-26', name: 'Republic Day' }];

function renderModal() {
  render(<ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={() => {}} />);
}

function setSlotStart(value: string) {
  const startInput = screen.getByLabelText('Start 1');
  fireEvent.change(startInput, { target: { value } });
}

describe('ScheduleInterviewModal off-hours/holiday warning', () => {
  beforeEach(() => {
    mockUseBusinessHours.mockReset();
  });

  it('shows "Outside business hours" for a slot set outside configured hours', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isError: false });
    renderModal();
    // Tue 2026-01-27 20:00 IST -- after the 18:00 close.
    setSlotStart('2026-01-27T20:00');
    expect(screen.getByText(/Outside business hours/i)).toBeInTheDocument();
  });

  it('shows "On a holiday: {name}" for a slot set on a configured holiday', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isError: false });
    renderModal();
    // Mon 2026-01-26 10:00 IST -- Republic Day, within hours.
    setSlotStart('2026-01-26T10:00');
    expect(screen.getByText(/On a holiday: Republic Day/i)).toBeInTheDocument();
  });

  it('shows no hint for an in-hours weekday slot', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isError: false });
    renderModal();
    // Tue 2026-01-27 10:00 IST -- within hours, not a holiday.
    setSlotStart('2026-01-27T10:00');
    expect(screen.queryByText(/Outside business hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On a holiday/i)).not.toBeInTheDocument();
  });

  it('shows no hint when business hours are unset (null config)', () => {
    mockUseBusinessHours.mockReturnValue({ data: { businessHours: null, holidays: [] }, isError: false });
    renderModal();
    setSlotStart('2026-01-27T20:00');
    expect(screen.queryByText(/Outside business hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On a holiday/i)).not.toBeInTheDocument();
  });

  it('shows no hint when useBusinessHours errors', () => {
    mockUseBusinessHours.mockReturnValue({ data: undefined, isError: true });
    renderModal();
    setSlotStart('2026-01-27T20:00');
    expect(screen.queryByText(/Outside business hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/On a holiday/i)).not.toBeInTheDocument();
  });
});
