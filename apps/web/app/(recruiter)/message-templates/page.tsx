'use client';

import { useState } from 'react';
import { Button, Input, Select, Checkbox, Table, Modal, useToast, type Column, type SelectOption } from '../../../components/ui';
import { PageHeader, PageSurface } from '../../../components/PageChrome';
import { useAuth } from '../../../lib/auth-context';
import { useMessageTemplates, useUpsertTemplate, useSetTemplateEnabled, useDeleteTemplate } from '../../../lib/hooks/useCandidateMessages';
import { useIntegrations } from '../../../lib/hooks/useIntegrations';
import { CandidateEmailTemplate, PIPELINE_STAGES, PipelineStage, STAGE_LABEL } from '../../../lib/types';

const TRIGGER_MODE_OPTIONS: SelectOption[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'prompt', label: 'Prompt before sending' },
  { value: 'auto', label: 'Send automatically' },
];

// 'none' stands in for triggerEvent: null in the <Select> -- Radix Select can't hold an empty-
// string/null value, so it's translated back to null right before the mutation fires.
const TRIGGER_EVENT_OPTIONS: SelectOption[] = [
  ...PIPELINE_STAGES.map((stage) => ({ value: stage, label: STAGE_LABEL[stage] })),
  { value: 'rejected', label: 'Rejected' },
  { value: 'none', label: 'None (manual only)' },
];

const MERGE_TOKENS = ['candidateName', 'jobTitle', 'orgName', 'recruiterName', 'statusLink'];

function triggerEventLabel(event: string | null): string {
  if (event === null) return 'None (manual only)';
  if (event === 'rejected') return 'Rejected';
  return STAGE_LABEL[event as PipelineStage] ?? event;
}

function EditTemplateModal({ template, onClose }: { template: CandidateEmailTemplate; onClose: () => void }) {
  const upsert = useUpsertTemplate();
  const { toast } = useToast();
  const [name, setName] = useState(template.name);
  const [triggerEvent, setTriggerEvent] = useState(template.triggerEvent ?? 'none');
  const [triggerMode, setTriggerMode] = useState<'manual' | 'prompt' | 'auto'>(template.triggerMode);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);

  function insertToken(token: string) {
    setBody((current) => `${current}{{${token}}}`);
  }

  function handleSave() {
    upsert.mutate(
      {
        id: template.id ?? undefined,
        name: name.trim(),
        triggerEvent: triggerEvent === 'none' ? null : triggerEvent,
        triggerMode,
        subject: subject.trim(),
        body: body.trim(),
      },
      {
        onSuccess: () => {
          toast('Template saved.');
          onClose();
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save template.', 'error'),
      },
    );
  }

  const canSave = Boolean(name.trim() && subject.trim() && body.trim());

  return (
    <Modal
      open
      title={`Edit "${template.name}"`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={upsert.isPending} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={setName} required />
        <Select label="Trigger event" value={triggerEvent} onChange={setTriggerEvent} options={TRIGGER_EVENT_OPTIONS} />
        <Select
          label="Trigger mode"
          value={triggerMode}
          onChange={(value) => setTriggerMode(value as 'manual' | 'prompt' | 'auto')}
          options={TRIGGER_MODE_OPTIONS}
        />
        <Input label="Subject" value={subject} onChange={setSubject} required />
        <div className="flex flex-col gap-1">
          <label htmlFor="template-body" className="text-sm font-medium text-gray-700">
            Body
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MERGE_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="rounded border border-rule px-2 py-0.5 text-xs text-ink hover:bg-ground"
              >
                {`{{${token}}}`}
              </button>
            ))}
          </div>
          <textarea
            id="template-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

export default function MessageTemplatesPage() {
  const { role } = useAuth();
  const canManage = role !== 'panel';
  const { data: templates, isLoading } = useMessageTemplates();
  // Best-effort: GET /organizations/integrations requires org:manage_settings, so a plain
  // recruiter gets a 403 here -- isSuccess stays false and the banner just doesn't render. It
  // never blocks the page or widens what a recruiter can read.
  const { data: integrations, isSuccess: integrationsLoaded } = useIntegrations();
  const setEnabled = useSetTemplateEnabled();
  const deleteTemplate = useDeleteTemplate();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CandidateEmailTemplate | null>(null);

  const showNoSmtpBanner = integrationsLoaded && integrations?.smtpConfigured === false;

  function handleToggleEnabled(template: CandidateEmailTemplate, next: boolean) {
    if (!template.id) return; // a default row has nothing saved to toggle yet
    setEnabled.mutate(
      { id: template.id, enabled: next },
      { onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update template.', 'error') },
    );
  }

  function handleRestoreDefault(template: CandidateEmailTemplate) {
    if (!template.id) return;
    deleteTemplate.mutate(template.id, {
      onSuccess: () => toast('Restored to default.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to restore default.', 'error'),
    });
  }

  const columns: Column<CandidateEmailTemplate>[] = [
    { key: 'name', header: 'Name', render: (t) => t.name, sortValue: (t) => t.name },
    { key: 'event', header: 'Trigger event', render: (t) => triggerEventLabel(t.triggerEvent) },
    { key: 'mode', header: 'Trigger mode', render: (t) => t.triggerMode },
    {
      key: 'enabled',
      header: 'Enabled',
      render: (t) => (
        <Checkbox label={`Enabled for ${t.name}`} hideLabel checked={t.enabled} onChange={(next) => handleToggleEnabled(t, next)} disabled={!t.id} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (t) => (
        <div className="flex justify-end gap-3">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setEditing(t)}>
            Edit
          </button>
          {!t.isDefault && t.id && (
            <button type="button" className="text-xs font-medium text-status-danger hover:underline" onClick={() => handleRestoreDefault(t)}>
              Restore default
            </button>
          )}
        </div>
      ),
    },
  ];

  if (!canManage) {
    return <p className="text-sm text-muted">You don&apos;t have access to this page.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-muted">Loading&hellip;</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="COMMUNICATION"
        title="Message Templates"
        subtitle="Control what candidates are emailed at each pipeline stage. Edit a default template to override it for your organization, or restore it to fall back to the built-in copy."
      />

      {showNoSmtpBanner && (
        <div className="rounded-md bg-status-warning-bg p-3 text-sm text-status-warning">
          Candidate emails won&apos;t send until SMTP is configured in Organization settings.
        </div>
      )}

      <PageSurface className="p-4">
        <Table columns={columns} rows={templates ?? []} rowKey={(t) => t.id ?? `default-${t.triggerEvent ?? 'none'}`} emptyMessage="No templates." />
      </PageSurface>

      {editing && <EditTemplateModal template={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
