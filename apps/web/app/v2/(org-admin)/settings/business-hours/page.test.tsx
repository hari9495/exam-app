import { render, screen, fireEvent } from '@testing-library/react';
import type { BusinessHours, Holiday } from '../../../../../lib/types';
import { useBusinessHours, useUpdateBusinessHours } from '../../../../../lib/hooks/useBusinessHours';
import V2BusinessHoursSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useBusinessHours', () => ({
  useBusinessHours: jest.fn(),
  useUpdateBusinessHours: jest.fn(),
}));

const BUSINESS_HOURS: BusinessHours = {
  timeZone: 'Asia/Kolkata',
  days: {
    mon: { enabled: true, open: '09:00', close: '17:00' },
    tue: { enabled: true, open: '09:00', close: '17:00' },
    wed: { enabled: true, open: '09:00', close: '17:00' },
    thu: { enabled: true, open: '09:00', close: '17:00' },
    fri: { enabled: true, open: '09:00', close: '17:00' },
    sat: { enabled: false, open: '09:00', close: '17:00' },
    sun: { enabled: false, open: '09:00', close: '17:00' },
  },
};

const HOLIDAYS: Holiday[] = [{ date: '2026-01-26', name: 'Republic Day' }];

describe('V2BusinessHoursSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpdateBusinessHours as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('renders 7 weekday rows + timezone select + holiday rows from fetched config', () => {
    (useBusinessHours as jest.Mock).mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isLoading: false });

    render(<V2BusinessHoursSettingsPage />);

    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Kolkata');
    for (const label of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByLabelText(`${label} enabled`)).toBeInTheDocument();
      expect(screen.getByLabelText(`${label} open time`)).toBeInTheDocument();
      expect(screen.getByLabelText(`${label} close time`)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Saturday enabled')).not.toBeChecked();
    expect(screen.getByLabelText('Holiday 1 date')).toHaveValue('2026-01-26');
    expect(screen.getByLabelText('Holiday 1 name')).toHaveValue('Republic Day');
  });

  it('seeds a sensible default (mon-fri 09:00-17:00, sat/sun off) when unset', () => {
    (useBusinessHours as jest.Mock).mockReturnValue({ data: { businessHours: null, holidays: [] }, isLoading: false });

    render(<V2BusinessHoursSettingsPage />);

    expect(screen.getByLabelText('Monday enabled')).toBeChecked();
    expect(screen.getByLabelText('Monday open time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Monday close time')).toHaveValue('17:00');
    expect(screen.getByLabelText('Saturday enabled')).not.toBeChecked();
    expect(screen.getByLabelText('Sunday enabled')).not.toBeChecked();
  });

  it('Save calls the mutation with a full 7-day businessHours + holidays', () => {
    (useBusinessHours as jest.Mock).mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isLoading: false });

    render(<V2BusinessHoursSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload.holidays).toEqual(HOLIDAYS);
    expect(Object.keys(payload.businessHours.days).sort()).toEqual(['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']);
    expect(payload.businessHours.timeZone).toBe('Asia/Kolkata');
  });

  it('editing a weekday toggle and Save includes the change in the payload', () => {
    (useBusinessHours as jest.Mock).mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isLoading: false });

    render(<V2BusinessHoursSettingsPage />);
    fireEvent.click(screen.getByLabelText('Saturday enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const payload = mutate.mock.calls[0][0];
    expect(payload.businessHours.days.sat.enabled).toBe(true);
  });

  it('adding a holiday row and Save includes it in the payload', () => {
    (useBusinessHours as jest.Mock).mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: [] }, isLoading: false });

    render(<V2BusinessHoursSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }));
    fireEvent.change(screen.getByLabelText('Holiday 1 date'), { target: { value: '2026-08-15' } });
    fireEvent.change(screen.getByLabelText('Holiday 1 name'), { target: { value: 'Independence Day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const payload = mutate.mock.calls[0][0];
    expect(payload.holidays).toEqual([{ date: '2026-08-15', name: 'Independence Day' }]);
  });

  it('removing a holiday row and Save excludes it from the payload', () => {
    (useBusinessHours as jest.Mock).mockReturnValue({ data: { businessHours: BUSINESS_HOURS, holidays: HOLIDAYS }, isLoading: false });

    render(<V2BusinessHoursSettingsPage />);
    fireEvent.click(screen.getByLabelText('Remove holiday 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const payload = mutate.mock.calls[0][0];
    expect(payload.holidays).toEqual([]);
  });
});
