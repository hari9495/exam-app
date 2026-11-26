import { redirect } from 'next/navigation';

// Batch T2-C (2411): the old Settings › Performance set-up copy is retired; its review templates, rating scales and
// skills library are lists on the drawn 6.3 page, and competencies are the PRF-14 framework. The old address opens 6.3.
export default function YxPerformanceSetupPage() {
  redirect('/yx/settings/talent/performance');
}
