import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../components/button';
import { ErrorSummary, FieldRow, FormField, FormSection, StickySaveBar } from '../components/field';
import { CurrencyField, MaskedField, NumberField, PasswordField, TextArea, TextField, TimeField } from '../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../components/choice';
import { MultiSelect, PersonPicker, Select } from '../components/select';
import { DatePicker, DateRangePicker } from '../components/date';
import { FileUpload, type UploadItem } from '../components/upload';
import { Section, Stack } from './story-kit';

const meta: Meta = { title: 'Inputs/All states' };
export default meta;

const DEPTS = ['Engineering', 'Finance', 'Operations', 'People', 'Sales', 'Quality', 'Procurement', 'Legal', 'Logistics'].map((d) => ({ value: d.toLowerCase(), label: d }));
const PEOPLE = [
  { id: 'p1', name: 'Rohit Bhat', role: 'Engineering Manager', department: 'Engineering' },
  { id: 'p2', name: 'Lakshmi Venkatesan', role: 'HR Business Partner', department: 'People' },
  { id: 'p3', name: 'Prakash Menon', role: 'Sales Manager, South', department: 'Sales' },
  { id: 'p4', name: 'Arjun Kulkarni', role: 'Plant Supervisor', department: 'Operations' },
];
const noop = () => {};
const file = (name: string, kb: number) => new File([new Uint8Array(kb * 1024)], name);

export const ErrorStates: StoryObj = {
  name: 'Error state · every input',
  render: () => (
    <Stack width={640}>
      <Section title="Every input with an error (§16)" note="Red border, icon and text that says what to do. Colour is never the only signal.">
        <FormField label="Full name" required error="Enter the full name">
          <TextField value="" onChange={noop} />
        </FormField>
        <FormField label="Reason" required error="Add a reason of at least 10 characters">
          <TextArea value="Sick" onChange={noop} />
        </FormField>
        <FormField label="Password" error="Use at least 12 characters">
          <PasswordField value="short" onChange={noop} />
        </FormField>
        <FieldRow>
          <FormField label="Monthly CTC" required error="Enter ₹15,000 or more">
            <CurrencyField value={9000} onChange={noop} />
          </FormField>
          <FormField label="Notice period" error="Enter a value between 0 and 90">
            <NumberField value={120} onChange={noop} suffix="days" />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="PAN" required error="Enter a 10-character PAN like ABCDE1234F">
            <MaskedField kind="pan" value="ABCD1234" onChange={noop} />
          </FormField>
          <FormField label="Shift start" error="Enter a time like 9:30 am">
            <TimeField value={null} onChange={noop} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Department" required error="Choose a department">
            <Select options={DEPTS} value={null} onChange={noop} placeholder="Choose a department" />
          </FormField>
          <FormField label="Joining date" required error="Enter a date like 28 Sep 2026">
            <DatePicker value={null} onChange={noop} />
          </FormField>
        </FieldRow>
        <FormField label="Visible to" error="Choose at least one department">
          <MultiSelect options={DEPTS} value={[]} onChange={noop} />
        </FormField>
        <DateRangePicker label="Leave dates" required value={{ from: new Date(2026, 9, 9), to: new Date(2026, 9, 5) }} onChange={noop} />
      </Section>
    </Stack>
  ),
};

export const LiveValidation: StoryObj = {
  name: 'Live validation · typed',
  render: function Render() {
    const [pan, setPan] = useState('');
    const [ifsc, setIfsc] = useState('');
    const [aadhaar, setAadhaar] = useState('');
    const [phone, setPhone] = useState('');
    const [notice, setNotice] = useState<number | null>(null);
    const [join, setJoin] = useState<Date | null>(null);
    return (
      <Stack width={640}>
        <Section title="Errors the fields raise themselves, after the user leaves the field" note="This story types wrong values and tabs away automatically.">
          <FieldRow>
            <FormField label="PAN">
              <MaskedField kind="pan" value={pan} onChange={setPan} />
            </FormField>
            <FormField label="IFSC">
              <MaskedField kind="ifsc" value={ifsc} onChange={setIfsc} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Aadhaar">
              <MaskedField kind="aadhaar" value={aadhaar} onChange={setAadhaar} />
            </FormField>
            <FormField label="Mobile number">
              <MaskedField kind="phone" value={phone} onChange={setPhone} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Notice period" helper="0 to 90 days">
              <NumberField value={notice} onChange={setNotice} min={0} max={90} suffix="days" />
            </FormField>
            <FormField label="Last working day">
              <DatePicker value={join} onChange={setJoin} min={new Date(2026, 8, 1)} />
            </FormField>
          </FieldRow>
        </Section>
      </Stack>
    );
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const type = async (label: string, text: string) => {
      await userEvent.type(c.getByLabelText(label), text);
      await userEvent.tab();
    };
    await type('PAN', 'abcd123');
    await type('IFSC', 'HDFC1234');
    await type('Aadhaar', '123456789012');
    await type('Mobile number', '5123456789');
    await type('Notice period', '120');
    await type('Last working day', '31 Aug 2026');
  },
};

