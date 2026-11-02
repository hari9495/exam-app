// PPL-03 person record: the small dialogs HR opens from the record (work phone, documents). Each is the one live
// dialog; the PPL-03 stories draw its states with sample data. Pressed too early: a field error and focus on the field.
// A refusal from the server shows inside the dialog, which stays open; the page shows the toast when it is done.
import { useRef, useState } from 'react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { dayKey } from '../../lib/dates';
import { errorText } from '../org/org-kit';

/** A document type HR can ask for or upload. `expiryTracked`: the API needs the expiry date (e.g. Passport). */
export interface AskableType {
  key: string;
  name: string;
  expiryTracked?: boolean;
}

/** At least 7 digits; digits, spaces, brackets, dashes and one leading +. Empty clears the number. */
export const workPhoneOk = (v: string) => !v.trim() || (/^\+?[\d\s()-]{7,30}$/.test(v.trim()) && (v.match(/\d/g)?.length ?? 0) >= 7);

/** HR sets or clears the company phone shown on the record and in the directory. */
export function WorkPhoneDialog({ name, initial, onSave, onClose }: { name: string; initial: string | null; onSave: (phone: string | null) => Promise<void>; onClose: () => void }) {
  const [phone, setPhone] = useState(initial ?? '');
  const early = useTooEarly(workPhoneOk(phone) ? [] : [{ fieldId: 'wp-phone', message: 'Enter the number with the country code, e.g. +91 44 4012 3142.' }]);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Work phone for ${name}`}
      consequence="The company line shown on the record and in the directory. Leave it empty to clear it."
      confirmLabel="Save"
      onConfirm={async () => {
        if (early.stop()) return false;
        await onSave(phone.trim() || null);
      }}
    >
      <FormField id="wp-phone" label="Work phone" optional helper="With the country code, e.g. +91 44 4012 3142." error={early.errorOf('wp-phone')}>
        <TextField type="tel" value={phone} onChange={setPhone} maxLength={30} />
      </FormField>
    </ConfirmDialog>
  );
}

/** HR asks the person to upload a document; they get an email and see it in My documents. */
export function AskDocumentDialog({ name, types, onRequest, onClose }: { name: string; types: AskableType[]; onRequest: (typeKey: string, typeName: string) => Promise<void>; onClose: () => void }) {
  const [type, setType] = useState<string | null>(null);
  const early = useTooEarly(type ? [] : [{ fieldId: 'rq-type', message: 'Choose the document to ask for.' }]);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Ask ${name} to upload a document`}
      consequence={`${name} gets an email and sees it in My documents.`}
      confirmLabel="Send request"
      onConfirm={async () => {
        if (early.stop()) return false;
        await onRequest(type!, types.find((x) => x.key === type)?.name ?? 'document');
      }}
    >
      <FormField id="rq-type" label="Document" required error={early.errorOf('rq-type')}>
        <Select aria-label="Document" value={type} onChange={setType} options={types.map((x) => ({ value: x.key, label: x.name }))} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

export const SEND_BACK_REASONS = ['Name does not match the record', 'Image is unclear', 'Wrong document type', 'Expired document'];

/** HR sends an uploaded document back; the person is asked to upload it again and sees the reason and message. */
export function SendBackDialog({ name, docType, onSendBack, onClose }: { name: string; docType: string; onSendBack: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const early = useTooEarly(reason ? [] : [{ fieldId: 'rj-reason', message: 'Choose a reason.' }]);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Send ${docType} back to ${name}?`}
      consequence={`${name} is asked to upload it again and sees your reason and message.`}
      confirmLabel="Send back"
      destructive
      onConfirm={async () => {
        if (early.stop()) return false;
        await onSendBack([reason, message.trim()].filter(Boolean).join('. '));
      }}
    >
      <FormField id="rj-reason" label="Reason" required error={early.errorOf('rj-reason')}>
        <Select aria-label="Reason" value={reason} onChange={setReason} options={SEND_BACK_REASONS.map((x) => ({ value: x, label: x }))} />
      </FormField>
      <FormField id="rj-msg" label={`Message to ${name}`} optional helper="Say what to upload instead.">
        <TextArea value={message} onChange={setMessage} rows={3} maxLength={400} />
      </FormField>
    </ConfirmDialog>
  );
}

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX = 10 * 1024 * 1024;

/**
 * HR uploads a document for the person (founder 22 Oct 2026): the type, the file (and the expiry date for a type that
 * tracks one), then Upload. Nothing is sent before Upload; a wrong file, a missing expiry or a refusal shows here.
 */
export function UploadForPersonDialog({ name, types, onUpload, onClose, today = new Date() }: { name: string; types: AskableType[]; onUpload: (typeKey: string, file: File, expiresOn: string | null) => Promise<void>; onClose: () => void; today?: Date }) {
  const [type, setType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [expires, setExpires] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const chosen = types.find((t) => t.key === type);
  const early = useTooEarly([
    ...(chosen ? [] : [{ fieldId: 'up-type', message: 'Choose the document.' }]),
    ...(chosen && !file ? [{ fieldId: 'up-file', message: 'Choose the file to upload.' }] : []),
    ...(chosen?.expiryTracked && !expires ? [{ fieldId: 'up-expiry', message: 'Enter the expiry date.' }] : []),
  ]);
  const pick = (f: File | null) => {
    setError(null);
    setFileError(null);
    if (f && !ACCEPT.includes(f.type)) return setFileError('Choose a PDF, PNG or JPEG file.'), setFile(null);
    if (f && f.size > MAX) return setFileError('The file is larger than 10 MB. Choose a smaller one.'), setFile(null);
    setFile(f);
  };
  const upload = async () => {
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(chosen!.key, file!, chosen!.expiryTracked && expires ? dayKey(expires) : null);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      size="md"
      title={`Upload a document for ${name}`}
      notice={error ? <InlineAlert tone="danger" title="Not uploaded">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void upload()} loading={busy}>
            Upload
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        <FormField id="up-type" label="Document" required error={early.errorOf('up-type')}>
          <Select aria-label="Document" options={types.map((t) => ({ value: t.key, label: t.name }))} value={type} onChange={(v) => (setType(v), setExpires(null))} searchable />
        </FormField>
        {chosen && (
          <FormField id="up-file" label="File" required helper="PDF or an image, up to 10 MB. It is checked for viruses before anyone can open it." error={early.errorOf('up-file')}>
            <div className="yx-ppl__stack">
              <input ref={input} type="file" accept={ACCEPT.join(',')} hidden aria-label="File" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <div>
                <Button size="sm" id="up-file" onClick={() => input.current?.click()}>
                  {file ? 'Choose another file' : 'Choose file'}
                </Button>
              </div>
              {file && <Text size="sm">{file.name}</Text>}
              {/* Shown apart from the field error: choosing a file counts as typing in the field, which hides that. */}
              {fileError && <InlineAlert tone="danger">{fileError}</InlineAlert>}
            </div>
          </FormField>
        )}
        {chosen?.expiryTracked && (
          <FormField id="up-expiry" label="Expiry date" required error={early.errorOf('up-expiry')}>
            <DatePicker aria-label="Expiry date" value={expires} onChange={setExpires} min={today} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
