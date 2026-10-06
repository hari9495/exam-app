import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LegalEntitiesScreen, entityInput, statutoryErrors, type LegalEntitiesScreenProps } from './entities';
import { LocationsScreen, locationInput, type LocationsScreenProps } from './locations';
import { StructureScreen, masterInput, payRangeErrors, subtree, type StructureScreenProps } from './structure';
import { addressDraft, ownershipLabel } from './org-kit';
import { ENTITIES, LOCATIONS, MASTERS, PAY_RANGES, RULES, STATES, TODAY_ISO } from './data';

const ok = () => vi.fn().mockResolvedValue(undefined);

function Entities(over: Partial<LegalEntitiesScreenProps>) {
  return (
    <LegalEntitiesScreen
      state="ready"
      entities={ENTITIES}
      states={STATES}
      canManage
      canStatutory={false}
      rules={RULES}
      onSaveRules={ok()}
      onSave={ok()}
      onSetDefault={ok()}
      onArchive={ok()}
      onRestore={ok()}
      onDelete={ok()}
      onLoadStatutory={vi.fn().mockResolvedValue({ pan: 'AABCK1234M', tan: 'BLRK01234E', gstin: '29AABCK1234M1Z5', cin: null })}
      onSaveStatutory={ok()}
      {...over}
    />
  );
}

function Structure(over: Partial<StructureScreenProps>) {
  return (
    <StructureScreen
      state="ready"
      masters={MASTERS}
      entities={ENTITIES}
      canManage
      defaultOwnership="shared"
      pay={{ canView: false, canManage: false, today: TODAY_ISO, onLoad: vi.fn().mockResolvedValue(PAY_RANGES), onCreate: ok(), onUpdate: ok(), onDelete: ok() }}
      onSave={ok()}
      onArchive={ok()}
      onRestore={ok()}
      onDelete={ok()}
      {...over}
    />
  );
}