export const DisabledAndReadOnly: StoryObj = {
  name: 'Disabled · every input',
  render: () => (
    <Stack width={640}>
      <Section title="Disabled (§15, §16)" note="Prefer enabled + explain. When disabled is unavoidable, the helper says why.">
        <FormField label="Employee ID" disabled helper="Set by the numbering rule">
          <TextField value="KF-0142" onChange={noop} />
        </FormField>
        <FormField label="Notes" disabled>
          <TextArea value="Locked after payroll" onChange={noop} />
        </FormField>
        <FieldRow>
          <FormField label="Monthly CTC" disabled helper="Locked while payroll is running">
            <CurrencyField value={118500} onChange={noop} />
          </FormField>
          <FormField label="PAN" disabled>
            <MaskedField kind="pan" value="ABCDE1234F" onChange={noop} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Department" disabled>
            <Select options={DEPTS} value="engineering" onChange={noop} />
          </FormField>
          <FormField label="Joining date" disabled>
            <DatePicker value={new Date(2024, 2, 4)} onChange={noop} />
          </FormField>
        </FieldRow>
        <FormField label="Visible to" disabled>
          <MultiSelect options={DEPTS} value={['sales']} onChange={noop} />
        </FormField>
        <Checkbox label="Unchecked and disabled" disabled />
        <Checkbox label="Checked and disabled" disabled checked />
        <RadioGroup
          aria-label="Pay frequency"
          orientation="horizontal"
          value="monthly"
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'weekly', label: 'Weekly', description: 'Not in your plan yet', disabled: true },
          ]}
        />
        <Switch label="Weekend check-in" description="Turned off by your admin" disabled />
        <Switch label="Payslip download" checked disabled />
        <FileUpload upload={async () => {}} accept={['.pdf']} disabled />
      </Section>
    </Stack>
  ),
};

export const SizesAndVariants: StoryObj = {
  name: 'Sizes and options',
  render: function Render() {
    const [paise, setPaise] = useState<number | null>(1234.5);
    const [t24, setT24] = useState<string | null>('21:30');
    const [many, setMany] = useState(['engineering', 'finance', 'sales', 'quality', 'legal']);
    return (
      <Stack width={640}>
        <Section title="Small size (32 px) for filter bars and dense tables">
          <FieldRow>
            <FormField label="Search" hideLabel>
              <TextField size="sm" placeholder="Search employees" />
            </FormField>
            <FormField label="Department" hideLabel>
              <Select size="sm" options={DEPTS} value={null} onChange={noop} placeholder="Department" />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="From" hideLabel>
              <DatePicker size="sm" value={new Date(2026, 8, 1)} onChange={noop} />
            </FormField>
            <FormField label="Status" hideLabel>
              <MultiSelect size="sm" options={DEPTS} value={['engineering']} onChange={noop} />
            </FormField>
          </FieldRow>
        </Section>
        <Section title="Options">
          <FieldRow>
            <FormField label="Reimbursement amount" helper="Paise allowed">
              <CurrencyField value={paise} onChange={setPaise} allowPaise />
            </FormField>
            <FormField label="Shift end" helper="24-hour option (§35)">
              <TimeField value={t24} onChange={setT24} hour12={false} />
            </FormField>
          </FieldRow>
          <FormField label="Visible to departments" helper="More than 3 choices collapse to +N">
            <MultiSelect options={DEPTS} value={many} onChange={setMany} />
          </FormField>
          <FormField label="Payment mode">
            <RadioGroup
              aria-label="Payment mode"
              orientation="horizontal"
              defaultValue="bank"
              options={[
                { value: 'bank', label: 'Bank transfer' },
                { value: 'cheque', label: 'Cheque' },
                { value: 'cash', label: 'Cash' },
              ]}
            />
          </FormField>
        </Section>
      </Stack>
    );
  },
};

