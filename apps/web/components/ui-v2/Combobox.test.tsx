import { render, screen, fireEvent } from '@testing-library/react';
import { Combobox } from './Combobox';

describe('Combobox async (server-side) mode', () => {
  const options = [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }];

  it('shows selectedLabel on the trigger when the value is not in the current options', () => {
    render(<Combobox value="x" onChange={() => {}} options={options} onSearch={() => {}} selectedLabel="Chosen X" />);
    expect(screen.getByRole('button')).toHaveTextContent('Chosen X');
  });

  it('calls onSearch on input and does NOT filter locally (server already filtered)', () => {
    const onSearch = jest.fn();
    render(<Combobox value="" onChange={() => {}} options={options} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzz' } });
    expect(onSearch).toHaveBeenCalledWith('zzz');
    // Both options remain visible despite 'zzz' — no local filtering in async mode.
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('shows a searching state while loading', () => {
    render(<Combobox value="" onChange={() => {}} options={[]} onSearch={() => {}} loading />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('still filters locally when NOT in async mode (backward compatible)', () => {
    render(<Combobox value="" onChange={() => {}} options={options} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'app' } });
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  });
});
