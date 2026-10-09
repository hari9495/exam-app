'use client';

import { JourneyTemplatesScreen, type Choice, type JourneyTemplates } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Settings › Onboarding checklists (LIFE-1.04 / 1.06; D17): copy the YukthiX starter, then change tasks, owners,
// teams, days and the Service Desk item each IT or Admin task raises (founder D1).
export default function YxChecklistsPage() {
  const templates = useLife<JourneyTemplates>('/lifecycle/journey-templates');
  const options = useLife<{ teams: Choice[]; catalogItems: (Choice & { desk: string })[] }>('/lifecycle/journey-templates/options');
  const write = useLifeWrite();
  return (
    <JourneyTemplatesScreen
      state={loadState(templates, options)}
      onRetry={() => void Promise.all([templates.refetch(), options.refetch()])}
      data={templates.data ?? null}
      teams={options.data?.teams ?? []}
      catalogItems={options.data?.catalogItems ?? []}
      onUseStarter={(starterKey) => write('POST', '/lifecycle/journey-templates/from-starter', { starterKey })}
      onSave={(t) =>
        write('PUT', `/lifecycle/journey-templates/${encodeURIComponent(t.id)}`, {
          kind: t.kind,
          name: t.name,
          legalEntityId: t.legalEntityId,
          locationId: t.locationId,
          departmentId: t.departmentId,
          active: t.active,
          version: t.version,
          tasks: t.tasks.map((x) => ({ key: x.key, title: x.title, ownerType: x.ownerType, ownerUserId: x.ownerUserId, ownerGroupId: x.ownerGroupId, kind: x.kind, config: x.config, dueOffsetDays: x.dueOffsetDays, dependsOn: x.dependsOn, required: x.required, locked: x.locked })),
        })
      }
    />
  );
}