export const InteractionStates: StoryObj = {
  name: 'Hover and focus · inputs',
  parameters: {
    pseudo: {
      hover: ['#hover-row .yx-input', '#hover-row .yx-select', '#hover-row .yx-checkbox'],
      focusWithin: ['#focus-row .yx-input'],
      focusVisible: ['#focus-row .yx-select', '#focus-row .yx-checkbox', '#focus-row .yx-switch'],
    },
  },
  render: () => (
    <Stack width={640}>
      <Section title="Hover · border darkens (no glow, no lift)">
        <div id="hover-row" style={{ display: 'grid', gap: 12 }}>
          <FormField label="Hover text field">
            <TextField defaultValue="Divya" />
          </FormField>
          <FormField label="Hover select">
            <Select options={DEPTS} value="sales" onChange={noop} />
          </FormField>
          <Checkbox label="Hover checkbox" />
        </div>
      </Section>
      <Section title="Keyboard focus · 2 px Azure ring (§5)">
        <div id="focus-row" style={{ display: 'grid', gap: 12 }}>
          <FormField label="Focused text field">
            <TextField defaultValue="Divya" />
          </FormField>
          <FormField label="Focused select">
            <Select options={DEPTS} value="sales" onChange={noop} />
          </FormField>
          <Checkbox label="Focused checkbox" />
          <Switch label="Focused switch" defaultChecked />
        </div>
      </Section>
    </Stack>
  ),
};

export const SelectOpen: StoryObj = {
  name: 'Open · select with search',
  render: () => (
    <div style={{ maxWidth: 400, minHeight: 440 }}>
      <FormField label="Department" required>
        <Select options={DEPTS} value="finance" onChange={noop} defaultOpen />
      </FormField>
    </div>
  ),
};

export const SelectOpenShort: StoryObj = {
  name: 'Open · short select, clearable',
  render: () => (
    <div style={{ maxWidth: 400, minHeight: 280 }}>
      <FormField label="Work location" optional>
        <Select
          clearable
          defaultOpen
          value="blr"
          onChange={noop}
          options={[
            { value: 'blr', label: 'Bengaluru', description: 'Head office · Karnataka' },
            { value: 'maa', label: 'Chennai', description: 'Tamil Nadu' },
            { value: 'hsr', label: 'Hosur plant', description: 'Tamil Nadu', disabled: true },
          ]}
        />
      </FormField>
    </div>
  ),
};

export const MultiSelectOpen: StoryObj = {
  name: 'Open · multi-select',
  render: () => (
    <div style={{ maxWidth: 400, minHeight: 480 }}>
      <FormField label="Visible to departments">
        <MultiSelect options={DEPTS} value={['engineering', 'quality']} onChange={noop} defaultOpen />
      </FormField>
    </div>
  ),
};

export const PersonPickerOpen: StoryObj = {
  name: 'Open · person picker',
  render: () => (
    <div style={{ maxWidth: 400, minHeight: 360 }}>
      <FormField label="Reporting manager" required>
        <PersonPicker people={PEOPLE} value="p2" onChange={noop} defaultOpen />
      </FormField>
    </div>
  ),
};

export const SelectNoMatches: StoryObj = {
  name: 'Open · no matches',
  render: () => (
    <div style={{ maxWidth: 400, minHeight: 200 }}>
      <FormField label="Department">
        <Select options={DEPTS} value={null} onChange={noop} defaultOpen />
      </FormField>
    </div>
  ),
  play: async () => {
    const input = await within(document.body).findByPlaceholderText('Search');
    await userEvent.type(input, 'zzz');
  },
};

