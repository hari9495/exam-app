import { MovedPage } from '../../moved-page';

// The cycles list lives on the PRF-01 HR home ("Review cycles").
// T2-F 82 (answer 2887): the old address shows the moved-page stub for 6 months, then opens the new page.
export default function YxReviewCyclesPage() {
  return <MovedPage from="/yx/performance/cycles" />;
}
