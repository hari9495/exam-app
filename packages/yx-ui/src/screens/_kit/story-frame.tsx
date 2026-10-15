// Stories only: a screen in the designed frame from a short list of menu links (replaces the retired WorkspaceShell).
import type { ReactNode } from 'react';
import { DesktopFrame, type AreaId, type PanelSection } from './frames';

export interface StoryLink {
  id: string;
  label: string;
  href: string;
  group: string;
}

const AREA: Record<string, AreaId> = { People: 'people', Hiring: 'hire', Time: 'time', Payroll: 'pay', 'Service desk': 'helpdesk', Me: 'home' };

export function LinksFrame({ links, active, children }: { links: StoryLink[]; active: string; children: ReactNode }) {
  const group = links.find((l) => l.id === active)?.group ?? links[0].group;
  const panel: PanelSection[] = [...new Set(links.map((l) => l.group))].map((g) => ({ label: g, items: links.filter((l) => l.group === g).map((l) => ({ label: l.label, active: l.id === active })) }));
  return (
    <DesktopFrame area={AREA[group] ?? 'settings'} panelTitle={group} panel={panel} scope="none">
      {children}
    </DesktopFrame>
  );
}
