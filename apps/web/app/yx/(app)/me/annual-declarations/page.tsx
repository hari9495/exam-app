import { permanentRedirect } from 'next/navigation';

// Moved under Me › Declarations (founder 28 Oct 2026); old links and notifications still land here.
export default function OldAnnualDeclarationsPage() {
  permanentRedirect('/yx/me/declarations/annual');
}
