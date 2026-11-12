import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { useToast } from '../../components/notify';
import { TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { DeskPage, StatusBadge, when } from './desk-kit';
import { LivePicker } from './service-form';
import type { PickOption } from './esm-types';
import type { LoadState, SystemState } from './types';

// Helpdesk plan item 4: the company's buildings (its locations), their floors or areas, and equipment owned by a team of
// a facilities desk. Only a facilities desk's admins change the register. A facilities ticket or work order names the
// building, area or equipment (the Place card on the ticket); recurring maintenance can target one piece of equipment,
// and the equipment page shows its work orders. Retired areas and equipment drop out of every list to pick from.

export type FacilityStatus = 'active' | 'retired';
export interface FacilityArea {
  id: string;
  name: string;
  status: FacilityStatus;
  version: number;
}
export interface FacilityBuilding {
  id: string;
  name: string;
  code: string;
  areas: FacilityArea[];
}
export interface EquipmentRow {
  id: string;
  name: string;
  tag: string;
  category: string | null;
  status: FacilityStatus;
  version: number;
  deskId: string;
  ownerGroupId: string;
  ownerTeam: string;
  locationId: string;
  building: string;
  areaId: string | null;
  area: string | null;
  canEdit: boolean;
}
export interface FacilitiesRegister {
  canEdit: boolean;
  desks: { id: string; name: string; groups: { id: string; name: string }[] }[];
  buildings: FacilityBuilding[];
  equipment: EquipmentRow[];
}
export interface EquipmentInput {
  deskId: string;
  ownerGroupId: string;
  locationId: string;
  areaId: string | null;
  name: string;
  tag: string;
  category: string | null;
  status: FacilityStatus;
  version?: number;
}
export interface EquipmentPageView {
  id: string;
  name: string;
  tag: string;
  category: string | null;
  status: FacilityStatus;
  building: string;
  area: string | null;
  ownerTeam: string;
  workOrders: { id: string; number: string; subject: string; systemState: SystemState; createdAt: string; resolvedAt: string | null; recurring: boolean }[];
  maintenance: { id: string; name: string; rrule: string; nextRunAt: string | null; state: string }[];
}
export interface FacilitiesProps {
  state: LoadState;
  onRetry?: () => void;
  register: FacilitiesRegister | null;
  onSaveArea: (id: string | null, input: { locationId: string; name: string; status: FacilityStatus; version?: number }) => Promise<unknown>;
  onSaveEquipment: (id: string | null, input: EquipmentInput) => Promise<unknown>;
  onOpenEquipment: (id: string) => Promise<EquipmentPageView>;
  onOpenTicket: (id: string) => void;
  /** Stories and tests only: what is open on first render. */
  start?: { tab?: 'equipment' | 'buildings'; equipment?: string | 'new'; page?: EquipmentPageView; area?: { locationId: string } };
}

const STATUS_OPTIONS = [
  { value: 'active' as const, label: 'In use' },
  { value: 'retired' as const, label: 'Retired' },
];

export function FacilitiesScreen(p: FacilitiesProps) {
  const r = p.register;
  const [tab, setTab] = useState(p.start?.tab ?? 'equipment');
  const [edit, setEdit] = useState<EquipmentRow | 'new' | null>(p.start?.equipment === 'new' ? 'new' : (r?.equipment.find((e) => e.id === p.start?.equipment) ?? null));
  const [area, setArea] = useState<{ locationId: string; area: FacilityArea | null } | null>(p.start?.area ? { locationId: p.start.area.locationId, area: null } : null);
  const [page, setPage] = useState<EquipmentPageView | null>(p.start?.page ?? null);
  const { toast } = useToast();
  const open = (id: string) => void p.onOpenEquipment(id).then(setPage, () => toast({ tone: 'default', title: 'That equipment could not be opened.' }));
  return (
    <DeskPage
      state={p.state}
      onRetry={p.onRetry}
      what="the buildings and equipment register"
      title="Buildings and equipment"
      description="Buildings and their floors or areas, and the equipment the facilities teams look after. Work orders name them; maintenance can run on a schedule."
      actions={
        r?.canEdit && tab === 'equipment' ? (
          <Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>
            New equipment
          </Button>
        ) : undefined
      }
    >
      {r && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'equipment' | 'buildings')}>
          <TabsList aria-label="Register">
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="buildings">Buildings and areas</TabsTrigger>
          </TabsList>
          <TabsContent value="equipment">
            {r.equipment.length === 0 ? (
              <EmptyState compact title="No equipment yet." description={r.canEdit ? 'Add the lifts, generators and air conditioners your teams look after.' : "Ask a facilities desk's admin to add it."} />
            ) : (
              <ul className="yx-ops-list" aria-label="Equipment">
                {r.equipment.map((e) => (
                  <li key={e.id} className="yx-ops-list__item">
                    <span className="yx-ops-list__main">
                      <button type="button" className="yx-desk-link" onClick={() => open(e.id)}>
                        {e.name} ({e.tag})
                      </button>
                      <span className="yx-ops-list__sub">
                        {e.building}
                        {e.area ? ` · ${e.area}` : ''} · {e.ownerTeam}
                        {e.category ? ` · ${e.category}` : ''}
                      </span>
                    </span>
                    {e.status === 'retired' && <Badge tone="neutral">Retired</Badge>}
                    {e.canEdit && (
                      <Button size="sm" aria-label={`Edit ${e.name}`} onClick={() => setEdit(e)}>
                        Edit
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="buildings">
            <div className="yx-ops-stack">
              <p className="yx-ops-muted">Buildings are the company's locations. Add their floors or areas here.</p>
              {r.buildings.map((b) => (
                <Card
                  key={b.id}
                  title={`${b.name} (${b.code})`}
                  actions={
                    r.canEdit ? (
                      <Button size="sm" icon={Plus} aria-label={`Add an area to ${b.name}`} onClick={() => setArea({ locationId: b.id, area: null })}>
                        Add area
                      </Button>
                    ) : undefined
                  }
                >
                  {b.areas.length === 0 ? (
                    <p className="yx-ops-muted">No areas yet.</p>
                  ) : (
                    <ul className="yx-ops-list" aria-label={`Areas of ${b.name}`}>
                      {b.areas.map((x) => (
                        <li key={x.id} className="yx-ops-list__item">
                          <span className="yx-ops-list__main">{x.name}</span>
                          {x.status === 'retired' && <Badge tone="neutral">Retired</Badge>}
                          {r.canEdit && (
                            <Button size="sm" aria-label={`Edit ${x.name}`} onClick={() => setArea({ locationId: b.id, area: x })}>
                              Edit
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
      {edit && r && <EquipmentDialog row={edit === 'new' ? null : edit} register={r} onClose={() => setEdit(null)} onSave={(input) => p.onSaveEquipment(edit === 'new' ? null : edit.id, input)} />}
      {area && r && <AreaDialog locationId={area.locationId} area={area.area} building={r.buildings.find((b) => b.id === area.locationId)?.name ?? ''} onClose={() => setArea(null)} onSave={(input) => p.onSaveArea(area.area?.id ?? null, input)} />}
      <EquipmentDrawer page={page} onClose={() => setPage(null)} onOpenTicket={p.onOpenTicket} />
    </DeskPage>
  );
}

function EquipmentDialog({ row, register, onClose, onSave }: { row: EquipmentRow | null; register: FacilitiesRegister; onClose: () => void; onSave: (input: EquipmentInput) => Promise<unknown> }) {
  const desks = register.desks;
  const [deskId, setDeskId] = useState<string | null>(row?.deskId ?? (desks.length === 1 ? desks[0].id : null));
  const [groupId, setGroupId] = useState<string | null>(row?.ownerGroupId ?? null);
  const [locationId, setLocationId] = useState<string | null>(row?.locationId ?? null);
  const [areaId, setAreaId] = useState<string | null>(row?.areaId ?? null);
  const [name, setName] = useState(row?.name ?? '');
  const [tag, setTag] = useState(row?.tag ?? '');
  const [category, setCategory] = useState(row?.category ?? '');
  const [status, setStatus] = useState<FacilityStatus>(row?.status ?? 'active');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const building = register.buildings.find((b) => b.id === locationId);
  const early = useTooEarly([
    ...(name.trim() ? [] : [{ fieldId: 'eq-name', message: 'Name the equipment.' }]),
    ...(tag.trim() ? [] : [{ fieldId: 'eq-tag', message: 'Give it a tag.' }]),
    ...(deskId ? [] : [{ fieldId: 'eq-desk', message: 'Choose the desk that looks after it.' }]),
    ...(groupId ? [] : [{ fieldId: 'eq-team', message: 'Choose the owner team.' }]),
    ...(locationId ? [] : [{ fieldId: 'eq-building', message: 'Choose the building.' }]),
  ]);
  const save = () =>
    !early.stop() &&
    void run('save', async () => {
      await onSave({ deskId: deskId!, ownerGroupId: groupId!, locationId: locationId!, areaId, name: name.trim(), tag: tag.trim(), category: category.trim() || null, status, ...(row ? { version: row.version } : {}) });
      toast({ tone: 'success', title: row ? 'Equipment saved.' : 'Equipment added.' });
      onClose();
    });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Edit ${row.name}` : 'New equipment'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={save}>
            Save equipment
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <span className="yx-ops-row">
          <FormField id="eq-name" label="Name" required error={early.errorOf('eq-name')}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
          <FormField id="eq-tag" label="Tag" required error={early.errorOf('eq-tag')}>
            <TextField value={tag} onChange={setTag} maxLength={40} />
          </FormField>
        </span>
        <span className="yx-ops-row">
          <FormField id="eq-desk" label="Desk" required error={early.errorOf('eq-desk')}>
            <Select value={deskId} onChange={(v) => (setDeskId(v), setGroupId(null))} options={desks.map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose a desk" />
          </FormField>
          <FormField id="eq-team" label="Owner team" required error={early.errorOf('eq-team')}>
            <Select value={groupId} onChange={setGroupId} options={(desks.find((d) => d.id === deskId)?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))} placeholder="Choose a team" />
          </FormField>
        </span>
        <span className="yx-ops-row">
          <FormField id="eq-building" label="Building" required error={early.errorOf('eq-building')}>
            <Select value={locationId} onChange={(v) => (setLocationId(v), setAreaId(null))} options={register.buildings.map((b) => ({ value: b.id, label: b.name }))} placeholder="Choose a building" />
          </FormField>
          <FormField label="Floor or area" optional>
            <Select value={areaId} onChange={setAreaId} clearable options={(building?.areas ?? []).filter((x) => x.status === 'active' || x.id === areaId).map((x) => ({ value: x.id, label: x.name }))} placeholder="The whole building" />
          </FormField>
        </span>
        <FormField label="Kind" optional helper="For example lift, generator, air conditioner.">
          <TextField value={category} onChange={setCategory} maxLength={60} />
        </FormField>
        {row && (
          <FormField label="In use?">
            <Segment label="In use?" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

function AreaDialog({ locationId, area, building, onClose, onSave }: { locationId: string; area: FacilityArea | null; building: string; onClose: () => void; onSave: (input: Parameters<FacilitiesProps['onSaveArea']>[1]) => Promise<unknown> }) {
  const [name, setName] = useState(area?.name ?? '');
  const [status, setStatus] = useState<FacilityStatus>(area?.status ?? 'active');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const early = useTooEarly(name.trim() ? [] : [{ fieldId: 'ar-name', message: 'Name the floor or area.' }]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={area ? `Edit ${area.name}` : `New area in ${building}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', async () => { await onSave({ locationId, name: name.trim(), status, ...(area ? { version: area.version } : {}) }); toast({ tone: 'success', title: area ? 'Area saved.' : 'Area added.' }); onClose(); })}>
            Save area
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <FormField id="ar-name" label="Floor or area" required error={early.errorOf('ar-name')}>
          <TextField value={name} onChange={setName} maxLength={100} placeholder="e.g. 2nd floor, Kitchen, Server room" />
        </FormField>
        {area && (
          <FormField label="In use?">
            <Segment label="In use?" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

/** The equipment page: what and where it is, its work orders (newest first) and its maintenance schedules. */
function EquipmentDrawer({ page, onClose, onOpenTicket }: { page: EquipmentPageView | null; onClose: () => void; onOpenTicket: (id: string) => void }) {
  return (
    <Drawer open={Boolean(page)} onOpenChange={(o) => !o && onClose()} title={page ? `${page.name} (${page.tag})` : ''} size="md">
      {page && (
        <div className="yx-ops-stack">
          <DescriptionList
            items={[
              { label: 'Where', value: `${page.building}${page.area ? ` · ${page.area}` : ''}` },
              { label: 'Owner team', value: page.ownerTeam },
              { label: 'Kind', value: page.category ?? '—' },
              { label: 'In use', value: page.status === 'active' ? 'Yes' : 'Retired' },
            ]}
          />
          <Card title="Maintenance">
            {page.maintenance.length === 0 ? (
              <p className="yx-ops-muted">No recurring maintenance yet.</p>
            ) : (
              <ul className="yx-ops-list" aria-label="Maintenance">
                {page.maintenance.map((m) => (
                  <li key={m.id} className="yx-ops-list__item">
                    <span className="yx-ops-list__main">
                      {m.name}
                      <span className="yx-ops-list__sub">{m.state === 'active' ? `Next ${when(m.nextRunAt)}` : m.state === 'paused' ? 'Paused' : 'Ended'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Work orders">
            {page.workOrders.length === 0 ? (
              <p className="yx-ops-muted">No work orders yet.</p>
            ) : (
              <ul className="yx-ops-list" aria-label="Work orders">
                {page.workOrders.map((t) => (
                  <li key={t.id} className="yx-ops-list__item">
                    <span className="yx-ops-list__main">
                      <button type="button" className="yx-desk-link" onClick={() => onOpenTicket(t.id)}>
                        {t.number} · {t.subject}
                      </button>
                      <span className="yx-ops-list__sub">
                        Raised {when(t.createdAt)}
                        {t.resolvedAt ? ` · solved ${when(t.resolvedAt)}` : ''}
                        {t.recurring ? ' · scheduled maintenance' : ''}
                      </span>
                    </span>
                    <StatusBadge label="" state={t.systemState} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ the ticket's Place card

export interface TicketPlace {
  building: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
  equipment: { id: string; name: string } | null;
}

/** Helpdesk plan item 4: the building, area and equipment a facilities ticket is about; set by the desk's agents. */
export function TicketPlaceCard({ place, canSet, onPick, onSave }: { place: TicketPlace; canSet: boolean; onPick?: (kind: 'buildings' | 'areas' | 'equipment', q: string, locationId?: string) => Promise<PickOption[]>; onSave?: (p: { locationId: string | null; areaId: string | null; equipmentId: string | null }) => Promise<unknown> }) {
  const [locationId, setLocationId] = useState<string | null>(place.building?.id ?? null);
  const [areaId, setAreaId] = useState<string | null>(place.area?.id ?? null);
  const [equipmentId, setEquipmentId] = useState<string | null>(place.equipment?.id ?? null);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  if (!canSet || !onPick || !onSave)
    return <DescriptionList items={[{ label: 'Building', value: place.building?.name ?? '—' }, { label: 'Floor or area', value: place.area?.name ?? '—' }, { label: 'Equipment', value: place.equipment?.name ?? '—' }]} />;
  return (
    <div className="yx-ops-stack" data-gap="sm">
      {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
      <FormField label="Building">
        <LivePicker kind="buildings" label="Building" value={locationId} onChange={(v) => (setLocationId(v), setAreaId(null))} onPick={(_k, q) => onPick('buildings', q)} names={place.building ? { [place.building.id]: place.building.name } : undefined} />
      </FormField>
      <FormField label="Floor or area" optional>
        <LivePicker key={`a-${locationId}`} kind="areas" label="Floor or area" value={areaId} onChange={setAreaId} onPick={(_k, q) => onPick('areas', q, locationId ?? undefined)} names={place.area ? { [place.area.id]: place.area.name } : undefined} />
      </FormField>
      <FormField label="Equipment" optional helper="Its building and area come with it.">
        <LivePicker key={`e-${locationId}`} kind="equipment" label="Equipment" value={equipmentId} onChange={setEquipmentId} onPick={(_k, q) => onPick('equipment', q, locationId ?? undefined)} names={place.equipment ? { [place.equipment.id]: place.equipment.name } : undefined} />
      </FormField>
      <div className="yx-ops-row">
        <Button size="sm" loading={busy === 'place'} onClick={() => void run('place', async () => { await onSave({ locationId, areaId, equipmentId }); toast({ tone: 'success', title: 'Place saved.' }); })}>
          Save place
        </Button>
      </div>
    </div>
  );
}