describe('LegalEntitiesScreen (P01 §4.1)', () => {
  it('lists active entities with the default marked; identifiers show only whether they are on file', () => {
    render(<Entities />);
    const table = screen.getByRole('table', { name: 'Legal entities' });
    expect(within(table).getByText('Kaveri Foods Pvt Ltd')).toBeTruthy();
    expect(within(table).getByText('Default')).toBeTruthy();
    expect(within(table).getByText('Missing CIN')).toBeTruthy();
    expect(within(table).queryByText('Kaveri Agro Traders LLP')).toBeNull();
    expect(document.body.textContent).not.toMatch(/AABCK1234M/);
    // Without the Confidential grant there is no way in.
    expect(screen.queryByRole('button', { name: /Identifiers of/ })).toBeNull();
  });

  it('shows archived entities on request', async () => {
    render(<Entities />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show archived (1)' }));
    expect(screen.getByText('Kaveri Agro Traders LLP')).toBeTruthy();
  });

  it('identifiers load once when opened, are checked, and the GSTIN must carry the PAN', async () => {
    const onLoadStatutory = vi.fn().mockResolvedValue({ pan: 'AABCK1234M', tan: null, gstin: null, cin: null });
    const onSaveStatutory = ok();
    render(<Entities canStatutory onLoadStatutory={onLoadStatutory} onSaveStatutory={onSaveStatutory} />);
    await userEvent.click(screen.getByRole('button', { name: 'Identifiers of Kaveri Foods Pvt Ltd' }));
    const gstin = await screen.findByRole('textbox', { name: 'GSTIN' });
    expect(onLoadStatutory).toHaveBeenCalledTimes(1);
    await userEvent.type(gstin, '29ZZZZZ9999Z1Z5');
    await userEvent.click(screen.getByRole('button', { name: 'Save identifiers' }));
    expect(onSaveStatutory).not.toHaveBeenCalled();
    expect((await screen.findAllByText('The GSTIN does not contain this PAN')).length).toBeGreaterThan(0);
  });

  it('edits an entity and sends the whole record', async () => {
    const onSave = ok();
    render(<Entities onSave={onSave} />);
    const row = screen.getByRole('table', { name: 'Legal entities' }).querySelectorAll('tbody tr')[0] as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const name = screen.getByRole('textbox', { name: /Registered name/ });
    await userEvent.clear(name);
    await userEvent.type(name, 'Kaveri Foods Private Limited');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('le-kfpl', { name: 'Kaveri Foods Private Limited', shortName: 'KFPL', currency: 'INR', fyStartMonth: 4, registeredAddress: ENTITIES[0].registeredAddress }));
  });

  it('company rules say where the value comes from and save only what changed (YX-ORG-12)', async () => {
    const onSaveRules = ok();
    render(<Entities onSaveRules={onSaveRules} />);
    expect(screen.getByText(/YukthiX starter, not changed yet/)).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Across the company' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSaveRules).toHaveBeenCalledWith({ employeeCodeScope: 'tenant' });
  });

  it('read-only and no-access states', () => {
    const { unmount } = render(<Entities canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Add legal entity' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    unmount();
    render(<Entities state="no-access" />);
    expect(screen.getByText(/a System Admin/)).toBeTruthy();
  });
});

describe('LocationsScreen (P01 §4.2)', () => {
  const props = (over: Partial<LocationsScreenProps> = {}): LocationsScreenProps => ({ state: 'ready', locations: LOCATIONS, entities: ENTITIES, states: STATES, canManage: true, onSave: ok(), onArchive: ok(), onRestore: ok(), onDelete: ok(), ...over });

  it('lists sites with their entity, state and check-in set-up', () => {
    render(<LocationsScreen {...props()} />);
    const table = screen.getByRole('table', { name: 'Locations' });
    expect(within(table).getByText('Hosur plant')).toBeTruthy();
    expect(within(table).getByText('HSR-PLT · Kaveri Foods Pvt Ltd (Tamil Nadu)')).toBeTruthy();
    expect(within(table).getByText('Geofence 300 m · 1 network')).toBeTruthy();
    expect(within(table).queryByText('Mysuru depot')).toBeNull();
  });

  it('edits a site; the entity cannot change', async () => {
    const onSave = ok();
    render(<LocationsScreen {...props({ onSave })} />);
    const row = [...screen.getByRole('table', { name: 'Locations' }).querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Hosur plant')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('combobox', { name: 'Legal entity' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('loc-hsr', {
        legalEntityId: 'le-tn',
        name: 'Hosur plant',
        code: 'HSR-PLT',
        address: LOCATIONS[2].address,
        timezone: 'Asia/Kolkata',
        minWageZone: null,
        geofence: { lat: 12.7409, lng: 77.8253, radiusM: 300 },
        ipRanges: ['10.20.0.0/16'],
      }),
    );
  });

  it('YX-ORG-02: state and time zone are required; geofence and networks are checked', () => {
    const base = { legalEntityId: 'le-tn', name: 'Plant 2', code: '', address: addressDraft(null), timezone: 'Asia/Kolkata', minWageZone: '', fence: false, lat: null, lng: null, radiusM: 200, ipRanges: '' };
    expect(locationInput(base).errors.map((e) => e.fieldId)).toEqual(['loc-addr-lines', 'loc-addr-city', 'loc-addr-state']);
    const filled = { ...base, address: { lines: '1 Main Road', city: 'Hosur', state: 'IN-TN', postalCode: '635126' } };
    expect(locationInput(filled).input).toMatchObject({ address: { state: 'IN-TN', country: 'IN' }, geofence: null, ipRanges: [] });
    expect(locationInput({ ...filled, timezone: '' }).errors[0].fieldId).toBe('loc-tz');
    expect(locationInput({ ...filled, fence: true, lat: 12.7 }).errors.map((e) => e.fieldId)).toEqual(['loc-lng']);
    expect(locationInput({ ...filled, ipRanges: '10.20.0.0/16\nnot-a-range' }).errors[0].message).toMatch(/not-a-range/);
  });
});

