import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../components/button';
import { ErrorSummary, FieldRow, Form, FormField, FormSection, StickySaveBar, useUnsavedChangesGuard, type FormErrorItem } from '../components/field';
import { CurrencyField, MaskedField, NumberField, PasswordField, TextArea, TextField, TimeField } from '../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../components/choice';
import { Combobox, MultiSelect, PersonPicker, Select } from '../components/select';
import { DatePicker, DateRangePicker, type DateRange } from '../components/date';
import { FileUpload } from '../components/upload';
import { Icon } from '../components/foundations';
import { Section, Stack } from './story-kit';

const meta: Meta = { title: 'Inputs/Forms' };
export default meta;

const PEOPLE = [
  { id: 'p1', name: 'Rohit Bhat', role: 'Engineering Manager', department: 'Engineering', email: 'rohit.b@kaverifoods.in' },
  { id: 'p2', name: 'Lakshmi Venkatesan', role: 'HR Business Partner', department: 'People', email: 'lakshmi.v@kaverifoods.in' },
  { id: 'p3', name: 'Prakash Menon', role: 'Sales Manager, South', department: 'Sales', email: 'prakash.m@kaverifoods.in' },
  { id: 'p4', name: 'Arjun Kulkarni', role: 'Plant Supervisor', department: 'Operations', email: 'arjun.k@kaverifoods.in' },
];
const DEPARTMENTS = ['Engineering', 'Finance', 'Operations', 'People', 'Sales', 'Quality', 'Procurement', 'Legal', 'Logistics'].map((d) => ({
  value: d.toLowerCase(),
  label: d,
}));
const LOCATIONS = [
  { value: 'blr', label: 'Bengaluru', description: 'Head office · Karnataka' },
  { value: 'maa', label: 'Chennai', description: 'Tamil Nadu' },
  { value: 'hsr', label: 'Hosur plant', description: 'Tamil Nadu' },
];

export const TextInputs: StoryObj = {
  render: function Render() {
    const [pan, setPan] = useState('ABCDE1234F');
    const [ifsc, setIfsc] = useState('');
    const [uan, setUan] = useState('100012345678');
    const [aadhaar, setAadhaar] = useState('');
    const [phone, setPhone] = useState('9876543210');
    const [ctc, setCtc] = useState<number | null>(118500);
    const [days, setDays] = useState<number | null>(12);
    const [time, setTime] = useState<string | null>('09:30');
    return (
      <Stack width={640}>
        <Section title="Text (§16)" note="Label above, helper below, the word Required, errors say what to do.">
          <FormField label="Full name" required helper="As on PAN card">
            <TextField defaultValue="Divya Raghunathan" autoComplete="name" />
          </FormField>
          <FormField label="Work email" required error="Enter an email like name@company.com">
            <TextField defaultValue="divya.r@" type="email" />
          </FormField>
          <FormField label="Search" hideLabel>
            <TextField placeholder="Search people" prefix={<Icon icon={Search} />} />
          </FormField>
          <FormField label="Employee ID" helper="Set by the numbering rule" disabled>
            <TextField value="KF-0142" readOnly />
          </FormField>
          <FormField label="Reason" optional>
            <TextArea placeholder="Add a note for your manager" />
          </FormField>
          <FormField label="Password">
            <PasswordField defaultValue="not-a-real-password" />
          </FormField>
        </Section>
        <Section title="Indian identifiers · live checks" note="Errors appear after you leave the field and clear as soon as the value is right.">
          <FieldRow>
            <FormField label="PAN" required>
              <MaskedField kind="pan" value={pan} onChange={setPan} />
            </FormField>
            <FormField label="IFSC" required>
              <MaskedField kind="ifsc" value={ifsc} onChange={setIfsc} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="UAN">
              <MaskedField kind="uan" value={uan} onChange={setUan} />
            </FormField>
            <FormField label="Aadhaar" helper="Shown masked after you type it">
              <MaskedField kind="aadhaar" value={aadhaar} onChange={setAadhaar} />
            </FormField>
          </FieldRow>
          <FormField label="Mobile number" required>
            <MaskedField kind="phone" value={phone} onChange={setPhone} />
          </FormField>
        </Section>
        <Section title="Numbers, money, time (§35)">
          <FieldRow>
            <FormField label="Monthly CTC" required helper="Whole rupees">
              <CurrencyField value={ctc} onChange={setCtc} max={10000000} />
            </FormField>
            <FormField label="Notice period" helper="0 to 90 days">
              <NumberField value={days} onChange={setDays} min={0} max={90} suffix="days" />
            </FormField>
          </FieldRow>
          <FormField label="Shift start">
            <TimeField value={time} onChange={setTime} />
          </FormField>
        </Section>
      </Stack>
    );
  },
};

