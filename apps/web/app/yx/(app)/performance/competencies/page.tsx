'use client';

import { CompetencyFrameworkScreen, type Competency, type CompetencySave, type FrameworkCompetency } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, todayIst, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

const GROUP = { core: 'Core', functional: 'Functional', leadership: 'Leadership' } as const;
const KEY = { Core: 'core', Functional: 'functional', Leadership: 'leadership' } as const;

/** A level reads "Label: what someone at that level does"; the API keeps the two apart. */
const levelText = (l: { label: string; behaviours: string | null }) => (l.behaviours ? `${l.label}: ${l.behaviours}` : l.label);
const levelOf = (t: string) => {
  const i = t.indexOf(': ');
  return i > 0 && i <= 80 ? { label: t.slice(0, i), behaviours: t.slice(i + 2).slice(0, 500) } : { label: t.slice(0, 80), behaviours: t.length > 80 ? t.slice(0, 500) : null };
};
const toScreen = (c: Competency & { usedIn?: string[] }): FrameworkCompetency => ({
  id: c.id,
  name: c.name,
  group: GROUP[c.group],
  description: c.description ?? '',
  starter: c.starter,
  status: c.status === 'active' ? 'Active' : 'Retired',
  levels: c.levels.map(levelText),
  roles: c.roles.map((r) => ({ role: r.designation, designationId: r.designationId, level: r.level })),
  usedIn: c.usedIn ?? [],
  version: c.version,
});

// PRF-14 competency framework (performance builder 3): Performance › Skills & competencies, for perf.setup.manage.
// The same competencies as Settings › Performance; in-use ones are only retired or merged, never deleted.
export default function YxCompetenciesPage() {
  const perms = useYxPermissions();
  const list = usePerf<(Competency & { usedIn?: string[] })[]>('/competencies');
  const designations = useOrg<MasterRecord[]>('/masters/designations', perms.has('org.structure.view') || perms.has('org.settings.manage'));
  const write = usePerfWrite();
  const state = loadState(list);
  const today = todayIst();
  const body = (x: CompetencySave) => ({
    name: x.name,
    group: KEY[x.group],
    description: x.description || null,
    levels: x.levels.map(levelOf),
    roles: x.roles.map((r) => ({ designationId: r.designationId, level: r.level, validFrom: today })),
    ...(x.version === undefined ? {} : { version: x.version }),
  });
  return (
    <CompetencyFrameworkScreen
      items={[]}
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void list.refetch(),
        items: (list.data ?? []).map(toScreen),
        designations: (designations.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name })),
        onSave: async (id, x) => toScreen(await write<Competency>(id ? 'PUT' : 'POST', id ? `/competencies/${encodeURIComponent(id)}` : '/competencies', body(x))),
        onRetire: async (id) => void (await write('POST', `/competencies/${encodeURIComponent(id)}/retire`)),
        onMerge: async (id, intoId) => void (await write('POST', `/competencies/${encodeURIComponent(id)}/merge`, { intoId })),
        onLoadStarters: async () => void (await write('POST', '/setup/from-starter')),
      }}
    />
  );
}
