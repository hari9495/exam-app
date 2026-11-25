'use client';

import { useToast } from '@yukthix/ui';
import { AssignmentRulesScreen, type CourseRow, type LearningRuleInput, type LiveRule } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useJoinerPlaces } from '../../../../../../lib/yx-lifecycle';
import { useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';
import { learnState } from '../../my-learning';

// Learning › Compliance › Assignment rules (LRN-07, learning.manage): who must complete which course, by when, how
// often; the preview shows who matches before saving; saving enrols whoever needs it now.
export default function YxAssignmentRulesPage() {
  const { toast } = useToast();
  const rules = useLearning<LiveRule[]>('/rules');
  const courses = useLearning<CourseRow[]>('/admin/courses');
  const places = useJoinerPlaces(true);
  const write = useLearningWrite();
  return (
    <AssignmentRulesScreen
      rules={[]}
      live={{
        state: learnState(loadState(rules)),
        onRetry: () => void rules.refetch(),
        rules: rules.data ?? null,
        courses: (courses.data ?? []).filter((c) => c.status === 'published').map((c) => ({ value: c.id, label: c.title })),
        entities: places.entities,
        locations: places.locations,
        departments: places.departments,
        onPreview: (input: LearningRuleInput) => write<{ matches: number; toEnrol: number }>('POST', '/rules/preview', input),
        onSave: async (input, rule) => {
          try {
            const out = rule ? await write<{ enrolled: number }>('PATCH', `/rules/${encodeURIComponent(rule.id)}`, { ...input, version: rule.version }) : await write<{ enrolled: number }>('POST', '/rules', input);
            toast({ tone: 'success', title: `${input.name} saved`, description: out.enrolled ? `${out.enrolled} ${out.enrolled === 1 ? 'person was' : 'people were'} enrolled.` : 'Nobody needed enrolling today.' });
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'The rule was not saved. Try again.' });
            throw e;
          }
        },
      }}
    />
  );
}
