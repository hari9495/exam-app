import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from './drawer';
import { Dialog } from './overlay';
import { Select } from './select';

const OPTIONS = [
  { value: 'kfpl', label: 'Kaveri Foods Pvt Ltd' },
  { value: 'kfpl-tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
];

function Picker() {
  const [v, setV] = useState('kfpl');
  return <Select value={v} onChange={(x) => x && setV(x)} options={OPTIONS} aria-label="Legal entity" />;
}

// A Select's list inside a drawer or dialog (Add location, Add person …) was portalled to <body>, outside the modal panel:
// its pointer-events were off, its search box lost focus to the panel's trap, and Escape closed the whole drawer.
describe('a Select inside a drawer or dialog', () => {
  it('opens its list inside the drawer panel, picks with a click, and Escape closes only the list', async () => {
    const onOpenChange = vi.fn();
    render(<Drawer open onOpenChange={onOpenChange} title="Add location"><Picker /></Drawer>);
    const panel = screen.getByRole('dialog', { name: 'Add location' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Legal entity' }));
    const option = await screen.findByRole('option', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' });
    expect(panel.contains(option)).toBe(true);
    await userEvent.click(option);
    expect(screen.getByRole('combobox', { name: 'Legal entity' })).toHaveTextContent('Kaveri Foods Pvt Ltd (Tamil Nadu)');
    await userEvent.click(screen.getByRole('combobox', { name: 'Legal entity' }));
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('does the same inside a dialog', async () => {
    render(<Dialog open onOpenChange={vi.fn()} title="Give access"><Picker /></Dialog>);
    await userEvent.click(screen.getByRole('combobox', { name: 'Legal entity' }));
    const option = await screen.findByRole('option', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' });
    expect(screen.getByRole('dialog', { name: 'Give access' }).contains(option)).toBe(true);
  });
});
