import { MovedPage } from '../../moved-page';

// Batch T2-C (2411): the old Settings › Performance copy is retired; 6.3 holds it.
// T2-F 82 (answer 2887): the old address shows the moved-page stub for 6 months, then opens the new page.
export default function YxPerformanceSetupPage() {
  return <MovedPage from="/yx/settings/performance" />;
}
