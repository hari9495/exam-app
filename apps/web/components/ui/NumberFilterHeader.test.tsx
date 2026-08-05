import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NumberFilterHeader,
  matchesNumberFilter,
  describeNumberFilter,
  NO_NUMBER_FILTER,
  type NumberFilterValue,
} from './NumberFilterHeader';

describe('matchesNumberFilter', () => {
  it('matches everything when no operator is set', () => {
    expect(matchesNumberFilter(5, NO_NUMBER_FILTER, 0)).toBe(true);
    expect(matchesNumberFilter(null, NO_NUMBER_FILTER, 0)).toBe(true);
  });

  it('never matches a null value once an operator is set', () => {
    expect(matchesNumberFilter(null, { operator: 'gt', value: 10 }, 0)).toBe(false);
  });

  it.each([
    ['equals', { operator: 'equals', value: 50 } as NumberFilterValue, 50, true],
    ['equals', { operator: 'equals', value: 50 } as NumberFilterValue, 51, false],
    ['not_equals', { operator: 'not_equals', value: 50 } as NumberFilterValue, 51, true],
    ['gt', { operator: 'gt', value: 50 } as NumberFilterValue, 51, true],
    ['gt', { operator: 'gt', value: 50 } as NumberFilterValue, 50, false],
    ['gte', { operator: 'gte', value: 50 } as NumberFilterValue, 50, true],
    ['lt', { operator: 'lt', value: 50 } as NumberFilterValue, 49, true],
    ['lte', { operator: 'lte', value: 50 } as NumberFilterValue, 50, true],
  ])('%s', (_label, filter, value, expected) => {
    expect(matchesNumberFilter(value, filter, 0)).toBe(expected);
  });

  it('between is inclusive on both ends', () => {
    const filter: NumberFilterValue = { operator: 'between', value: 30, value2: 60 };
    expect(matchesNumberFilter(30, filter, 0)).toBe(true);
    expect(matchesNumberFilter(60, filter, 0)).toBe(true);
    expect(matchesNumberFilter(29, filter, 0)).toBe(false);
    expect(matchesNumberFilter(61, filter, 0)).toBe(false);
  });

  it('above/below average compare against the supplied average, not a fixed threshold', () => {
    expect(matchesNumberFilter(51, { operator: 'above_average' }, 50)).toBe(true);
    expect(matchesNumberFilter(50, { operator: 'above_average' }, 50)).toBe(false);
    expect(matchesNumberFilter(49, { operator: 'below_average' }, 50)).toBe(true);
  });
});

describe('describeNumberFilter', () => {
  it('returns null when no operator is set', () => {
    expect(describeNumberFilter(NO_NUMBER_FILTER)).toBeNull();
  });

  it('formats a comparison with the unit appended', () => {
    expect(describeNumberFilter({ operator: 'gte', value: 70 }, '%')).toBe('≥ 70%');
  });

  it('formats between as a range', () => {
    expect(describeNumberFilter({ operator: 'between', value: 30, value2: 60 }, '%')).toBe('30%–60%');
  });

  it('formats the average operators as plain text', () => {
    expect(describeNumberFilter({ operator: 'above_average' })).toBe('above average');
    expect(describeNumberFilter({ operator: 'below_average' })).toBe('below average');
  });
});

describe('NumberFilterHeader', () => {
  it('opens a value modal for a comparison operator and applies the entered value', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumberFilterHeader label="Percentage" value={NO_NUMBER_FILTER} onChange={onChange} unit="%" />);

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Greater Than...' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Value'), '70');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChange).toHaveBeenCalledWith({ operator: 'gt', value: 70 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not apply when the value field is left empty', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumberFilterHeader label="Percentage" value={NO_NUMBER_FILTER} onChange={onChange} unit="%" />);

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Equals...' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancelling the value modal leaves the filter unchanged', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumberFilterHeader label="Percentage" value={NO_NUMBER_FILTER} onChange={onChange} unit="%" />);

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Less Than...' }));
    await user.type(screen.getByLabelText('Value'), '10');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('applies Above Average / Below Average immediately, with no modal', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumberFilterHeader label="Percentage" value={NO_NUMBER_FILTER} onChange={onChange} unit="%" />);

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Above Average' }));

    expect(onChange).toHaveBeenCalledWith({ operator: 'above_average' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows "Clear Filter" only once a filter is active, and it resets to no filter', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(<NumberFilterHeader label="Percentage" value={NO_NUMBER_FILTER} onChange={onChange} unit="%" />);

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    expect(screen.queryByRole('menuitem', { name: 'Clear Filter' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    rerender(<NumberFilterHeader label="Percentage" value={{ operator: 'gt', value: 50 }} onChange={onChange} unit="%" />);
    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear Filter' }));

    expect(onChange).toHaveBeenCalledWith(NO_NUMBER_FILTER);
  });

  it('colors the trigger label to signal an active filter', () => {
    const { rerender } = render(<NumberFilterHeader label="Percentage" value={NO_NUMBER_FILTER} onChange={jest.fn()} unit="%" />);
    expect(screen.getByRole('button', { name: 'Filter by Percentage' })).not.toHaveClass('text-primary');

    rerender(<NumberFilterHeader label="Percentage" value={{ operator: 'gt', value: 50 }} onChange={jest.fn()} unit="%" />);
    expect(screen.getByRole('button', { name: 'Filter by Percentage' })).toHaveClass('text-primary');
  });

  it('prefills the value modal when reopening the same operator that is already applied', async () => {
    const user = userEvent.setup();
    render(<NumberFilterHeader label="Percentage" value={{ operator: 'gt', value: 42 }} onChange={jest.fn()} unit="%" />);

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Greater Than...' }));

    expect(screen.getByLabelText('Value')).toHaveValue(42);
  });
});
