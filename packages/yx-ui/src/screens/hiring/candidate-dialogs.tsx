// HIR-05 candidate dialogs, shared by the candidate list, the candidate record and the pipeline stand-ins: add / edit,
// upload and invite, pick one (assessment, list, job), email. Moved here from the AT4 stand-in so the designed screens
// keep every function it had. Pressed too early, each shows the field error and focuses the field (never disabled).
import { useState } from 'react';
import { Badge, type BadgeTone } from '../../components/display';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { dateText } from '../time/live/kit';
import { CustomFieldInputs, missingRequired, type CustomValues } from './live/fields';
import type { CandidateInput, CandidateRow, Choice, EmailCompose, EmailTemplateChoice, GlobalStage, JobCustomField, UploadInviteResult } from './live/types';

export const STAGE: Record<GlobalStage, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'info' },
  engaged: { label: 'Engaged', tone: 'info' },
  available: { label: 'Available', tone: 'success' },
  offered: { label: 'Offered', tone: 'warning' },
  hired: { label: 'Hired', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export const StageBadge = ({ stage }: { stage: GlobalStage }) => <Badge tone={STAGE[stage].tone}>{STAGE[stage].label}</Badge>;

/** A timestamp as its India date, "3 Nov 2026". */
export const istDay = (iso: string) => dateText(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

/** Add or edit a candidate, with the company's candidate custom fields. */
export function CandidateDialog(p: { candidate: CandidateRow | null; customFields: JobCustomField[]; onClose: () => void; onSave: (input: CandidateInput) => Promise<unknown> }) {
  const c = p.candidate;
  const [name, setName] = useState(c?.name ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [custom, setCustom] = useState<CustomValues>(c?.customFields ?? {});
  const [tried, setTried] = useState(false);
  const emailBad = email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && p.onClose()}
      title={c ? `Edit ${c.name}` : 'Add candidate'}
      confirmLabel={c ? 'Save' : 'Add candidate'}
      onConfirm={async () => {
        setTried(true);
        if (!name.trim()) return (focus('cd-name'), false);
        if (!email.trim() || emailBad) return (focus('cd-email'), false);
        if (missingRequired(p.customFields, custom).length) return false;
        await p.onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, customFields: Object.keys(custom).length ? custom : undefined });
        p.onClose();
      }}
    >
      <FormField id="cd-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
        <TextField value={name} onChange={setName} maxLength={200} />
      </FormField>
      <FormField id="cd-email" label="Email" required error={emailBad ? 'Enter a valid email address.' : tried && !email.trim() ? 'Enter the email address.' : null}>
        <TextField type="email" value={email} onChange={setEmail} maxLength={254} />
      </FormField>
      <FormField id="cd-phone" label="Phone" optional>
        <TextField type="tel" value={phone} onChange={setPhone} maxLength={30} />
      </FormField>
      <CustomFieldInputs fields={p.customFields} values={custom} onChange={setCustom} idPrefix="cd" tried={tried} />
    </ConfirmDialog>
  );
}

