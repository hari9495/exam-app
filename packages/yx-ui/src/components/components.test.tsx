import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Fingerprint, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Button, IconButton } from './button';
import { FormField, ErrorSummary } from './field';
import { CurrencyField, MaskedField, TextField, TimeField } from './inputs';
import { Checkbox, MethodCards } from './choice';
import { MultiSelect, PersonPicker, Select } from './select';
import { DatePicker } from './date';
import { FileUpload, typesLabel } from './upload';
import { Avatar, Badge } from './display';

describe('Button', () => {
  it('defaults to secondary, type=button', () => {
    render(<Button>Preview</Button>);
    const b = screen.getByRole('button', { name: 'Preview' });
    expect(b).toHaveAttribute('data-variant', 'secondary');
    expect(b).toHaveAttribute('type', 'button');
  });
  it('blocks clicks and keeps its name while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick} icon={Plus}>
        Run payroll
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Run payroll' });
    expect(b).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('icon button uses its label as accessible name', () => {
    render(<IconButton icon={Trash2} label="Delete row" />);
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeInTheDocument();
  });
});

describe('FormField', () => {
  it('links label, helper, error and required to the control', () => {
    render(
      <FormField label="Work email" required helper="We send payslips here" error="Enter an email like name@company.com">
        <TextField />
      </FormField>,
    );
    const input = screen.getByLabelText(/Work email/);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription(/Enter an email.*We send payslips here/);
  });
  it('error summary links focus the field', async () => {
    render(
      <>
        <ErrorSummary errors={[{ fieldId: 'pan', message: 'Enter PAN' }]} />
        <input id="pan" aria-label="PAN" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveFocus();
    await userEvent.click(screen.getByRole('link', { name: 'Enter PAN' }));
    expect(screen.getByLabelText('PAN')).toHaveFocus();
  });
});

function Masked({ kind }: { kind: 'pan' | 'aadhaar' | 'phone' }) {
  const [v, setV] = useState('');
  return (
    <>
      <FormField label="Id">
        <MaskedField kind={kind} value={v} onChange={setV} />
      </FormField>
      <span data-testid="stored">{v}</span>
      <button>elsewhere</button>
    </>
  );
}

describe('MaskedField', () => {
  it('normalises PAN, errors after blur, clears when fixed', async () => {
    const u = userEvent.setup();
    render(<Masked kind="pan" />);
    const input = screen.getByLabelText('Id');
    await u.type(input, 'abcde123');
    expect(screen.getByTestId('stored')).toHaveTextContent('ABCDE123');
    expect(screen.queryByText(/10-character PAN/)).toBeNull(); // not before blur
    await u.click(screen.getByText('elsewhere'));
    expect(screen.getByText(/10-character PAN/)).toBeInTheDocument();
    await u.type(input, '4f');
    expect(screen.queryByText(/10-character PAN/)).toBeNull();
    expect(screen.getByLabelText('Valid')).toBeInTheDocument();
  });
  it('stores 10 digits for a pasted +91 number', async () => {
    const u = userEvent.setup();
    render(<Masked kind="phone" />);
    await u.click(screen.getByLabelText('Id'));
    await u.paste('+91 98765-43210');
    expect(screen.getByTestId('stored')).toHaveTextContent('9876543210');
    expect(screen.getByText('+91')).toBeInTheDocument();
  });
});

describe('CurrencyField', () => {
  it('shows Indian grouping when not editing and reports a number', async () => {
    const u = userEvent.setup();
    const seen: (number | null)[] = [];
    function C() {
      const [v, setV] = useState<number | null>(null);
      return (
        <FormField label="Monthly CTC">
          <CurrencyField
            value={v}
            onChange={(n) => {
              seen.push(n);
              setV(n);
            }}
          />
        </FormField>
      );
    }
    render(
      <>
        <C />
        <button>elsewhere</button>
      </>,
    );
    const input = screen.getByLabelText('Monthly CTC');
    await u.type(input, '1a18500');
    expect(seen.at(-1)).toBe(118500);
    await u.click(screen.getByText('elsewhere'));
    expect(input).toHaveValue('1,18,500');
    expect(screen.getByText('₹')).toBeInTheDocument();
  });
});

describe('TimeField', () => {
  it('parses typed time and shows 12-hour', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <FormField label="Shift start">
          <TimeField value={null} onChange={onChange} />
        </FormField>
        <button>elsewhere</button>
      </>,
    );
    await u.type(screen.getByLabelText('Shift start'), '930pm');
    await u.click(screen.getByText('elsewhere'));
    expect(onChange).toHaveBeenCalledWith('21:30');
  });
});

