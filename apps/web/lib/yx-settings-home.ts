import { SETTINGS_GROUPS, type SettingsGroupDef } from '@yukthix/ui/hiring';
import { SETTINGS_HOME, SETTINGS_PAGE_EDITORS, type NavArea } from './yx-nav';

// Settings S-1 (answers 1321, 1322): the drawn Settings home and group pages, live. A page shows only when the viewer's
// menu holds one of its live editors (the same grants as the menu; the API still checks every call).

/** /yx/settings/<slug> of a group: "People & Access" is people-and-access. */
export const groupSlug = (title: string) => title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function settingsForViewer(nav: NavArea[]) {
  const mine = new Set(nav.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href))));
  const hrefs = new Map<string, string>();
  for (const [id, editors] of Object.entries(SETTINGS_PAGE_EDITORS)) {
    const h = editors.find((e) => mine.has(e));
    if (h) hrefs.set(id, h);
  }
  const groups: SettingsGroupDef[] = SETTINGS_GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => hrefs.has(p.id)) })).filter((g) => g.pages.length);
  return {
    groups,
    pageHref: (pageId: string) => hrefs.get(pageId) ?? SETTINGS_HOME,
    groupHref: (groupId: number) => `${SETTINGS_HOME}/${groupSlug(SETTINGS_GROUPS.find((g) => g.id === groupId)?.title ?? '')}`,
    groupIdOf: (slug: string) => SETTINGS_GROUPS.find((g) => groupSlug(g.title) === slug)?.id,
  };
}
