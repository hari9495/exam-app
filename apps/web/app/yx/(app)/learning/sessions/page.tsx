'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { LiveSessionsScreen, type CourseRow, type LiveSessionRow, type LiveTrainerRow } from '@yukthix/ui/frame';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces } from '../../../../../lib/yx-lifecycle';
import { useLearning, useLearningWrite } from '../../../../../lib/yx-learning';
import { learnState } from '../my-learning';

// Learning › Sessions (LRN-04): L&D schedules sessions and keeps the trainers; an internal trainer sees their own.
export default function YxSessionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const ld = useYxPermissions().has('learning.manage');
  const [view, setView] = useState<'list' | 'trainers'>('list');
  const sessions = useLearning<LiveSessionRow[]>('/sessions');
  const trainers = useLearning<LiveTrainerRow[]>(ld ? '/trainers' : null);
  const courses = useLearning<(CourseRow & { typeKey: string })[]>(ld ? '/admin/courses' : null);
  const places = useJoinerPlaces(ld);
  const write = useLearningWrite();
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast({ tone: 'success', title: done });
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not work. Try again.' });
      throw e;
    }
  };
  return (
    <LiveSessionsScreen
      live={{
        state: learnState(loadState(sessions)),
        onRetry: () => void sessions.refetch(),
        sessions: sessions.data ?? null,
        ld,
        trainers: trainers.data ?? null,
        courses: (courses.data ?? []).filter((c) => c.status === 'published' && (c.typeKey === 'classroom' || c.typeKey === 'virtual')).map((c) => ({ value: c.id, label: c.title })),
        employees: places.managers,
        view,
        onView: setView,
        onOpen: (id) => router.push(`/yx/learning/sessions/${encodeURIComponent(id)}`),
        onSchedule: (input) => run(() => write('POST', '/sessions', input), 'Session scheduled'),
        onAddTrainer: (input) => run(() => write('POST', '/trainers', input), `${input.external ? input.name : 'The trainer'} added`),
      }}
    />
  );
}
