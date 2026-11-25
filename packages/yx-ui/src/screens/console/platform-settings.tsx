import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { ConsolePage } from './console-kit';
import type { LoadState } from './types';

// Console › Platform settings (answer 1125). No drawn screen existed, so this is the smallest one, story first: every
// YukthiX-wide value with its label and value, "Verify with counsel" where the value is legal timing to confirm. A change
// needs the security key (the app asks) and a reason; the API checks the value against the setting's own range.

export interface PlatformSettingRow {
  key: string;
  label: string;
  value: string;
  default: string | null;
  /** What the value may be, in words ("a whole number from 1 to 24"); null when it changes only by a migration. */
  allowed: string | null;
  verify: boolean;
  editable: boolean;
}

export interface PlatformSettingsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: PlatformSettingRow[];
  canChange: boolean;
  onChange: (key: string, value: string, reason: string) => Promise<unknown>;
}

function ChangeDialog({ row, onChange, onClose }: { row: PlatformSettingRow; onChange: PlatformSettingsScreenProps['onChange']; onClose: () => void }) {
  const [value, setValue] = useState(row.value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { toast } = useToast();
  const early = useTooEarly(
    [
      !value.trim() && { fieldId: 'ps-value', message: 'Give the new value.' },
      reason.trim().length < 5 && { fieldId: 'ps-reason', message: 'Give a reason of at least 5 characters: it is kept in the audit log.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const save = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await onChange(row.key, value.trim(), reason.trim());
      toast({ tone: 'success', title: 'Setting saved', description: row.label });
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not saved. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={row.label}
      description={`Allowed: ${row.allowed}. It applies to every company. You confirm with your security key.`}
      notice={failed && <InlineAlert tone="danger" title={failed} />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {row.verify && <InlineAlert tone="warning" title="Verify with counsel">This is legal timing. Change it only after counsel has confirmed the new value.</InlineAlert>}
      <FormField id="ps-value" label="Value" required error={early.errorOf('ps-value')} helper={row.default ? `YukthiX default: ${row.default}` : undefined}>
        <TextField value={value} onChange={setValue} maxLength={200} />
      </FormField>
      <FormField id="ps-reason" label="Reason" required error={early.errorOf('ps-reason')} helper="Kept in the audit log with the value before and after.">
        <TextArea rows={2} value={reason} onChange={setReason} maxLength={500} />
      </FormField>
    </Dialog>
  );
}

export function PlatformSettingsScreen({ state, onRetry, rows, canChange, onChange }: PlatformSettingsScreenProps) {
  const [editing, setEditing] = useState<PlatformSettingRow | null>(null);
  const columns: TableColumn<PlatformSettingRow>[] = [
    {
      key: 'label',
      header: 'Setting',
      value: (r) => r.label,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text>{r.label}</Text>
          {r.verify && <Badge tone="warning">Verify with counsel</Badge>}
        </span>
      ),
      width: 420,
      hideable: false,
    },
    { key: 'value', header: 'Value', value: (r) => r.value, width: 140 },
    { key: 'allowed', header: 'Allowed', value: (r) => r.allowed ?? 'Changed by YukthiX engineering only', width: 280, optional: true },
  ];
  return (
    <ConsolePage crumb="Platform settings" title="Platform settings" description="Values that apply to every company. A change needs your security key and a reason, and is audited." state={state} onRetry={onRetry} what="the platform settings">
      <DataTable
        label="Platform settings"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.key}
        rowNoun={['setting', 'settings']}
        cardSummary
        rowButtons={(r) => (canChange && r.editable ? <Button size="sm" onClick={() => setEditing(r)}>Change</Button> : null)}
      />
      {editing && <ChangeDialog row={editing} onChange={onChange} onClose={() => setEditing(null)} />}
    </ConsolePage>
  );
}
