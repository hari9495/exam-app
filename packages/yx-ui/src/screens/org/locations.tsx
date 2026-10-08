import { useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { EmptyState } from '../../components/feedback';
import { FieldRow, FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { AddressFields, ArchivedToggle, EditorDrawer, OrgPage, SectionHead, StatusBadge, addressDraft, addressInput, entityName, lifecycleItems, useConfirm, useRun, type AddressDraft } from './org-kit';
import type { LegalEntity, LoadState, LocationInput, OrgLocation, StateOption } from './types';

interface Draft {
  legalEntityId: string | null;
  name: string;
  code: string;
  address: AddressDraft;
  timezone: string;
  minWageZone: string;
  fence: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  ipRanges: string;
}

const CIDR = /^(\d{1,3}(\.\d{1,3}){3}\/\d{1,2}|[0-9A-Fa-f:]+\/\d{1,3})$/;

/** The request body, or what to fix. Mirrors the API's checks; the API checks again. */
export function locationInput(d: Draft): { input: LocationInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.legalEntityId) errors.push({ fieldId: 'loc-entity', message: 'Choose the legal entity' });
  if (!d.name.trim()) errors.push({ fieldId: 'loc-name', message: 'Enter the location name' });
  if (d.code && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(d.code)) errors.push({ fieldId: 'loc-code', message: 'Code: up to 30 letters, digits, - or _' });
  const address = addressInput(d.address, 'loc-addr');
  errors.push(...address.errors);
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(d.timezone.trim())) errors.push({ fieldId: 'loc-tz', message: 'Enter a time zone such as Asia/Kolkata' });
  if (d.fence) {
    if (d.lat == null || d.lat < -90 || d.lat > 90) errors.push({ fieldId: 'loc-lat', message: 'Latitude is between -90 and 90' });
    if (d.lng == null || d.lng < -180 || d.lng > 180) errors.push({ fieldId: 'loc-lng', message: 'Longitude is between -180 and 180' });
    if (d.radiusM == null || d.radiusM < 10 || d.radiusM > 5000) errors.push({ fieldId: 'loc-radius', message: 'Radius is 10 to 5000 metres' });
  }
  const ipRanges = d.ipRanges.split(/[\s,]+/).map((r) => r.trim()).filter(Boolean);
  const bad = ipRanges.find((r) => !CIDR.test(r));
  if (bad) errors.push({ fieldId: 'loc-ip', message: `${bad} is not a range such as 203.0.113.0/24` });
  if (errors.length) return { input: null, errors };
  return {
    input: {
      legalEntityId: d.legalEntityId!,
      name: d.name.trim(),
      ...(d.code ? { code: d.code } : {}),
      address: address.address!,
      timezone: d.timezone.trim(),
      minWageZone: d.minWageZone.trim() || null,
      geofence: d.fence ? { lat: d.lat!, lng: d.lng!, radiusM: d.radiusM! } : null,
      ipRanges,
    },
    errors,
  };
}