/** Add candidates from a spreadsheet and invite them to an assessment in one go. */
export function UploadInviteDialog(p: { exams: Choice[]; onClose: () => void; onDownloadTemplate: () => Promise<unknown>; onUploadInvite: (examId: string, file: File) => Promise<UploadInviteResult> }) {
  const [exam, setExam] = useState<string | null>(null);
  const [needExam, setNeedExam] = useState(false);
  const [result, setResult] = useState<UploadInviteResult | null>(null);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title="Upload and invite" confirmLabel="Close" onConfirm={() => p.onClose()}>
      <Text as="p" tone="secondary">New emails become candidates; known ones are invited.</Text>
      <div>
        <Button size="sm" onClick={() => void p.onDownloadTemplate()}>Download the template</Button>
      </div>
      <FormField id="cd-up-exam" label="Assessment" required error={needExam && !exam ? 'Choose the assessment first.' : null}>
        <Select aria-label="Assessment" value={exam} onChange={setExam} options={p.exams} searchable />
      </FormField>
      <FormField id="cd-up-file" label="Candidate file" required helper="Excel (.xlsx) or CSV, up to 5 MB.">
        <FileUpload
          id="cd-up-file"
          accept={['.xlsx', '.csv']}
          maxSize={5 * 1024 * 1024}
          multiple={false}
          upload={async (file) => {
            if (!exam) {
              setNeedExam(true);
              focus('cd-up-exam');
              throw new Error('Choose the assessment first, then add the file again.');
            }
            setResult(await p.onUploadInvite(exam, file));
          }}
        />
      </FormField>
      {result && (
        <InlineAlert tone={result.errors.length ? 'warning' : 'success'} title={`Invited ${result.invited}${result.skipped ? `, skipped ${result.skipped}` : ''}`}>
          {result.errors.length ? result.errors.slice(0, 10).map((e) => `Row ${e.row}: ${e.message}`).join(' · ') : 'Every row was read.'}
        </InlineAlert>
      )}
    </ConfirmDialog>
  );
}

/** Choose one thing (an assessment, a list, a job) and confirm. */
export function PickDialog(p: { title: string; label: string; options: Choice[]; confirm: string; note?: string; onClose: () => void; onConfirm: (value: string) => Promise<void> }) {
  const [value, setValue] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && p.onClose()}
      title={p.title}
      confirmLabel={p.confirm}
      onConfirm={async () => {
        setTried(true);
        if (!value) return (focus('cd-pick'), false);
        await p.onConfirm(value);
        p.onClose();
      }}
    >
      {p.note && <Text as="p" tone="secondary">{p.note}</Text>}
      <FormField id="cd-pick" label={p.label} required error={tried && !value ? `Choose the ${p.label.toLowerCase()}.` : null}>
        <Select aria-label={p.label} value={value} onChange={setValue} options={p.options} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

/** Email one or many candidates from a template (they get their own name and links). */
export function EmailDialog(p: { count: number; templates: EmailTemplateChoice[]; senders: Choice[]; onClose: () => void; onSend: (c: EmailCompose) => Promise<void> }) {
  const [template, setTemplate] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const pick = (v: string | null) => {
    setTemplate(v);
    const t = p.templates.find((x) => x.value === v);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  };
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && p.onClose()}
      title={p.count === 1 ? 'Email the candidate' : `Email ${p.count} candidates`}
      confirmLabel="Send"
      onConfirm={async () => {
        setTried(true);
        if (!subject.trim()) return (focus('hc-subj'), false);
        if (!body.trim()) return (focus('hc-body'), false);
        const t = p.templates.find((x) => x.value === template);
        await p.onSend({ templateId: t && !t.value.startsWith('default-') ? t.value : null, subject: subject.trim(), body, ...(sender ? { senderAddressId: sender } : {}) });
        p.onClose();
      }}
    >
      <FormField id="hc-tpl" label="Template" optional>
        <Select aria-label="Template" value={template} onChange={pick} options={p.templates.map((t) => ({ value: t.value, label: t.label }))} clearable />
      </FormField>
      {p.senders.length > 0 && (
        <FormField id="hc-from" label="From" optional>
          <Select aria-label="From" value={sender} onChange={setSender} options={p.senders} clearable />
        </FormField>
      )}
      <FormField id="hc-subj" label="Subject" required error={tried && !subject.trim() ? 'Enter a subject.' : null}>
        <TextField value={subject} onChange={setSubject} maxLength={300} />
      </FormField>
      <FormField id="hc-body" label="Message" required helper="{{candidateName}}, {{jobTitle}}, {{orgName}} and {{statusLink}} are filled in for each candidate." error={tried && !body.trim() ? 'Enter a message.' : null}>
        <TextArea value={body} onChange={setBody} rows={8} maxLength={20000} />
      </FormField>
    </ConfirmDialog>
  );
}
