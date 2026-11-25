'use client';

import { TrainingNeedsScreen, type CourseRow, type LiveNeedRow } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces } from '../../../../../lib/yx-lifecycle';
import { useLearning, useLearningFiles, useLearningWrite } from '../../../../../lib/yx-learning';
import { learnState } from '../my-learning';

type Budgets = { year: number; rows: { departmentId: string; dept: string; planned: number; spent: number; committed: number }[]; departments: { value: string; label: string }[]; skills: { value: string; label: string }[] };

// Learning › Needs & budgets: the designed LRN-11 screen with `live` (G3d, learning.manage).
export default function YxTrainingNeedsPage() {
  const needs = useLearning<LiveNeedRow[]>('/needs');
  const budgets = useLearning<Budgets>('/budgets');
  const courses = useLearning<CourseRow[]>('/admin/courses');
  const places = useJoinerPlaces(true);
  const write = useLearningWrite();
  const files = useLearningFiles();
  const b = budgets.data;
  return (
    <TrainingNeedsScreen
      live={{
        state: learnState(loadState(needs, budgets)),
        onRetry: () => void Promise.all([needs.refetch(), budgets.refetch()]),
        needs: needs.data ?? [],
        budgets: b ? { year: b.year, rows: b.rows } : null,
        people: places.managers,
        departments: b?.departments ?? [],
        skills: b?.skills ?? [],
        courses: (courses.data ?? []).map((c) => ({ value: c.id, label: c.title })),
        onAdd: (n) => write('POST', '/needs', n),
        onPlan: (ids, courseId) => write('PATCH', '/needs', { ids, status: 'planned', courseId }),
        onStatus: (ids, status) => write('PATCH', '/needs', { ids, status }),
        onBudget: (departmentId, amount) => write('POST', '/budgets', { departmentId, year: b!.year, amount }),
        onExport: () => files.download(`/budgets/export?year=${b?.year ?? ''}`, 'training-budgets.csv'),
      }}
    />
  );
}