describe('StructureScreen (P01 §4.3)', () => {
  it('departments show the tree, divisions and ownership (YX-ORG-15)', () => {
    render(<Structure />);
    const table = screen.getByRole('table', { name: 'Departments' });
    const prod = [...table.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Production')) as HTMLElement;
    expect(within(prod).getByText('Operations')).toBeTruthy();
    expect(within(prod).getByText('KFPL-TN only')).toBeTruthy();
    const sales = [...table.querySelectorAll('tbody tr')].find((r) => r.textContent?.startsWith('Sales')) as HTMLElement;
    expect(within(sales).getByText('Division')).toBeTruthy();
    expect(within(sales).getByText('Shared · KFPL')).toBeTruthy();
  });

  it('R1: grades show no pay, and "Show pay" appears only with pay access', async () => {
    const { unmount } = render(<Structure />);
    await userEvent.click(screen.getByRole('tab', { name: /Grades/ }));
    expect(screen.queryByRole('button', { name: /Show pay/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/₹/);
    unmount();

    const onLoad = vi.fn().mockResolvedValue(PAY_RANGES);
    const onDelete = ok();
    render(<Structure pay={{ canView: true, canManage: true, today: TODAY_ISO, onLoad, onCreate: ok(), onUpdate: ok(), onDelete }} />);
    await userEvent.click(screen.getByRole('tab', { name: /Grades/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Show pay for M1 · Manager' }));
    const ranges = await screen.findByRole('table', { name: 'Pay ranges for M1 · Manager' });
    expect(onLoad).toHaveBeenCalledWith('gr-m1');
    expect(within(ranges).getByText('Starts in 33 days')).toBeTruthy();
    expect(within(ranges).getByText('In force')).toBeTruthy();
    // Only the future range may change.
    expect(within(ranges).getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
    await userEvent.click(within(ranges).getByRole('button', { name: 'Withdraw' }));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw range' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('pr-2'));
  });

  it('adds a department with a generated code and the company default ownership', async () => {
    const onSave = ok();
    render(<Structure onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Logistics');
    await userEvent.click(screen.getByRole('button', { name: 'Add department' , hidden: false }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('departments', null, { name: 'Logistics', ownerLegalEntityId: null, appliesToEntities: [], parentId: null, isDivision: false }));
  });

  it('archive is confirmed through the row menu', async () => {
    const onArchive = ok();
    render(<Structure onArchive={onArchive} />);
    const row = [...screen.getByRole('table', { name: 'Departments' }).querySelectorAll('tbody tr')].find((r) => r.textContent?.startsWith('Engineering')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /More actions|Actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(onArchive).toHaveBeenCalledWith('departments', 'd-eng'));
  });
});

describe('rules without a screen', () => {
  it('entity input: short name and currency shapes; an address is all or nothing', () => {
    const d = { name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', currency: 'INR', fyStartMonth: 4, address: addressDraft(null) };
    expect(entityInput(d).input).toEqual({ name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', currency: 'INR', fyStartMonth: 4, registeredAddress: null });
    expect(entityInput({ ...d, shortName: '-bad' }).errors[0].fieldId).toBe('le-short');
    expect(entityInput({ ...d, address: { ...addressDraft(null), city: 'Hosur' } }).errors.map((e) => e.fieldId)).toEqual(['le-addr-lines', 'le-addr-state']);
  });

  it('statutory identifiers: formats, and the GSTIN carries the PAN', () => {
    expect(statutoryErrors({ pan: 'AABCK1234M', tan: 'BLRK01234E', gstin: '29AABCK1234M1Z5', cin: 'AAB-1234' })).toEqual([]);
    expect(statutoryErrors({ pan: 'AABCK1234', tan: null, gstin: null, cin: null })[0].fieldId).toBe('le-pan');
    expect(statutoryErrors({ pan: 'AABCK1234M', tan: null, gstin: '29AABCK9999M1Z5', cin: null })[0].message).toMatch(/PAN/);
  });

  it('master input per kind (YX-ORG-05, YX-ORG-15)', () => {
    const d = { name: 'Lab', code: '', ownership: 'entity_only' as const, owner: null, appliesTo: [], parentId: null, isDivision: true, jobFamily: '', rank: null, category: null, legalEntityId: null };
    expect(masterInput('departments', d).errors.map((e) => e.fieldId)).toEqual(['m-owner']);
    expect(masterInput('departments', { ...d, owner: 'le-tn', parentId: 'd-ops' }).input).toEqual({ name: 'Lab', ownerLegalEntityId: 'le-tn', appliesToEntities: [], parentId: 'd-ops', isDivision: false });
    expect(masterInput('grades', { ...d, ownership: 'shared' }).errors[0].fieldId).toBe('m-rank');
    expect(masterInput('cost-centres', { ...d, legalEntityId: 'le-tn', code: 'CC-1' }).input).toEqual({ name: 'Lab', code: 'CC-1', parentId: null, legalEntityId: 'le-tn' });
  });

  it('pay ranges: ordered amounts and a start date', () => {
    expect(payRangeErrors({ legalEntityId: 'le-kfpl', currency: 'INR', min: 3, mid: 2, max: 4, validFrom: new Date() })[0].message).toMatch(/≤/);
    expect(payRangeErrors({ legalEntityId: null, currency: 'IN', min: null, mid: null, max: null, validFrom: null }).map((e) => e.fieldId)).toEqual(['pr-entity', 'pr-currency', 'pr-min', 'pr-from']);
  });

  it('a department cannot move under its own subtree (YX-ORG-03)', () => {
    expect([...subtree(MASTERS.departments, 'd-ops')].sort()).toEqual(['d-ops', 'd-prod', 'd-qa']);
    expect(ownershipLabel({ ownerLegalEntityId: null, appliesToEntities: ['le-kfpl', 'le-tn'] }, ENTITIES)).toBe('Shared · KFPL, KFPL-TN');
  });
});
