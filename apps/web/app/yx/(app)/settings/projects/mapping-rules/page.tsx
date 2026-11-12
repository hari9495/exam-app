'use client';

import { MappingRulesScreen, type MappingRulesData, type MappingTestResult } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../../lib/yx-org';
import { useProjects, useProjectsWrite } from '../../../../../../lib/yx-projects';

// Settings › Projects & timesheets › Timesheet mapping rules (PRJ-08), Projects P-3 (answers 1409, 1410): the designed
// page with `live`. Projects managers and System Admins change the rules; only a System Admin switches pre-fill.
export default function YxMappingRulesPage() {
  const data = useProjects<MappingRulesData>('/mapping-rules');
  const write = useProjectsWrite();
  const state = loadState(data);
  const id = encodeURIComponent;
  return (
    <MappingRulesScreen
      live={{
        // Walk 12 Nov: Projects switched off is its own plain state; no access gets the kit's Request access page.
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onSwitchPrefill: async (on) => void (await write('PUT', '/settings', { changes: [{ key: 'timesheet.tool_suggestions', value: on ? 'on' : 'off' }] })),
        onSave: async (rid, input) => void (await (rid ? write('PUT', `/mapping-rules/${id(rid)}`, input) : write('POST', '/mapping-rules', input))),
        onRemove: async (r) => void (await write('POST', `/mapping-rules/${id(r.id)}/remove`, { version: r.version })),
        onTest: () => write<MappingTestResult>('POST', '/mapping-rules/test'),
      }}
    />
  );
}