function LocationEditor({ location, entities, states, onClose, onSave }: { location: OrgLocation | null; entities: LegalEntity[]; states: StateOption[]; onClose: () => void; onSave: (input: LocationInput) => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>({
    legalEntityId: location?.legalEntityId ?? entities.find((e) => e.isDefault && !e.archivedAt)?.id ?? null,
    name: location?.name ?? '',
    code: location?.code ?? '',
    address: addressDraft(location?.address),
    timezone: location?.timezone ?? 'Asia/Kolkata',
    minWageZone: location?.minWageZone ?? '',
    fence: Boolean(location?.geofence),
    lat: location?.geofence?.lat ?? null,
    lng: location?.geofence?.lng ?? null,
    radiusM: location?.geofence?.radiusM ?? 200,
    ipRanges: location?.ipRanges.join('\n') ?? '',
  });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = locationInput(draft);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const save = () => {
    if (!input) return saveErrors.reveal();
    void run('save', () => onSave(input)).then((ok) => ok && onClose());
  };
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={location ? `Edit ${location.name}` : 'Add location'}
      errors={saveErrors.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={location ? 'Save changes' : 'Add location'}
      onSave={save}
    >
      <FormSection title="Site">
        <FormField id="loc-entity" label="Legal entity" required helper={location ? 'A location stays with its entity.' : undefined} error={errorOf('loc-entity')}>
          <Select
            value={draft.legalEntityId}
            onChange={(legalEntityId) => set({ legalEntityId })}
            options={entities.filter((e) => !e.archivedAt || e.id === location?.legalEntityId).map((e) => ({ value: e.id, label: e.name }))}
            disabled={Boolean(location)}
            aria-label="Legal entity"
          />
        </FormField>
        <FormField id="loc-name" label="Name" required error={errorOf('loc-name')}>
          <TextField value={draft.name} onChange={(name) => set({ name })} maxLength={200} />
        </FormField>
        <FormField id="loc-code" label="Code" optional helper="Made from the name if left empty." error={errorOf('loc-code')}>
          <TextField value={draft.code} onChange={(code) => set({ code: code.trim() })} maxLength={30} />
        </FormField>
        <FormField id="loc-tz" label="Time zone" required helper="Changes take effect at midnight here." error={errorOf('loc-tz')}>
          <TextField value={draft.timezone} onChange={(timezone) => set({ timezone })} maxLength={64} />
        </FormField>
        <FormField id="loc-mw" label="Minimum wage zone" optional>
          <TextField value={draft.minWageZone} onChange={(minWageZone) => set({ minWageZone })} maxLength={40} />
        </FormField>
      </FormSection>
      <FormSection title="Address">
        <AddressFields prefix="loc-addr" draft={draft.address} onChange={(address) => set({ address })} states={states} errorOf={errorOf} required />
      </FormSection>
      <FormSection title="Check-in" description="Mobile check-in is checked against the geofence; web check-in against the networks.">
        <Checkbox label="Use a geofence" checked={draft.fence} onChange={(fence) => set({ fence })} />
        {draft.fence && (
          <FieldRow>
            <FormField id="loc-lat" label="Latitude" required error={errorOf('loc-lat')}>
              <NumberField value={draft.lat} onChange={(lat) => set({ lat })} min={-90} max={90} decimals />
            </FormField>
            <FormField id="loc-lng" label="Longitude" required error={errorOf('loc-lng')}>
              <NumberField value={draft.lng} onChange={(lng) => set({ lng })} min={-180} max={180} decimals />
            </FormField>
            <FormField id="loc-radius" label="Radius" required error={errorOf('loc-radius')}>
              <NumberField value={draft.radiusM} onChange={(radiusM) => set({ radiusM })} min={10} max={5000} suffix="m" />
            </FormField>
          </FieldRow>
        )}
        <FormField id="loc-ip" label="Allowed networks" optional helper="One range per line, such as 203.0.113.0/24." error={errorOf('loc-ip')}>
          <TextArea value={draft.ipRanges} onChange={(ipRanges) => set({ ipRanges })} rows={3} spellCheck={false} />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

export interface LocationsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** Active and archived. */
  locations: OrgLocation[];
  entities: LegalEntity[];
  states: StateOption[];
  canManage: boolean;
  onSave: (id: string | null, input: LocationInput) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** Settings › Organisation › Locations (P01 §4.2; YX-ORG-02, YX-ORG-08). */
export function LocationsScreen(props: LocationsScreenProps) {
  const [editing, setEditing] = useState<{ location: OrgLocation | null; key: number } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, ask] = useConfirm();
  const stateName = (code: string) => props.states.find((s) => s.code === code)?.name ?? code;
  const archived = props.locations.filter((l) => l.archivedAt).length;
  const rows = useMemo(() => props.locations.filter((l) => showArchived || !l.archivedAt), [props.locations, showArchived]);
  const noEntity = !props.entities.some((e) => !e.archivedAt);

  const columns: TableColumn<OrgLocation>[] = [
    {
      key: 'name',
      header: 'Location',
      value: (l) => l.name,
      render: (l) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{l.name}</Text>
          <Text tone="secondary" size="sm">{l.code} · {entityName(props.entities, l.legalEntityId)}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'state', header: 'State', value: (l) => stateName(l.state), width: 150 },
    {
      key: 'checkin',
      header: 'Check-in',
      value: (l) => (l.geofence ? l.geofence.radiusM : 0),
      render: (l) => [l.geofence ? `Geofence ${l.geofence.radiusM} m` : 'No geofence', l.ipRanges.length ? `${l.ipRanges.length} network${l.ipRanges.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
      width: 200,
      optional: true,
    },
    { key: 'tz', header: 'Time zone', value: (l) => l.timezone, width: 140, optional: true },
    { key: 'status', header: 'Status', value: (l) => (l.archivedAt ? 'Archived' : 'Active'), render: (l) => <StatusBadge archived={Boolean(l.archivedAt)} />, width: 110, optional: true },
  ];

  const add = (
    <Button onClick={() => setEditing({ location: null, key: Date.now() })} disabled={noEntity}>
      Add location
    </Button>
  );
  return (
    <OrgPage
      crumb="Locations"
      title="Locations"
      description="Work sites. The state decides professional tax and labour welfare fund; the time zone decides when dated changes start."
      actions={props.canManage ? add : undefined}
      state={props.state}
      onRetry={props.onRetry}
      what="the locations"
    >
      <section className="yx-auth__stack" aria-label="Locations">
        <SectionHead title="Sites" description={noEntity && props.canManage ? 'Add a legal entity first: every site belongs to one.' : undefined} action={<ArchivedToggle checked={showArchived} onChange={setShowArchived} count={archived} />} />
        <DataTable
          label="Locations"
          columns={columns}
          rows={rows}
          getRowId={(l) => l.id}
          rowNoun={['location', 'locations']}
          cardSummary
          empty={<EmptyState compact title="No locations yet." description="Add the offices, plants and sites where people work." action={props.canManage ? add : undefined} />}
          rowActions={
            props.canManage
              ? (l) =>
                  lifecycleItems(l.name, Boolean(l.archivedAt), ask, { archive: () => props.onArchive(l.id), restore: () => props.onRestore(l.id), remove: () => props.onDelete(l.id) }, 'It can no longer be chosen for new people or changes.')
              : undefined
          }
          rowButtons={props.canManage ? (l) => (!l.archivedAt ? <Button size="sm" onClick={() => setEditing({ location: l, key: Date.now() })}>Edit</Button> : null) : undefined}
        />
      </section>
      {dialog}
      {editing && <LocationEditor key={editing.key} location={editing.location} entities={props.entities} states={props.states} onClose={() => setEditing(null)} onSave={(input) => props.onSave(editing.location?.id ?? null, input)} />}
    </OrgPage>
  );
}
