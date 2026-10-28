import '../components/editor.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RichTextEditor, DEFAULT_MERGE_FIELDS, type EditorTool } from '../components/editor';
import { FormField } from '../components/field';
import { Button } from '../components/button';

const meta: Meta = { title: 'Builders/Rich text editor', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const OFFER = `<h2>Offer of employment</h2>
<p>Dear {{employee.name}},</p>
<p>We are pleased to offer you the position of <strong>{{employee.designation}}</strong> at {{company.name}}, starting on {{employee.joining_date}}. You will report to {{manager.name}}.</p>
<h3>Compensation</h3>
<p>Your annual cost to company is <span style="color: #2F5496">{{employee.ctc}}</span>, paid monthly. The break-up is attached as <mark data-color="#FFFF00" style="background-color: #FFFF00; color: inherit">Annexure A</mark>. <s>Joining bonus</s> <em>Not offered for this role.</em></p>
<blockquote><p>{{#probation}}You will be on probation for six months.{{/probation}}</p></blockquote>
<ul><li><p>Probation: 6 months from your joining date</p></li><li><p>Notice period: 60 days after confirmation</p></li><li><p>Work location: Hosur plant, Tamil Nadu</p></li></ul>
<p>Please sign and return this letter by 10 Oct 2026. Read our <a href="https://careers.example.in/policies">employee policies</a> before you join.</p>
<p>Regards,<br>Lakshmi Venkatesan<br>Head of People, Ashoka Precision Components Pvt Ltd</p>`;

const FIELDS = [
  ...DEFAULT_MERGE_FIELDS,
  { value: 'employee.employee_code', label: 'Employee ID' },
  { value: 'employee.work_location', label: 'Work location' },
];

function OfferDemo({ readOnly, error, initial = OFFER, disabled, hide, width = 760 }: { readOnly?: boolean; error?: string; initial?: string; disabled?: boolean; hide?: EditorTool[]; width?: number }) {
  const [html, setHtml] = useState(initial);
  return (
    <div style={{ maxWidth: width }}>
      <FormField label="Offer letter body" required helper="Merge fields are filled in for each candidate when the letter is generated." error={error}>
        <RichTextEditor value={html} onChange={setHtml} mergeFields={FIELDS} readOnly={readOnly} disabled={disabled} hide={hide} placeholder="Write the letter. Use Insert field for names and dates." />
      </FormField>
    </div>
  );
}

export const OfferLetter: S = { name: 'Offer letter with merge fields', render: () => <OfferDemo /> };
export const Letter: S = { name: 'Letter (Code hidden)', render: () => <OfferDemo hide={['code']} /> };
export const Narrow: S = { name: 'Narrow: buttons move into More formatting', render: () => <OfferDemo width={420} /> };
export const ReadOnly: S = { name: 'Read-only', render: () => <OfferDemo readOnly /> };
export const WithError: S = { name: 'Error', render: () => <OfferDemo initial="" error="Enter the letter body. Candidates can't sign an empty letter." /> };
export const Empty: S = { name: 'Empty with placeholder', render: () => <OfferDemo initial="" /> };
export const Disabled: S = { name: 'Disabled', render: () => <OfferDemo disabled /> };
export const WithoutMergeFields: S = {
  name: 'Message without merge fields',
  render: () => {
    const [html, setHtml] = useState('<p>Hi team, the Diwali holiday list for 2026 is now in the app.</p>');
    return (
      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormField label="Announcement">
          <RichTextEditor value={html} onChange={setHtml} mergeFields={[]} />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button>Cancel</Button>
          <Button variant="primary">Post announcement</Button>
        </div>
      </div>
    );
  },
};
export const ToolbarFocus: S = {
  name: 'Toolbar button focus',
  parameters: { pseudo: { focusVisible: ['.yx-editor__tools .yx-button:first-child'] } },
  render: () => <OfferDemo />,
};
export const Mobile: S = {
  name: 'Mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <OfferDemo />,
};