describe('Select', () => {
  const opts = [
    { value: 'cl', label: 'Casual leave' },
    { value: 'el', label: 'Earned leave' },
  ];
  it('opens, picks an option, closes', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FormField label="Leave type">
        <Select options={opts} value={null} onChange={onChange} />
      </FormField>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Leave type' });
    await u.click(trigger);
    await u.click(await screen.findByText('Earned leave'));
    expect(onChange).toHaveBeenCalledWith('el');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  });
  it('opens with the current choice highlighted', async () => {
    render(<Select aria-label="Leave type" options={opts} value="el" onChange={() => {}} defaultOpen />);
    const current = await screen.findByRole('option', { name: /Earned leave/ });
    expect(current).toHaveAttribute('data-selected', 'true');
    expect(current).toHaveAttribute('aria-checked', 'true');
  });
  it('multi-select toggles values and stays open', async () => {
    const u = userEvent.setup();
    function M() {
      const [v, setV] = useState<string[]>(['cl']);
      return <MultiSelect aria-label="Types" options={opts} value={v} onChange={setV} />;
    }
    render(<M />);
    await u.click(screen.getByRole('combobox', { name: 'Types' }));
    await u.click(await screen.findByRole('option', { name: /Earned leave/ }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });
  it('person picker searches by department', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PersonPicker
        aria-label="Manager"
        value={null}
        onChange={onChange}
        people={[
          { id: '1', name: 'Rohit Bhat', role: 'Engineering Manager', department: 'Engineering' },
          { id: '2', name: 'Lakshmi Venkatesan', role: 'HR Business Partner', department: 'People' },
        ]}
      />,
    );
    await u.click(screen.getByRole('combobox', { name: 'Manager' }));
    await u.type(await screen.findByPlaceholderText(/Name, email/), 'people');
    expect(screen.queryByRole('option', { name: /Rohit Bhat/ })).toBeNull();
    await u.click(screen.getByRole('option', { name: /Lakshmi/ }));
    expect(onChange).toHaveBeenCalledWith('2');
  });
});

describe('DatePicker', () => {
  it('accepts typed day-first dates and shows dd MMM yyyy', async () => {
    const u = userEvent.setup();
    function D() {
      const [d, setD] = useState<Date | null>(null);
      return (
        <FormField label="Joining date">
          <DatePicker value={d} onChange={setD} />
        </FormField>
      );
    }
    render(
      <>
        <D />
        <button>elsewhere</button>
      </>,
    );
    const input = screen.getByLabelText('Joining date');
    await u.type(input, '4/3/2024');
    await u.click(screen.getByText('elsewhere'));
    expect(input).toHaveValue('4 Mar 2024');
  });
  it('rejects dates outside min', async () => {
    const u = userEvent.setup();
    render(
      <>
        <FormField label="Last day">
          <DatePicker value={null} onChange={() => {}} min={new Date(2026, 8, 1)} />
        </FormField>
        <button>elsewhere</button>
      </>,
    );
    await u.type(screen.getByLabelText('Last day'), '31 Aug 2026');
    await u.click(screen.getByText('elsewhere'));
    expect(screen.getByText('Choose a date on or after 1 Sep 2026')).toBeInTheDocument();
  });
});

