import { render, screen, fireEvent } from '@testing-library/react';
import { CustomFieldsInputs, type CustomFieldDefLike } from './CustomFieldsInputs';
import type { CustomFieldInputMap } from '../lib/types';

const DEFS: CustomFieldDefLike[] = [
  { id: 'text-1', label: 'Nickname', fieldType: 'text', options: null, required: false },
  { id: 'num-1', label: 'Years experience', fieldType: 'number', options: null, required: true },
  { id: 'date-1', label: 'Available from', fieldType: 'date', options: null, required: false },
  { id: 'select-1', label: 'Region', fieldType: 'select', options: ['North', 'South'], required: false },
];

function renderInputs(values: CustomFieldInputMap, onChange: (next: CustomFieldInputMap) => void) {
  return render(<CustomFieldsInputs definitions={DEFS} values={values} onChange={onChange} />);
}

describe('CustomFieldsInputs', () => {
  it('renders one control per definition, matched to its fieldType', () => {
    renderInputs({}, () => {});

    const textInput = screen.getByLabelText('Nickname');
    expect(textInput).toHaveAttribute('type', 'text');

    const numberInput = screen.getByLabelText(/Years experience/);
    expect(numberInput).toHaveAttribute('type', 'number');

    const dateInput = screen.getByLabelText('Available from');
    expect(dateInput).toHaveAttribute('type', 'date');

    const select = screen.getByLabelText('Region');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'North' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'South' })).toBeInTheDocument();
  });

  it('shows a required marker for required definitions only', () => {
    renderInputs({}, () => {});
    expect(screen.getByText('Years experience *')).toBeInTheDocument();
    expect(screen.queryByText('Nickname *')).not.toBeInTheDocument();
  });

  it('calls onChange with the definition id keyed to the new value when typing text', () => {
    const onChange = jest.fn();
    renderInputs({}, onChange);
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Bob' } });
    expect(onChange).toHaveBeenCalledWith({ 'text-1': 'Bob' });
  });

  it('coerces a number field to a number on change', () => {
    const onChange = jest.fn();
    renderInputs({}, onChange);
    fireEvent.change(screen.getByLabelText(/Years experience/), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ 'num-1': 5 });
  });

  it('calls onChange with an empty string when a field is cleared', () => {
    const onChange = jest.fn();
    renderInputs({ 'text-1': 'Bob' }, onChange);
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ 'text-1': '' });
  });

  it('merges the change into the existing values map', () => {
    const onChange = jest.fn();
    renderInputs({ 'text-1': 'Bob', 'num-1': 3 }, onChange);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'South' } });
    expect(onChange).toHaveBeenCalledWith({ 'text-1': 'Bob', 'num-1': 3, 'select-1': 'South' });
  });

  it('calls onChange with the selected option when using the select', () => {
    const onChange = jest.fn();
    renderInputs({}, onChange);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'North' } });
    expect(onChange).toHaveBeenCalledWith({ 'select-1': 'North' });
  });

  it('renders nothing for an empty definitions list', () => {
    const { container } = render(<CustomFieldsInputs definitions={[]} values={{}} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