export const Choices: StoryObj = {
  render: function Render() {
    const [regime, setRegime] = useState('new');
    return (
      <Stack width={640}>
        <Section title="Checkbox · radio · switch" note="Switch only for settings that apply immediately.">
          <Checkbox label="Send the offer letter by email" defaultChecked />
          <Checkbox label="Include arrears" description="Adds unpaid amounts from earlier months to this pay run" />
          <Checkbox label="Select all on this page" checked="indeterminate" />
          <Checkbox label="Locked after payroll" disabled checked />
          <FormField label="Tax regime" required>
            <RadioGroup
              aria-label="Tax regime"
              value={regime}
              onChange={setRegime}
              options={[
                { value: 'new', label: 'New regime', description: 'Lower rates, fewer deductions' },
                { value: 'old', label: 'Old regime', description: 'Claim HRA, 80C and other deductions' },
              ]}
            />
          </FormField>
          <Switch label="Allow employees to download payslips" description="Takes effect immediately" defaultChecked />
          <Switch label="Weekend check-in" disabled />
        </Section>
      </Stack>
    );
  },
};

export const Selects: StoryObj = {
  render: function Render() {
    const [loc, setLoc] = useState<string | null>('blr');
    const [dept, setDept] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>(['engineering', 'quality']);
    const [mgr, setMgr] = useState<string | null>('p1');
    return (
      <Stack width={640}>
        <Section title="Select · search appears above 7 options (§16)">
          <FormField label="Work location" required>
            <Select options={LOCATIONS} value={loc} onChange={setLoc} />
          </FormField>
          <FormField label="Department" required error={dept ? null : 'Choose a department'}>
            <Select options={DEPARTMENTS} value={dept} onChange={setDept} placeholder="Choose a department" />
          </FormField>
          <FormField label="Cost centre" optional>
            <Combobox options={DEPARTMENTS} value={null} onChange={() => {}} clearable placeholder="Search cost centres" />
          </FormField>
          <FormField label="Visible to departments">
            <MultiSelect options={DEPARTMENTS} value={tags} onChange={setTags} />
          </FormField>
          <FormField label="Reporting manager" required>
            <PersonPicker people={PEOPLE} value={mgr} onChange={setMgr} />
          </FormField>
        </Section>
      </Stack>
    );
  },
};

export const DatesAndUpload: StoryObj = {
  render: function Render() {
    const [join, setJoin] = useState<Date | null>(new Date(2024, 2, 4));
    const [range, setRange] = useState<DateRange>({ from: new Date(2026, 9, 5), to: new Date(2026, 9, 7) });
    return (
      <Stack width={640}>
        <Section title="Dates · type or pick, always dd MMM yyyy (§35)">
          <FormField label="Joining date" required helper="Type 4/3/2024 or pick from the calendar">
            <DatePicker value={join} onChange={setJoin} />
          </FormField>
          <DateRangePicker label="Leave dates" required value={range} onChange={setRange} helper="3 working days" />
        </Section>
        <Section title="File upload (§31)">
          <FormField label="Offer letter and ID proof" helper="Scanned copies are fine">
            <FileUpload
              accept={['.pdf', '.jpg', '.png']}
              maxSize={5 * 1024 * 1024}
              upload={(file, h) =>
                new Promise((resolve, reject) => {
                  let p = 0;
                  const t = setInterval(() => {
                    p += 20;
                    h.onProgress(p);
                    if (p >= 100) {
                      clearInterval(t);
                      h.onScanning();
                      setTimeout(() => (file.name.includes('fail') ? reject(new Error('The upload stopped. Check your connection and retry')) : resolve()), 800);
                    }
                  }, 250);
                })
              }
            />
          </FormField>
        </Section>
      </Stack>
    );
  },
};

