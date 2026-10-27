'use client';

import { useRef, useState } from 'react';
import { Button, DatePicker, Dialog, FormField, InlineAlert, Select, Text } from '@yukthix/ui';

// PPL-03 Documents (founder 22 Oct 2026): HR uploads a document for the person in three steps — the type, the file
// (and the expiry date for a type that tracks one), then an explicit Upload. Nothing is sent before Upload, and a
// refusal (wrong type, too big, virus check, a missing expiry) shows here in plain words, never as a crash.

export interface AskableType {
  key: string;
  name: string;
  /** The API needs the expiry date for this type (e.g. Passport). */
  expiryTracked?: boolean;
}

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX = 10 * 1024 * 1024;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Try again in a moment.');
/** Runs a page action; a refusal goes to `show` in plain words instead of an uncaught error (the row stays as it was). */
export const reportErrors = (run: () => unknown, show: (message: string) => void): Promise<void> => Promise.resolve().then(run).then(() => undefined, (e) => show(errorText(e)));

export function UploadDocDialog({ name, types, onUpload, onClose }: { name: string; types: AskableType[]; onUpload: (typeKey: string, file: File, expiresOn: string | null) => Promise<void>; onClose: () => void }) {
  const [type, setType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const chosen = types.find((t) => t.key === type);
  const today = new Date();
  const ready = Boolean(chosen && file && (!chosen.expiryTracked || expires));

  const pick = (f: File | null) => {
    setError(null);
    if (f && !ACCEPT.includes(f.type)) return setError('Choose a PDF, PNG or JPEG file.'), setFile(null);
    if (f && f.size > MAX) return setError('The file is larger than 10 MB.'), setFile(null);
    setFile(f);
  };
  const upload = async () => {
    if (!chosen || !file) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(chosen.key, file, chosen.expiryTracked && expires ? iso(expires) : null);
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
      onOpenChange={(o) => !o && onClose()}
      title={`Upload a document for ${name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void upload()} disabled={!ready || busy} loading={busy}>
            Upload
          </Button>
        </>
      }
    >
      <FormField label="Document" required>
        <Select aria-label="Document" options={types.map((t) => ({ value: t.key, label: t.name }))} value={type} onChange={(v) => (setType(v), setExpires(null))} searchable />
      </FormField>
      {chosen && (
        <FormField label="File" required helper="PDF or an image, up to 10 MB. It is checked for viruses before anyone can open it.">
          <div className="yx-ppl__stack">
            <input ref={input} type="file" accept={ACCEPT.join(',')} hidden aria-label="File" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <div>
              <Button size="sm" onClick={() => input.current?.click()}>
                {file ? 'Choose another file' : 'Choose file'}
              </Button>
            </div>
            {file && <Text size="sm">{file.name}</Text>}
          </div>
        </FormField>
      )}
      {chosen?.expiryTracked && (
        <FormField label="Expiry date" required>
          <DatePicker aria-label="Expiry date" value={expires} onChange={setExpires} min={today} />
        </FormField>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </Dialog>
  );
}
