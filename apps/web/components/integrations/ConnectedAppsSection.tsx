'use client';

import { FormEvent, useState } from 'react';
import {
  Button,
  Badge,
  StatusBadge,
  Modal,
  Input,
  Select,
  Checkbox,
  CollapsibleSection,
  Table,
  RequiredFieldsNote,
  useToast,
  type Column,
  type SelectOption,
  type StatusTone,
} from '../ui';
import {
  useConnectedApps,
  useCreateConnectedApp,
  useUpdateConnectedApp,
  useDeleteConnectedApp,
  useTestConnectedApp,
} from '../../lib/hooks/useConnectedApps';
import { ConnectedAppRow } from '../../lib/types';

// Mirrors packages/shared/src/integrations/event-types.ts INTEGRATION_EVENT_TYPES /
// INTEGRATION_EVENT_LABELS exactly. Kept local rather than imported from
// @exam-platform/shared because that package doesn't reliably resolve from apps/web
// in every build environment this app runs in.
const INTEGRATION_EVENTS: { value: string; label: string }[] = [
  { value: 'invitation.created', label: 'Candidate invited' },
  { value: 'attempt.submitted', label: 'Candidate finished exam' },
  { value: 'attempt.settled', label: 'Results ready' },
  { value: 'integrity.flagged', label: 'Integrity flag raised' },
  { value: 'interview.confirmed', label: 'Interview confirmed' },
  { value: 'offer.accepted', label: 'Offer accepted' },
  { value: 'candidate.applied', label: 'New applicant' },
  { value: 'candidate.fit_scored', label: 'AI fit score ready' },
];

const EVENT_LABEL_BY_VALUE = new Map(INTEGRATION_EVENTS.map((e) => [e.value, e.label]));

const APP_TYPE_OPTIONS: SelectOption[] = [
  { value: 'slack', label: 'Slack' },
  { value: 'msteams', label: 'Microsoft Teams' },
];

const APP_TYPE_LABEL: Record<'slack' | 'msteams', string> = { slack: 'Slack', msteams: 'Microsoft Teams' };

const URL_HELP: Record<'slack' | 'msteams', { text: string; href: string }> = {
  slack: { text: 'How to get a Slack incoming webhook URL', href: 'https://api.slack.com/messaging/webhooks' },
  msteams: {
    text: 'How to get a Teams workflow webhook URL',
    href: 'https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/what-are-webhooks-and-connectors',
  },
};

function statusTone(status: string): StatusTone {
  return status === 'active' ? 'success' : 'neutral';
}

interface FormState {
  type: 'slack' | 'msteams';
  label: string;
  targetUrl: string;
  events: string[];
}

const EMPTY_FORM: FormState = { type: 'slack', label: '', targetUrl: '', events: [] };

