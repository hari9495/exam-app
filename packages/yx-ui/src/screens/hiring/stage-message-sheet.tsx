// Settings 6.1 Hiring › Stage message templates (answer 2434, retiring /v2): the email, SMS and WhatsApp wording a
// recruiter sends from the hiring screens. A template may belong to a pipeline stage: moving a candidate to that stage
// then offers it (Ask before sending) or sends it on its own (Send automatically). Saved straight away through the
// template APIs; a standard template, once changed, is saved as the company's own copy, and deleting that copy brings
// the standard wording back for that stage.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import type { Choice } from './live/types';
import './hiring.css';

export type MessageChannel = 'email' | 'sms' | 'whatsapp';
export type MessageSending = 'manual' | 'prompt' | 'auto';

/** One template from GET /candidate-email-templates, /candidate-sms-templates or /candidate-whatsapp-templates. */
export interface StageMessageView {
  channel: MessageChannel;
  /** null: the standard wording, not changed by the company yet. */
  id: string | null;
  name: string;
  triggerStageId: string | null;
  triggerMode: MessageSending;
  /** Email only. */
  subject?: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface StageMessageInput {
  name: string;
  triggerStageId: string | null;
  triggerMode: MessageSending;
  subject?: string;
  body: string;
  enabled: boolean;
}

export const CHANNEL_LABEL: Record<MessageChannel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
export const SENDING_LABEL: Record<MessageSending, string> = { manual: 'Sent by hand', prompt: 'Ask before sending', auto: 'Send automatically' };
/** The API's limits (the upsert DTOs). */
const BODY_MAX: Record<MessageChannel, number> = { email: 8000, sms: 1600, whatsapp: 1600 };
const MERGE = ['{{candidateName}}', '{{jobTitle}}', '{{orgName}}', '{{recruiterName}}'];
const NO_STAGE = 'none';
const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

/** The 6.1 list row for a template: name, channel, stage and how it is sent. */
export function stageMessageRow(t: StageMessageView, stageName: (id: string) => string | undefined): string[] {
  const stage = t.triggerStageId ? (stageName(t.triggerStageId) ?? 'A stage no longer used') : 'No stage';
  const sending = t.triggerStageId ? SENDING_LABEL[t.triggerMode] : SENDING_LABEL.manual;
  return [t.name, CHANNEL_LABEL[t.channel], stage, [sending, !t.enabled ? 'Off' : null, t.isDefault ? 'Standard wording' : null].filter(Boolean).join(' · ')];
}

export interface StageMessageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null: a new template. */
  template: StageMessageView | null;
  /** Every stage of the company's pipelines, labelled with the pipeline. */
  stages: Choice[];
  /** The viewer may change templates (the pipelines key, not acting for someone else); otherwise read-only. */
  canEdit: boolean;
  onSave?: (channel: MessageChannel, id: string | null, input: StageMessageInput) => Promise<unknown>;
  /** Deletes the company's own template (for a changed standard one: the standard wording comes back). */
  onDelete?: (channel: MessageChannel, id: string) => Promise<unknown>;
}

