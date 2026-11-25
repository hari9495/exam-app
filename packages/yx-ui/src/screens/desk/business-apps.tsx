import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { useToast } from '../../components/notify';
import { TextArea, TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { useRun } from '../org/org-kit';
import { DeskPage } from './desk-kit';
import { LivePicker } from './service-form';
import type { PickOption } from './esm-types';
import type { LoadState } from './types';

// Helpdesk plan item 3: the company's business applications, each with an owner. People ask for access through the
// service catalogue (an item whose form has an "application" question); the step "the application's owner" sends it to
// that owner (or the desk's admins), who grants or refuses in their approvals. A retired application cannot be asked for.

export interface BusinessApp {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  owner: string;
  /** Answer 1894: the owner has left or was deactivated (a new one is needed; the desk admins decide meanwhile). */
  ownerLeft?: boolean;
  status: 'active' | 'retired';
  version: number;
  canEdit: boolean;
}
export interface BusinessAppInput {
  name: string;
  description: string | null;
  ownerUserId: string;
  status: 'active' | 'retired';
  version?: number;
}
export interface BusinessAppsProps {
  state: LoadState;
  onRetry?: () => void;
  apps: BusinessApp[];
  /** The company's Service Desk owner (desk.desk.create) adds and changes applications. */
  canEdit: boolean;
  onSave: (id: string | null, input: BusinessAppInput) => Promise<unknown>;
  /** Colleagues to make owner. */
  onPickPeople: (q: string) => Promise<PickOption[]>;
  /** Stories and tests only: the dialog open on first render. */
  start?: { edit?: string | 'new' };
}

export function BusinessAppsScreen(props: BusinessAppsProps) {
  const [edit, setEdit] = useState<BusinessApp | 'new' | null>(props.start?.edit === 'new' ? 'new' : (props.apps.find((a) => a.id === props.start?.edit) ?? null));
  const active = props.apps.filter((a) => a.status === 'active');
  const retired = props.apps.filter((a) => a.status === 'retired');
  const list = (rows: BusinessApp[], label: string) => (
    <ul className="yx-ops-list" aria-label={label}>
      {rows.map((a) => (
        <li key={a.id} className="yx-ops-list__item">
          <span className="yx-ops-list__main">
            <span className="yx-ops-list__title">
              {a.name} {a.status === 'retired' && <Badge tone="neutral">Retired</Badge>}
              {a.status === 'active' && a.ownerLeft && <Badge tone="warning">Owner has left</Badge>}
            </span>
            <span className="yx-ops-list__sub">
              Owner: {a.owner}
              {a.status === 'active' && a.ownerLeft ? ' · choose a new owner; the IT desk admins decide requests until then' : ''}
              {a.description ? ` · ${a.description}` : ''}
            </span>
          </span>
          {props.canEdit && (
            <Button size="sm" aria-label={`Edit ${a.name}`} onClick={() => setEdit(a)}>
              Edit
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <DeskPage
      state={props.state}
      onRetry={props.onRetry}
      what="the applications list"
      title="Applications"
      description="The company's business applications and who owns each. Access is asked for in the service catalogue; the owner says yes or no."
      actions={
        props.canEdit ? (
          <Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>
            New application
          </Button>
        ) : undefined
      }
    >
      <div className="yx-ops-stack">
        {active.length === 0 ? <EmptyState compact title="No applications yet." description={props.canEdit ? 'Add one, with its owner.' : "Ask your company's Service Desk owner to add them."} /> : list(active, 'Applications')}
        {retired.length > 0 && (
          <>
            <p className="yx-ops-muted">Retired: nobody can ask for these any more.</p>
            {list(retired, 'Retired applications')}
          </>
        )}
      </div>
      {edit && props.canEdit && <AppDialog app={edit === 'new' ? null : edit} onPickPeople={props.onPickPeople} onClose={() => setEdit(null)} onSave={(input) => props.onSave(edit === 'new' ? null : edit.id, input)} />}
    </DeskPage>
  );
}

function AppDialog({ app, onPickPeople, onClose, onSave }: { app: BusinessApp | null; onPickPeople: BusinessAppsProps['onPickPeople']; onClose: () => void; onSave: (input: BusinessAppInput) => Promise<unknown> }) {
  const [name, setName] = useState(app?.name ?? '');
  const [description, setDescription] = useState(app?.description ?? '');
  const [owner, setOwner] = useState<string | null>(app?.ownerUserId ?? null);
  const [status, setStatus] = useState<BusinessApp['status']>(app?.status ?? 'active');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const early = useTooEarly([...(name.trim().length >= 2 ? [] : [{ fieldId: 'ba-name', message: 'Name the application.' }]), ...(owner ? [] : [{ fieldId: 'ba-owner', message: 'Choose its owner.' }])]);
  const save = () =>
    !early.stop() &&
    void run('save', async () => {
      await onSave({ name: name.trim(), description: description.trim() || null, ownerUserId: owner!, status, ...(app ? { version: app.version } : {}) });
      toast({ tone: 'success', title: app ? 'Application saved.' : 'Application added.' });
      onClose();
    });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={app ? `Edit ${app.name}` : 'New application'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={save}>
            Save application
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <FormField id="ba-name" label="Name" required error={early.errorOf('ba-name')}>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="What it is for" optional>
          <TextArea value={description} onChange={setDescription} rows={2} maxLength={500} />
        </FormField>
        <FormField id="ba-owner" label="Owner" required helper="The owner says yes or no to access requests. The desk's admins can too." error={early.errorOf('ba-owner')}>
          <LivePicker kind="people" label="Owner" value={owner} onChange={setOwner} onPick={(_k, q) => onPickPeople(q)} names={app ? { [app.ownerUserId]: app.owner } : undefined} />
        </FormField>
        {app && (
          <FormField label="Can people ask for it?">
            <Segment label="Can people ask for it?" options={[{ value: 'active', label: 'Yes, in use' }, { value: 'retired', label: 'No, retired' }]} value={status} onChange={setStatus} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
