import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { formatValue, validateSetting } from './settings-logic';
import type { SettingDef } from './settings-types';

// Answer 2422 (Settings 1.1): the designed Logo uploads at once when live; the brand colour must suit white text.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '1.1')!;
const logo = design.sections.flatMap((s) => s.settings).find((d) => d.key === 'org.company.logo')!;
const page = { ...design, sections: [{ title: 'Logo and brand colour', settings: [{ ...logo, value: 'https://files.example/logo.png' }] }] };

describe('1.1 logo and brand colour', () => {
  it('a live logo shows the picture and uploads the chosen file at once, with a toast; no Remove', async () => {
    const onUploadImage = vi.fn().mockResolvedValue({});
    const { container } = render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.1" live={{ page, canEdit: true, lastChange: null, state: 'ready', onSave: vi.fn(), onUploadImage }} /></ToastProvider>);
    expect(screen.getByAltText('Your logo')).toHaveAttribute('src', 'https://files.example/logo.png');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await ue.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith('org.company.logo', file));
    expect((await screen.findAllByText('Logo saved')).length).toBeGreaterThan(0);
  });

  it('a refused upload says why and keeps the old logo', async () => {
    const onUploadImage = vi.fn().mockRejectedValue(new Error('Logo must be a PNG or JPEG image'));
    const { container } = render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.1" live={{ page, canEdit: true, lastChange: null, state: 'ready', onSave: vi.fn(), onUploadImage }} /></ToastProvider>);
    await ue.upload(container.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('Logo must be a PNG or JPEG image')).toBeInTheDocument();
    expect(screen.getByAltText('Your logo')).toBeInTheDocument();
  });

  it('the brand colour: a code, dark enough for white text; an uploaded logo reads as Uploaded', () => {
    const colour = { key: 'c', label: 'Brand colour', kind: 'colour' } as SettingDef;
    expect(validateSetting(colour, '#1F6F5C')).toBeNull();
    expect(validateSetting(colour, '#FFEE00')).toBe('White button text is hard to read on this colour. Choose a darker one.');
    expect(validateSetting(colour, '1F6F5C')).toMatch(/^Use a colour code/);
    expect(validateSetting(colour, 'blue')).toMatch(/^Use a colour code/);
    expect(formatValue(logo, 'https://files.example/logo.png')).toBe('Uploaded');
  });
});
