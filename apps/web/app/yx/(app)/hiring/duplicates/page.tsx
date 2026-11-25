import { redirect } from 'next/navigation';

// Hiring › Possible duplicates is a tab of the designed HIR-05 candidate list now; the old address opens it.
export default function YxHiringDuplicatesPage() {
  redirect('/yx/hiring/candidates?view=duplicates');
}
