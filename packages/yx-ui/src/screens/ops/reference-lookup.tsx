import { useState } from 'react';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { DescriptionList } from '../../components/shell';

/** Answer 947: what a Not found reference tells support. Never whether the record exists, anywhere. */
export interface NotFoundLookup {
  code: string;
  at: string;
  /** Who saw it (name or email), or null when the person is gone. */
  who: string | null;
  /** The page or address they opened, without the query. */
  path: string;
}

const CODE = /^NF-[A-Z2-9]{6}$/;

/** Support types the reference a person read out from a Not found page and sees who, when and where. */
export function ReferenceLookupDialog({ onLookUp, onClose, initialCode = '', initialResult = null }: { onLookUp: (code: string) => Promise<NotFoundLookup>; onClose: () => void; initialCode?: string; initialResult?: NotFoundLookup | null }) {
  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<NotFoundLookup | null>(initialResult);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = code.trim().toUpperCase();
  const early = useTooEarly(CODE.test(clean) ? [] : [{ fieldId: 'nf-code', message: 'Type the reference as shown, like NF-7KQ2MP.' }]);
  const look = async () => {
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await onLookUp(clean));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not look it up.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Look up a Not found reference"
      description="The reference on a Not found page says who saw it, when and on which page. It never says whether the record exists."
      notice={error && <InlineAlert tone="danger" title={error} />}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} onClick={() => void look()}>
            Look up
          </Button>
        </>
      }
    >
      <FormField id="nf-code" label="Reference" required error={early.errorOf('nf-code')}>
        <TextField value={code} onChange={setCode} placeholder="NF-7KQ2MP" maxLength={12} />
      </FormField>
      {found && (
        <DescriptionList
          items={[
            { label: 'Reference', value: found.code },
            { label: 'When', value: new Date(found.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) },
            { label: 'Who', value: found.who ?? 'A person no longer in the company' },
            { label: 'Page', value: found.path },
          ]}
        />
      )}
    </Dialog>
  );
}
