import { useState, type ReactNode } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { Drawer } from '../../components/drawer';
import { MenuItem } from '../../components/menu';
import { ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import type { Address, LegalEntity, LoadState, StateOption } from './types';

// Pieces shared by the organisation screens.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

/** "1 Apr 2026" from YYYY-MM-DD. */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export const daysBetweenIso = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That didn’t work. Nothing has changed.');

/** One async action at a time, with its error kept for an alert. */
export function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run, clearError: () => setError(null) };
}

export function entityName(entities: LegalEntity[], id: string | null | undefined): string {
  return entities.find((e) => e.id === id)?.name ?? '—';
}

/** "Shared", "Shared · KFPL, KFPL-TN" or "KFPL-TN only" (YX-ORG-15). */
export function ownershipLabel(r: { ownerLegalEntityId?: string | null; appliesToEntities?: string[] }, entities: LegalEntity[]): string {
  const short = (id: string) => entities.find((e) => e.id === id)?.shortName ?? 'Unknown entity';
  if (r.ownerLegalEntityId) return `${short(r.ownerLegalEntityId)} only`;
  if (r.appliesToEntities?.length) return `Shared · ${r.appliesToEntities.map(short).join(', ')}`;
  return 'Shared';
}

export function OrgPage({ group = 'Organisation', crumb, title, description, actions, state, onRetry, what, children }: { group?: string; crumb: string; title: string; description: string; actions?: ReactNode; state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'Settings' }, { label: group }, { label: crumb }]} />} title={title} description={description} actions={state === 'ready' ? actions : undefined} />
      {state === 'loading' && (
        <div className="yx-auth__stack" aria-busy="true">
          <Skeleton height={48} />
          <Skeleton height={240} />
        </div>
      )}
      {state === 'error' && <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="a System Admin" what={what} />}
      {state === 'ready' && children}
    </div>
  );
}

export function ArchivedToggle({ checked, onChange, count }: { checked: boolean; onChange: (v: boolean) => void; count: number }) {
  if (!count) return null;
  return <Checkbox label={`Show archived (${count})`} checked={checked} onChange={onChange} />;
}

export function StatusBadge({ archived, isDefault }: { archived: boolean; isDefault?: boolean }) {
  if (archived) return <Badge tone="neutral">Archived</Badge>;
  if (isDefault) return <Badge tone="info">Default</Badge>;
  return <Badge tone="success">Active</Badge>;
}

/** Drawer with Save / Cancel and the form's problems listed first. */
export function EditorDrawer({
  title,
  subtitle,
  open,
  onClose,
  dirty,
  errors,
  showErrors,
  saving,
  failed,
  saveLabel,
  onSave,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  dirty: boolean;
  errors: FormErrorItem[];
  showErrors: boolean;
  saving: boolean;
  failed: string | null;
  saveLabel: string;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      dirty={dirty}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={onSave}>{saveLabel}</Button>
        </>
      }
    >
      <form className="yx-org__editor" onSubmit={(e) => { e.preventDefault(); onSave(); }} noValidate>
        {showErrors && errors.length > 0 && <ErrorSummary errors={errors} />}
        {children}
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      </form>
    </Drawer>
  );
}

export interface Ask {
  title: string;
  consequence: string;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<void>;
}

/** One confirm dialog for the screen; menu items open it. Errors show inside the dialog. */
export function useConfirm(): [ReactNode, (ask: Ask) => void] {
  const [ask, setAsk] = useState<Ask | null>(null);
  const dialog = ask && (
    <ConfirmDialog open onOpenChange={(o) => !o && setAsk(null)} title={ask.title} consequence={ask.consequence} confirmLabel={ask.confirmLabel} destructive={ask.destructive} onConfirm={ask.action} />
  );
  return [dialog, setAsk];
}