export const AddEmployeeForm: StoryObj = {
  name: 'Example · Add employee',
  render: function Render() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [pan, setPan] = useState('');
    const [ctc, setCtc] = useState<number | null>(null);
    const [join, setJoin] = useState<Date | null>(null);
    const [mgr, setMgr] = useState<string | null>(null);
    const [errors, setErrors] = useState<FormErrorItem[]>([]);
    const [saving, setSaving] = useState(false);
    const dirty = Boolean(name || email || pan || ctc || join || mgr);
    useUnsavedChangesGuard(dirty);
    const err = (id: string) => errors.find((e) => e.fieldId === id)?.message ?? null;

    return (
      <div style={{ maxWidth: 688, background: 'var(--yx-color-bg-surface)', border: '1px solid var(--yx-color-border)', borderRadius: 8 }}>
        <div style={{ padding: 24 }}>
          <Form
            onSubmit={() => {
              const e: FormErrorItem[] = [];
              if (!name.trim()) e.push({ fieldId: 'f-name', message: 'Enter the full name' });
              if (!/^\S+@\S+\.\S+$/.test(email)) e.push({ fieldId: 'f-email', message: 'Enter a work email like name@company.com' });
              if (!join) e.push({ fieldId: 'f-join', message: 'Enter the joining date' });
              if (ctc == null) e.push({ fieldId: 'f-ctc', message: 'Enter the monthly CTC' });
              setErrors(e);
              if (!e.length) {
                setSaving(true);
                setTimeout(() => setSaving(false), 1200);
              }
            }}
          >
            <ErrorSummary errors={errors} />
            <FormSection title="Personal details">
              <FormField id="f-name" label="Full name" required error={err('f-name')} helper="As on PAN card">
                <TextField value={name} onChange={setName} autoComplete="name" />
              </FormField>
              <FormField id="f-email" label="Work email" required error={err('f-email')}>
                <TextField value={email} onChange={setEmail} type="email" />
              </FormField>
              <FormField label="PAN" optional>
                <MaskedField kind="pan" value={pan} onChange={setPan} />
              </FormField>
            </FormSection>
            <FormSection title="Job" description="You can change these later from the Job tab.">
              <FieldRow>
                <FormField id="f-join" label="Joining date" required error={err('f-join')}>
                  <DatePicker value={join} onChange={setJoin} />
                </FormField>
                <FormField label="Work location" required>
                  <Select options={LOCATIONS} value="blr" onChange={() => {}} />
                </FormField>
              </FieldRow>
              <FormField label="Reporting manager" required>
                <PersonPicker people={PEOPLE} value={mgr} onChange={setMgr} />
              </FormField>
              <FormField id="f-ctc" label="Monthly CTC" required error={err('f-ctc')}>
                <CurrencyField value={ctc} onChange={setCtc} />
              </FormField>
            </FormSection>
            <StickySaveBar dirty={dirty} style={{ margin: '0 -24px -24px', borderRadius: '0 0 8px 8px' }}>
              <Button>Cancel</Button>
              <Button variant="primary" type="submit" loading={saving}>
                Add employee
              </Button>
            </StickySaveBar>
          </Form>
        </div>
      </div>
    );
  },
};