export function StageMessageSheet({ open, onOpenChange, template, stages, canEdit, onSave, onDelete }: StageMessageSheetProps) {
  const toast = useToastIfAny();
  const [channel, setChannel] = useState<MessageChannel>(template?.channel ?? 'email');
  const [name, setName] = useState(template?.name ?? '');
  const [stage, setStage] = useState<string>(template?.triggerStageId ?? NO_STAGE);
  const [sending, setSending] = useState<MessageSending>(template?.triggerStageId ? template.triggerMode : 'prompt');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [enabled, setEnabled] = useState(template?.enabled ?? true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const max = BODY_MAX[channel];
  const bodyBad = !body.trim() || body.length > max;
  const staged = stage !== NO_STAGE;

  const save = async () => {
    setTried(true);
    setFailed(null);
    if (!name.trim()) return focus('sm-name');
    if (channel === 'email' && !subject.trim()) return focus('sm-subject');
    if (bodyBad) return focus('sm-body');
    setBusy(true);
    try {
      await onSave?.(channel, template?.id ?? null, {
        name: name.trim(),
        triggerStageId: staged ? stage : null,
        triggerMode: staged ? sending : 'manual',
        ...(channel === 'email' ? { subject: subject.trim() } : {}),
        body: body.trim(),
        enabled,
      });
      toast?.toast({ tone: 'success', title: 'Message template saved', description: 'The hiring screens use it from now on.' });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = !template ? 'Add message template' : !canEdit ? template.name : `Edit ${template.name}`;
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        subtitle="Stage message templates"
        dirty={canEdit}
        notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
        footer={
          canEdit ? (
            <>
              {template?.id && onDelete && (
                <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
                  Delete template
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                Save template
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )
        }
      >
        <div className="yx-hire-stack">
          <Text as="p" size="sm" tone="secondary">
            Recruiters pick these when they email, text or WhatsApp a candidate. A template tied to a stage is offered, or sent, when a candidate moves to that stage.
          </Text>
          {template?.isDefault && canEdit && <InlineAlert tone="info" title="This is the standard wording. Your changes are saved as your company's own copy." />}
          <FormField id="sm-channel" label="Sent by">
            <Segment
              label="Sent by"
              value={channel}
              disabled={!canEdit || Boolean(template)}
              onChange={(v) => {
                setChannel(v);
                setFailed(null);
              }}
              options={(['email', 'sms', 'whatsapp'] as const).map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
            />
          </FormField>
          <FormField id="sm-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
            <TextField value={name} onChange={setName} maxLength={200} disabled={!canEdit} />
          </FormField>
          <FormField id="sm-stage" label="Stage" helper="No stage: recruiters choose it by hand.">
            <Select value={stage} onChange={(v) => setStage(v ?? NO_STAGE)} options={[{ value: NO_STAGE, label: 'No stage' }, ...stages]} searchable disabled={!canEdit} />
          </FormField>
          {staged && (
            <FormField id="sm-sending" label="When a candidate moves to this stage">
              <Segment
                label="When a candidate moves to this stage"
                value={sending}
                disabled={!canEdit}
                onChange={setSending}
                options={(['manual', 'prompt', 'auto'] as const).map((m) => ({ value: m, label: SENDING_LABEL[m] }))}
              />
            </FormField>
          )}
          {channel === 'email' && (
            <FormField id="sm-subject" label="Subject" required error={tried && !subject.trim() ? 'Enter the subject.' : null}>
              <TextField value={subject} onChange={setSubject} maxLength={300} disabled={!canEdit} />
            </FormField>
          )}
          <FormField
            id="sm-body"
            label="Message"
            required
            helper={`You can use ${MERGE.join(', ')}. ${body.length} of ${max} characters.`}
            error={tried && !body.trim() ? 'Enter the message.' : tried && body.length > max ? `Keep it to ${max} characters.` : null}
          >
            <TextArea value={body} onChange={setBody} rows={channel === 'email' ? 8 : 5} disabled={!canEdit} />
          </FormField>
          <Checkbox checked={enabled} onChange={setEnabled} disabled={!canEdit} label="Turned on" description="Off: recruiters do not see it, and it is never sent automatically." />
        </div>
      </Drawer>
      {template?.id && deleting && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeleting(false)}
          title={`Delete ${template.name}?`}
          consequence="Recruiters no longer see it; where the stage has standard wording, that is used again. Messages already sent are kept, and the template stays in the recycle bin for a while."
          confirmLabel="Delete template"
          onConfirm={async () => {
            try {
              await onDelete?.(template.channel, template.id!);
              toast?.toast({ tone: 'success', title: 'Message template deleted' });
              setDeleting(false);
              onOpenChange(false);
            } catch (e) {
              setDeleting(false);
              setFailed(e instanceof Error && e.message ? e.message : 'That did not delete. Try again.');
            }
          }}
        />
      )}
    </>
  );
}