/** Archive, or restore and delete, each confirmed; delete works only for records never used (YX-ORG-04). */
export function lifecycleItems(name: string, archived: boolean, ask: (a: Ask) => void, act: { archive: () => Promise<void>; restore: () => Promise<void>; remove: () => Promise<void> }, archiveNote: string): ReactNode {
  return archived ? (
    <>
      <MenuItem onSelect={() => ask({ title: `Restore ${name}?`, consequence: 'It can be chosen again for new records.', confirmLabel: 'Restore', action: act.restore })}>Restore</MenuItem>
      <MenuItem destructive onSelect={() => ask({ title: `Delete ${name}?`, consequence: 'Only something never used can be deleted. Anything in use stays archived.', confirmLabel: 'Delete', destructive: true, action: act.remove })}>Delete</MenuItem>
    </>
  ) : (
    <MenuItem onSelect={() => ask({ title: `Archive ${name}?`, consequence: archiveNote, confirmLabel: 'Archive', action: act.archive })}>Archive</MenuItem>
  );
}

/* ---------- address (YX-ORG-28) ---------- */

export interface AddressDraft {
  lines: string;
  city: string;
  state: string | null;
  postalCode: string;
}

export const addressDraft = (a: Address | null | undefined): AddressDraft => ({ lines: a?.lines.join('\n') ?? '', city: a?.city ?? '', state: a?.state ?? null, postalCode: a?.postalCode ?? '' });
export const addressEmpty = (d: AddressDraft) => !d.lines.trim() && !d.city.trim() && !d.state && !d.postalCode.trim();

/** The address, or the problems; India only (the one live region, P21). */
export function addressInput(d: AddressDraft, prefix: string): { address: Address | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  const lines = d.lines.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) errors.push({ fieldId: `${prefix}-lines`, message: 'Enter the street address' });
  if (lines.length > 4) errors.push({ fieldId: `${prefix}-lines`, message: 'Use at most 4 lines' });
  if (!d.city.trim()) errors.push({ fieldId: `${prefix}-city`, message: 'Enter the city' });
  if (!d.state) errors.push({ fieldId: `${prefix}-state`, message: 'Choose the state' });
  const pin = d.postalCode.trim();
  if (pin && !/^[1-9][0-9]{5}$/.test(pin)) errors.push({ fieldId: `${prefix}-pin`, message: 'A PIN code has 6 digits' });
  return errors.length ? { address: null, errors } : { address: { lines, city: d.city.trim(), state: d.state!, postalCode: pin || null, country: 'IN' }, errors };
}

export function AddressFields({ prefix, draft, onChange, states, errorOf, required }: { prefix: string; draft: AddressDraft; onChange: (d: AddressDraft) => void; states: StateOption[]; errorOf: (id: string) => string | undefined; required: boolean }) {
  return (
    <>
      <FormField id={`${prefix}-lines`} label="Street address" required={required} optional={!required} helper="One line per row, up to 4." error={errorOf(`${prefix}-lines`)}>
        <TextArea value={draft.lines} onChange={(lines) => onChange({ ...draft, lines })} rows={2} maxLength={500} />
      </FormField>
      <FormField id={`${prefix}-city`} label="City" required={required} error={errorOf(`${prefix}-city`)}>
        <TextField value={draft.city} onChange={(city) => onChange({ ...draft, city })} maxLength={80} />
      </FormField>
      <FormField id={`${prefix}-state`} label="State" required={required} helper="Decides professional tax and labour welfare fund." error={errorOf(`${prefix}-state`)}>
        <Select value={draft.state} onChange={(state) => onChange({ ...draft, state })} options={states.map((s) => ({ value: s.code, label: s.name }))} searchable aria-label="State" clearable={!required} />
      </FormField>
      <FormField id={`${prefix}-pin`} label="PIN code" error={errorOf(`${prefix}-pin`)}>
        <TextField value={draft.postalCode} onChange={(postalCode) => onChange({ ...draft, postalCode: postalCode.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" />
      </FormField>
    </>
  );
}

export function SectionHead({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="yx-org__head">
      <span className="yx-auth__item-main">
        <Text as="p" weight="semibold">{title}</Text>
        {description && <Text as="p" tone="secondary" size="sm">{description}</Text>}
      </span>
      {action}
    </div>
  );
}
