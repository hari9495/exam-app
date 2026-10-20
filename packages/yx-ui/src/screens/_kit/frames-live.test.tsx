import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShieldCheck } from 'lucide-react';
import { CommandPalette, ProfileMenu } from '../../components/shell';
import { THEME_STORAGE_KEY, useAppearance } from '../auth/shell';
import { DesktopFrame, SCREEN_RAIL, type LiveFrame } from './frames';

const rail = SCREEN_RAIL.filter((r) => ['home', 'people', 'settings'].includes(r.id)).map((r) => ({ ...r, href: `/yx/${r.id}` }));
const panel = [{ items: [{ label: 'Directory', href: '/yx/people/directory', active: true }, { label: 'Org chart', href: '/yx/people/org-chart', count: 3 }] }];
const frame = (live: Partial<LiveFrame> = {}, children = <p>page</p>) => {
  const onNavigate = vi.fn();
  render(
    <DesktopFrame area="people" panelTitle="People" panel={panel} railItems={rail} live={{ onNavigate, onSearch: () => {}, profile: <ProfileMenu name="Lakshmi V" />, ...live }}>
      {children}
    </DesktopFrame>,
  );
  return onNavigate;
};

describe('DesktopFrame live mode (design audit steps 0 and 1)', () => {
  it('links in the rail and the panel go where they say, without a reload', async () => {
    const onNavigate = frame();
    const people = screen.getByRole('navigation', { name: 'People' });
    expect(within(people).getByRole('link', { name: /Directory/ })).toHaveAttribute('aria-current', 'page');
    expect(within(people).getByRole('link', { name: /Org chart/ })).toHaveTextContent('3');
    await userEvent.click(within(people).getByRole('link', { name: /Org chart/ }));
    expect(onNavigate).toHaveBeenCalledWith('/yx/people/org-chart');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Areas' })).getByRole('link', { name: 'Settings' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/yx/settings');
  });

  it('leaves new-tab clicks, outside links and links already handled to the browser', () => {
    const onNavigate = frame({}, <><a href="https://example.com">out</a><a href="/yx/x" target="_blank">tab</a></>);
    fireEvent.click(screen.getByRole('link', { name: /Org chart/ }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'out' }));
    fireEvent.click(screen.getByRole('link', { name: 'tab' }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a designed screen inside the live frame keeps only its content (no second rail or top bar)', () => {
    frame({}, <DesktopFrame area="time" panelTitle="Time" panel={[{ items: [{ label: 'Today' }] }]}><p>designed screen</p></DesktopFrame>);
    expect(screen.getByText('designed screen')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Areas' })).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Time' })).toBeNull();
  });

  it('shows the banner above the page, breadcrumbs below the top level only, Help in the top bar, and no Ask AI', () => {
    const onHelp = vi.fn();
    frame({ banner: <div role="alert">Support session</div>, breadcrumbs: [{ label: 'People', href: '/yx/people/directory' }, { label: 'Org chart' }], onHelp });
    expect(screen.getByRole('alert')).toHaveTextContent('Support session');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(onHelp).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull();
  });

  it('no breadcrumbs on a top-level page', () => {
    frame({ breadcrumbs: [{ label: 'Home' }] });
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});

describe('ProfileMenu links and CommandPalette server search', () => {
  it('the account menu lists Me and My security after My profile', async () => {
    const onSelect = vi.fn();
    render(<ProfileMenu name="Lakshmi V" links={[{ label: 'My security', icon: ShieldCheck, onSelect }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Lakshmi V' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items.indexOf('My security')).toBe(items.indexOf('My profile') + 1);
    await userEvent.click(screen.getByRole('menuitem', { name: 'My security' }));
    expect(onSelect).toHaveBeenCalled();
    // Focus goes back to the avatar; the "Your account" tooltip must not pop up and stay (founder AF-08).
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('tells the host what is typed and says it is searching until results come', async () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(<CommandPalette groups={[]} onSelect={() => {}} defaultOpen onQueryChange={onQueryChange} loading />);
    await userEvent.type(screen.getByRole('combobox'), 'meera');
    expect(onQueryChange).toHaveBeenLastCalledWith('meera');
    expect(screen.getByRole('status')).toHaveTextContent('Searching for “meera”');
    rerender(<CommandPalette groups={[{ heading: 'People', items: [{ id: 'p1', label: 'Meera Iyer', keywords: ['meera'] }] }]} onSelect={() => {}} defaultOpen onQueryChange={onQueryChange} />);
    expect(screen.getByRole('option', { name: /Meera Iyer/ })).toBeInTheDocument();
  });
});

describe('useAppearance', () => {
  function Menu() {
    const a = useAppearance();
    return <ProfileMenu name="Lakshmi V" theme={a.theme} onThemeChange={a.setTheme} density={a.density} onDensityChange={a.setDensity} />;
  }
  it('follows the OS until a choice is made in the account menu, which is remembered (validation 8 Oct 2026)', async () => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const { unmount } = render(<Menu />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Lakshmi V' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    unmount();
    render(<Menu />);
    expect(document.documentElement.dataset.theme).toBe('light');
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  });
});