export const CalendarOpen: StoryObj = {
  name: 'Open · calendar with blocked days',
  render: () => (
    <div style={{ maxWidth: 400, minHeight: 420 }}>
      <FormField label="Leave start" helper="Holidays and past days cannot be picked">
        <DatePicker
          value={new Date(2026, 9, 7)}
          onChange={noop}
          min={new Date(2026, 9, 1)}
          disabledDays={[new Date(2026, 9, 2), new Date(2026, 9, 20), { dayOfWeek: [0] }]}
          defaultOpen
        />
      </FormField>
    </div>
  ),
};

const ITEMS: UploadItem[] = [
  { id: 'a', file: file('offer-letter-signed.pdf', 240), status: 'done', progress: 100 },
  { id: 'b', file: file('aadhaar-front.jpg', 1800), status: 'uploading', progress: 45 },
  { id: 'c', file: file('pan-card.png', 600), status: 'scanning', progress: 100 },
  { id: 'd', file: file('relieving-letter.pdf', 900), status: 'error', progress: 30, error: 'The upload stopped. Check your connection and retry' },
  { id: 'e', file: file('payslips-2025.zip', 3000), status: 'error', progress: 0, error: 'This file type is not allowed. Use .pdf, .jpg, .png' },
];

export const UploadStates: StoryObj = {
  name: 'Upload · every status',
  render: () => (
    <Stack width={640}>
      <Section title="Uploaded, uploading, virus scan, failed (with Retry), rejected before upload (§31)">
        <FormField label="Joining documents">
          <FileUpload upload={() => new Promise(() => {})} accept={['.pdf', '.jpg', '.png']} maxSize={5 * 1024 * 1024} defaultItems={ITEMS} />
        </FormField>
      </Section>
    </Stack>
  ),
};

export const UploadDragOver: StoryObj = {
  name: 'Upload · file dragged over',
  render: () => (
    <Stack width={640}>
      <FormField label="Offer letter">
        <FileUpload upload={async () => {}} accept={['.pdf']} />
      </FormField>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const zone = canvasElement.querySelector('.yx-upload__zone')!;
    fireEvent.dragOver(zone);
  },
};

export const FormFeedback: StoryObj = {
  name: 'Form feedback · summary and save bar',
  render: () => (
    <Stack width={640}>
      <Section title="Error summary at the top of long forms; each line jumps to its field">
        <ErrorSummary
          errors={[
            { fieldId: 'x1', message: 'Enter the full name' },
            { fieldId: 'x2', message: 'Enter a work email like name@company.com' },
            { fieldId: 'x3', message: 'Enter the monthly CTC' },
          ]}
        />
      </Section>
      <Section title="Save bar · clean and with unsaved changes">
        <div style={{ border: '1px solid var(--yx-color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <StickySaveBar>
            <Button>Cancel</Button>
            <Button variant="primary">Save</Button>
          </StickySaveBar>
        </div>
        <div style={{ border: '1px solid var(--yx-color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <StickySaveBar dirty>
            <Button>Cancel</Button>
            <Button variant="primary">Save changes</Button>
          </StickySaveBar>
        </div>
        <div style={{ border: '1px solid var(--yx-color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <StickySaveBar dirty>
            <Button>Cancel</Button>
            <Button variant="primary" loading>
              Save changes
            </Button>
          </StickySaveBar>
        </div>
      </Section>
    </Stack>
  ),
};

export const MobileForm: StoryObj = {
  name: 'Mobile · 16 px text, 44 px targets',
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: function Render() {
    const [phone, setPhone] = useState('9876543210');
    return (
      <Stack>
        <FormSection title="Apply leave">
          <DateRangePicker label="Dates" required value={{ from: new Date(2026, 9, 5), to: new Date(2026, 9, 7) }} onChange={noop} />
          <FormField label="Leave type" required>
            <Select options={[{ value: 'cl', label: 'Casual leave' }, { value: 'el', label: 'Earned leave' }]} value="cl" onChange={noop} />
          </FormField>
          <FormField label="Contact number while away">
            <MaskedField kind="phone" value={phone} onChange={setPhone} />
          </FormField>
          <FormField label="Reason" optional>
            <TextArea placeholder="Add a note for your manager" />
          </FormField>
          <Checkbox label="Notify my team" defaultChecked />
        </FormSection>
        <StickySaveBar>
          <Button>Cancel</Button>
          <Button variant="primary">Apply</Button>
        </StickySaveBar>
      </Stack>
    );
  },
};