export function ConnectedAppsSection() {
  const { data: apps } = useConnectedApps();
  const createApp = useCreateConnectedApp();
  const updateApp = useUpdateConnectedApp();
  const deleteApp = useDeleteConnectedApp();
  const testApp = useTestConnectedApp();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row: ConnectedAppRow) {
    setEditingId(row.id);
    setForm({ type: row.type, label: row.label, targetUrl: '', events: row.events });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function toggleEvent(value: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      events: checked ? [...current.events, value] : current.events.filter((e) => e !== value),
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.events.length === 0) {
      setFormError('Select at least one event.');
      return;
    }
    const onError = (err: unknown) => setFormError(err instanceof Error ? err.message : 'Failed to save connected app');

    if (editingId) {
      updateApp.mutate(
        { id: editingId, label: form.label, events: form.events, ...(form.targetUrl.trim() ? { targetUrl: form.targetUrl } : {}) },
        { onSuccess: () => { toast('Connected app updated.'); closeModal(); }, onError },
      );
      return;
    }
    if (!form.targetUrl.trim()) {
      setFormError('Enter a webhook URL.');
      return;
    }
    createApp.mutate(
      { type: form.type, label: form.label, targetUrl: form.targetUrl, events: form.events },
      { onSuccess: () => { toast('Connected app added.'); closeModal(); }, onError },
    );
  }

  function handleToggleStatus(row: ConnectedAppRow) {
    updateApp.mutate({ id: row.id, status: row.status === 'active' ? 'disabled' : 'active' });
  }

  function handleTest(row: ConnectedAppRow) {
    testApp.mutate(row.id, {
      onSuccess: () => toast(`Test event queued for ${row.label}.`),
      onError: (err) => toast(err instanceof Error ? err.message : 'Failed to queue test event'),
    });
  }

  function handleRemove(row: ConnectedAppRow) {
    if (!confirm(`Remove ${row.label}? This cannot be undone.`)) return;
    deleteApp.mutate(row.id, { onSuccess: () => toast(`Removed ${row.label}.`) });
  }

  const columns: Column<ConnectedAppRow>[] = [
    { key: 'type', header: 'Type', render: (row) => <Badge>{APP_TYPE_LABEL[row.type]}</Badge>, sortValue: (row) => row.type },
    { key: 'label', header: 'Name', render: (row) => row.label, sortValue: (row) => row.label },
    {
      key: 'events',
      header: 'Events',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.events.map((event) => (
            <Badge key={event}>{EVENT_LABEL_BY_VALUE.get(event) ?? event}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
          <Button variant="secondary" onClick={() => handleToggleStatus(row)} loading={updateApp.isPending}>
            {row.status === 'active' ? 'Disable' : 'Enable'}
          </Button>
        </div>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'lastDelivery',
      header: 'Last delivery',
      render: (row) =>
        row.lastError ? (
          <span className="text-status-danger">{row.lastError}</span>
        ) : row.lastDeliveryAt ? (
          new Date(row.lastDeliveryAt).toLocaleString()
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => handleTest(row)} loading={testApp.isPending}>
            Test
          </Button>
          <Button variant="secondary" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button variant="secondary" onClick={() => handleRemove(row)} loading={deleteApp.isPending}>
            Remove
          </Button>
        </div>
      ),
    },
  ];

  const helpForType = URL_HELP[form.type];

  return (
    <CollapsibleSection title="Connected Apps (Slack & Teams)">
      <div className="sm:col-span-2">
        <Table columns={columns} rows={apps ?? []} rowKey={(row) => row.id} emptyMessage="No connected apps yet." />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={openAdd}>Add connected app</Button>
      </div>

      <Modal open={modalOpen} title={editingId ? 'Edit connected app' : 'Add connected app'} onClose={closeModal}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <RequiredFieldsNote />
          {editingId ? (
            <p className="text-sm text-muted">Type: {APP_TYPE_LABEL[form.type]} (can&apos;t be changed after creation)</p>
          ) : (
            <Select
              label="Type"
              value={form.type}
              onChange={(value) => setForm((current) => ({ ...current, type: value as 'slack' | 'msteams' }))}
              options={APP_TYPE_OPTIONS}
              required
            />
          )}
          <Input
            label="Name"
            value={form.label}
            onChange={(value) => setForm((current) => ({ ...current, label: value }))}
            required
          />
          <div className="flex flex-col gap-1">
            <Input
              label="Webhook URL"
              value={form.targetUrl}
              onChange={(value) => setForm((current) => ({ ...current, targetUrl: value }))}
              placeholder={editingId ? 'Leave blank to keep the existing URL' : 'https://hooks.slack.com/services/…'}
              required={!editingId}
            />
            <a href={helpForType.href} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              {helpForType.text}
            </a>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="font-body text-sm font-medium text-ink after:ml-0.5 after:text-status-danger after:content-['*']">
              Events
            </legend>
            {INTEGRATION_EVENTS.map((event) => (
              <Checkbox
                key={event.value}
                label={event.label}
                checked={form.events.includes(event.value)}
                onChange={(checked) => toggleEvent(event.value, checked)}
              />
            ))}
          </fieldset>
          {formError && (
            <p role="alert" className="text-sm text-status-danger">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={createApp.isPending || updateApp.isPending}>
              {editingId ? 'Save changes' : 'Add app'}
            </Button>
          </div>
        </form>
      </Modal>
    </CollapsibleSection>
  );
}
