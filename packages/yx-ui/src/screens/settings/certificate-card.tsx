// Settings 6.5 Assessments › Pass certificate (answer 2424, retiring /v2): the wording on the certificate a candidate who
// passes a test can download. The layout is fixed; the company writes the title, the text (with merge fields) and who
// signs it, or turns its own wording off (the standard wording is then used). Saved straight away through its own API.
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { Card, DescriptionList } from '../../components/shell';
import './settings.css';

/** GET /certificate-template. */
export interface CertificateTemplateView {
  title: string;
  bodyText: string;
  signatoryName: string | null;
  enabled: boolean;
  /** The standard wording: the company has not saved its own. */
  isDefault: boolean;
}
export interface CertificateTemplateInput {
  title: string;
  bodyText: string;
  signatoryName?: string;
  enabled: boolean;
}

const MERGE = ['{{candidateName}}', '{{examTitle}}', '{{orgName}}', '{{scorePercent}}', '{{date}}'];
const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

export interface CertificateCardProps {
  template: CertificateTemplateView;
  /** The assessments settings key, not acting for someone else; otherwise read-only. */
  canEdit: boolean;
  onSave?: (input: CertificateTemplateInput) => Promise<unknown>;
  /** Opens the sheet at once (stories). */
  defaultOpen?: boolean;
}

/** The 6.5 section: what the certificate says, with Edit opening the sheet. */
export function CertificateCard({ template, canEdit, onSave, defaultOpen = false }: CertificateCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card
      title="Pass certificate"
      actions={
        canEdit ? (
          <Button size="sm" icon={Pencil} onClick={() => setOpen(true)}>
            Edit certificate
          </Button>
        ) : undefined
      }
    >
      <div className="yx-set-stack">
        <Text as="p" size="sm" tone="secondary">
          A candidate who passes a test with certificates turned on can download it. The layout is fixed; the wording is yours.
        </Text>
        <DescriptionList
          items={[
            { label: 'Wording', value: template.isDefault ? <Badge tone="neutral">Standard wording</Badge> : template.enabled ? <Badge tone="success">Your wording</Badge> : <Badge tone="warning">Your wording is off: the standard wording is used</Badge> },
            { label: 'Title', value: template.title },
            { label: 'Text', value: template.bodyText },
            { label: 'Signed by', value: template.signatoryName || 'No name' },
          ]}
        />
      </div>
      {open && <CertificateSheet template={template} canEdit={canEdit} onSave={onSave} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function CertificateSheet({ template, canEdit, onSave, onClose }: { template: CertificateTemplateView; canEdit: boolean; onSave?: CertificateCardProps['onSave']; onClose: () => void }) {
  const toast = useToastIfAny();
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.bodyText);
  const [signatory, setSignatory] = useState(template.signatoryName ?? '');
  const [enabled, setEnabled] = useState(template.enabled);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bodyBad = !body.trim() || body.length > 4000;

  const save = async () => {
    setTried(true);
    setFailed(null);
    if (!title.trim()) return focus('cert-title');
    if (bodyBad) return focus('cert-body');
    setBusy(true);
    try {
      await onSave?.({ title: title.trim(), bodyText: body.trim(), ...(signatory.trim() ? { signatoryName: signatory.trim() } : {}), enabled });
      toast?.toast({ tone: 'success', title: 'Certificate saved', description: 'Certificates downloaded from now on use it.' });
      onClose();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit pass certificate"
      subtitle="Settings › Assessments"
      dirty={canEdit}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save certificate
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        {template.isDefault && <InlineAlert tone="info" title="This is the standard wording. Saving keeps your company's own copy." />}
        <FormField id="cert-title" label="Title" required error={tried && !title.trim() ? 'Enter the title.' : null}>
          <TextField value={title} onChange={setTitle} maxLength={300} />
        </FormField>
        <FormField
          id="cert-body"
          label="Text"
          required
          helper={`You can use ${MERGE.join(', ')}. ${body.length} of 4000 characters.`}
          error={tried && !body.trim() ? 'Enter the text.' : tried && body.length > 4000 ? 'Keep it to 4000 characters.' : null}
        >
          <TextArea value={body} onChange={setBody} rows={5} />
        </FormField>
        <FormField id="cert-sign" label="Signed by" optional helper="The name printed under the signature line.">
          <TextField value={signatory} onChange={setSignatory} maxLength={200} />
        </FormField>
        <Checkbox checked={enabled} onChange={setEnabled} label="Use this wording" description="Off: certificates use the standard wording until you turn it on again." />
      </div>
    </Drawer>
  );
}
