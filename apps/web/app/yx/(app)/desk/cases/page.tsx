'use client';

import { useRouter } from 'next/navigation';
import { CaseListScreen, type CaseListRow } from '@yukthix/ui/desk';
import { deskState, useDesk } from '../../../../../lib/yx-desk';

// Helpdesk › Cases: the designed HLP-08 case list with `live`. Only the cases the person is a member of (and has not
// stepped aside from); a row opens the case. The API checks membership (docs/yukthix/helpdesk-design-map.md 4f).
export default function YxCasesPage() {
  const router = useRouter();
  const list = useDesk<CaseListRow[]>('/cases');
  return <CaseListScreen live={{ state: deskState(list), onRetry: () => void list.refetch(), cases: list.data ?? [], onOpen: (c) => router.push(`/yx/desk/cases/${encodeURIComponent(c)}`) }} />;
}
