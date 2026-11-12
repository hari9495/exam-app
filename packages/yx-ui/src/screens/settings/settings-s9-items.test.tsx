import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { allSettings } from './settings-logic';
import { TIME_SETTINGS, timeSettingsPage, type RegistryDef, type TimeSettingsData } from './time-settings-live';
import { DocumentTypeDrawer, documentTypesPage, type DocTypeRow } from './document-types-live';

// Founder answers 1821 and 1822 (S-9).
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const LINKS = new Set(Object.values(TIME_SETTINGS).flatMap((p) => p.links));
const FA: RegistryDef = { label: 'Factories Act applies', scopes: ['tenant', 'location'], dated: true, values: ['covered', 'not_covered'], default: 'not_covered' } as RegistryDef;
const data = (note?: string): TimeSettingsData => ({
  registry: { 'attendance.factories_act': FA },
  company: {},
  elsewhere: {},
  limits: {},
  canEdit: true,
  canGuard: false,
  lastChange: null,
  scopes: [{ label: 'Hosur plant (location)', type: 'location', id: 'l1' }],
  byScope: { 'attendance.factories_act': [{ scope: 'Hosur plant (location)', value: 'covered', validFrom: '2026-01-01', ...(note ? { note } : {}) }] },
});
const NOTE = 'No longer needed: the location is a registered factory';

describe('1821: the registered-factory hint on 3.1', () => {
  it("a location's own value says it is no longer needed once the location is a registered factory", () => {
    const page = timeSettingsPage(pageOf('3.1'), data(NOTE), LINKS);
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.1" live={{ page, canEdit: true, lastChange: null, onSave: vi.fn() }} /></ToastProvider>);
    expect(screen.getByText(/No longer needed: the location is a registered factory/)).toBeInTheDocument();
  });

  it('negative: without the flag no hint shows', () => {
    const f = allSettings(timeSettingsPage(pageOf('3.1'), data(), LINKS)).find((d) => d.key === 'attendance.factories_act')!;
    expect(f.overrides).toEqual([{ scope: 'Hosur plant (location)', value: 'covered', validFrom: '2026-01-01' }]);
  });
});

describe('1822: choices on a starter document type', () => {
  const PASSPORT: DocTypeRow = { key: 'passport', name: 'Passport', sensitivity: 'confidential', requiresVerification: false, expiryTracked: true, reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'], system: true, ownChoices: true, verifyLocked: false };
  const PAN: DocTypeRow = { key: 'pan_card', name: 'PAN card', sensitivity: 'confidential', requiresVerification: true, expiryTracked: false, reminderDays: [], uploadBy: ['person', 'hr'], system: true, verifyLocked: true };

  it('verification and reminders can be chosen; the name and the rest stay; back to YukthiX is offered once changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<ToastProvider><DocumentTypeDrawer initial={PASSPORT} onClose={() => {}} onSave={onSave} onReset={onReset} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('textbox', { name: /Name/ })).toBeDisabled();
    await userEvent.click(within(d).getByRole('checkbox', { name: /HR verifies it/ }));
    await userEvent.click(within(d).getByRole('button', { name: 'Save your choices' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Passport', requiresVerification: true, reminderDays: [60, 30, 7] })));
    expect(within(d).getByRole('button', { name: /Back to YukthiX/ })).toBeInTheDocument();
    expect(documentTypesPage(pageOf('5.1'), [PASSPORT]).sections[0]!.settings[0]!.rows![0]![5]).toBe('YukthiX starter, your choices');
  });

  it('negative: a payroll proof stays verified (the box is locked), and a starter is never retired', () => {
    render(<ToastProvider><DocumentTypeDrawer initial={PAN} onClose={() => {}} onSave={vi.fn()} onRetire={vi.fn()} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('checkbox', { name: /HR verifies it/ })).toBeDisabled();
    expect(within(d).getByText('Always: HR verifies it before payroll uses it.')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Retire' })).toBeNull();
    expect(within(d).queryByRole('button', { name: /Back to YukthiX/ })).toBeNull();
  });
});
