import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { inertOutside } from '../lib/inert';
import { Drawer } from './drawer';
import { Dialog } from './overlay';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu';

// Answer 2356 follow-up: layers opened from inside other layers (drawer → dialog, dialog → menu) leave everything they
// made inert usable again, in any order. aria-hidden's shared counter (also used by Radix) kept a drawer inert after a
// dialog opened from it closed.
const inert = (el: Element) => Boolean(el.closest('[inert]'));

function DrawerThenDialog() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  return (
    <main>
      <button onClick={() => setDrawer(true)}>Open drawer</button>
      <Drawer open={drawer} onOpenChange={setDrawer} title="Attempt">
        <button onClick={() => setDialog(true)}>Pause</button>
        <button>End attempt</button>
      </Drawer>
      <Dialog open={dialog} onOpenChange={setDialog} title="Pause the attempt" footer={<button onClick={() => setDialog(false)}>Done</button>}>
        <p>Why?</p>
      </Dialog>
    </main>
  );
}

afterEach(() => document.body.querySelectorAll('[inert]').forEach((n) => n.removeAttribute('inert')));

describe('inert behind stacked layers', () => {
  it('drawer → dialog → close: the drawer is usable again; closing the drawer frees the page', async () => {
    render(<DrawerThenDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    const end = await screen.findByRole('button', { name: 'End attempt' });
    expect(inert(screen.getByText('Open drawer'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await screen.findByRole('button', { name: 'Done' });
    expect(inert(end)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'End attempt' })).toBeTruthy();
    expect(inert(screen.getByText('End attempt'))).toBe(false);
    expect(inert(screen.getByText('Open drawer'))).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(async () => undefined);
    expect(screen.queryByText('End attempt')).toBeNull();
    expect(inert(screen.getByText('Open drawer'))).toBe(false);
    expect(document.body.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('dialog → menu: the menu opened from inside the dialog is usable, and its item works', async () => {
    let picked = '';
    render(
      <Dialog defaultOpen title="Move">
        <Menu>
          <MenuTrigger asChild>
            <button>More</button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => (picked = 'archive')}>Archive</MenuItem>
          </MenuContent>
        </Menu>
      </Dialog>,
    );
    const trigger = await screen.findByRole('button', { name: 'More' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    const item = await screen.findByRole('menuitem', { name: 'Archive' });
    expect(inert(item)).toBe(false);
    expect(inert(trigger)).toBe(false);
    fireEvent.click(item);
    expect(picked).toBe('archive');
  });

  it('restores exactly what it set, whatever order layers close in, and never un-inerts what was inert before', () => {
    document.body.innerHTML = '<div id="app"><p id="pre" inert></p><p id="page"></p></div><div id="a"></div>';
    const $ = (id: string) => document.getElementById(id)!;
    const undoA = inertOutside($('a'));
    document.body.insertAdjacentHTML('beforeend', '<div id="b"></div>'); // a layer opened from inside a: a later portal
    const undoB = inertOutside($('b'));
    expect([$('app').hasAttribute('inert'), $('a').hasAttribute('inert'), $('b').hasAttribute('inert')]).toEqual([true, true, false]);
    undoA(); // the lower layer closes first: the page stays inert while b is open
    expect([$('app').hasAttribute('inert'), $('a').hasAttribute('inert')]).toEqual([true, true]);
    undoB();
    expect([$('app').hasAttribute('inert'), $('a').hasAttribute('inert'), $('b').hasAttribute('inert')]).toEqual([false, false, false]);
    expect($('pre').hasAttribute('inert')).toBe(true);
    const undoPre = inertOutside($('page'));
    undoPre();
    expect($('pre').hasAttribute('inert')).toBe(true);
  });
});