describe('FileUpload', () => {
  it('names file types in plain words', () => {
    expect(typesLabel(['application/pdf', 'image/jpeg', 'image/png'])).toBe('PDF, JPG or PNG');
    expect(typesLabel(['.jpg', '.jpeg'])).toBe('JPG');
  });

  it('rejects wrong type up front and uploads allowed files with scan step', async () => {
    const u = userEvent.setup({ applyAccept: false });
    let finish!: () => void;
    const upload = vi.fn((_f: File, h: { onProgress: (n: number) => void; onScanning: () => void }) => {
      h.onProgress(50);
      return new Promise<void>((res) => {
        finish = () => {
          h.onScanning();
          res();
        };
      });
    });
    const { container } = render(<FileUpload upload={upload} accept={['.pdf']} />);
    expect(screen.getByText(/PDF · up to 10 MB/)).toBeInTheDocument();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await u.upload(input, [new File(['x'], 'photo.exe'), new File(['%PDF'], 'offer.pdf')]);
    expect(screen.getByText(/This file type is not allowed/)).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Uploading 50%/)).toBeInTheDocument();
    await act(async () => finish());
    expect(await screen.findByText(/Uploaded/)).toBeInTheDocument();
  });

  it('the field label and the error summary can focus it (the zone shows the ring); Browse files is the tab stop', () => {
    render(
      <FormField label="Résumé" id="resume" error="Attach your resume">
        <FileUpload upload={vi.fn()} />
      </FormField>,
    );
    const input = screen.getByLabelText(/Résumé/) as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('tabindex', '-1');
    document.getElementById('resume')?.focus();
    expect(input).toHaveFocus();
    expect(input.closest('.yx-upload__zone')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Browse files' })).not.toHaveAttribute('tabindex');
  });
});

describe('display', () => {
  it('badge carries tone and text; avatar falls back to initials', () => {
    render(
      <>
        <Badge tone="success">Paid</Badge>
        <Avatar name="Divya Raghunathan" />
        <Checkbox label="Send offer letter by email" />
      </>,
    );
    expect(screen.getByText('Paid')).toHaveAttribute('data-tone', 'success');
    expect(screen.getByRole('img', { name: 'Divya Raghunathan' })).toHaveTextContent('DR');
    expect(screen.getByRole('checkbox', { name: 'Send offer letter by email' })).toBeInTheDocument();
  });
});

describe('MethodCards', () => {
  const OPTIONS = [
    { value: 'passkey', title: 'Passkey', description: 'Sign in with your face, fingerprint or PIN.', icon: Fingerprint, badge: 'Recommended' },
    { value: 'totp', title: 'Authenticator app', description: 'Enter a 6-digit code from your app.', icon: Smartphone },
  ];

  it('is a labelled list of buttons, each named by its title and described by its line', () => {
    render(<MethodCards aria-label="Ways to sign in" options={OPTIONS} onSelect={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Ways to sign in' });
    const [passkey, app] = within(list).getAllByRole('button');
    expect(passkey).toHaveAccessibleName('Passkey Recommended');
    expect(passkey).toHaveAccessibleDescription('Sign in with your face, fingerprint or PIN.');
    expect(app).toHaveAccessibleName('Authenticator app');
    expect(app).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(passkey.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull(); // icon tile is decorative
  });

  it('goes straight into the method by click or keyboard (Tab, Enter, Space)', async () => {
    const onSelect = vi.fn();
    render(<MethodCards aria-label="Ways" options={OPTIONS} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Authenticator app' }));
    expect(onSelect).toHaveBeenLastCalledWith('totp');
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: /^Passkey/ })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('passkey');
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith('totp');
  });

  it('while one card is busy it shows so and holds every card', async () => {
    const onSelect = vi.fn();
    render(<MethodCards aria-label="Ways" options={OPTIONS} onSelect={onSelect} busy="passkey" />);
    const passkey = screen.getByRole('button', { name: /^Passkey/ });
    expect(passkey).toHaveAttribute('aria-busy', 'true');
    expect(passkey).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Authenticator app' })).toBeDisabled();
  });
});
