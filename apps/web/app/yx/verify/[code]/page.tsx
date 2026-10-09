'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { VerifyDocumentScreen, type VerifyResult } from '@yukthix/ui/pay';
import { apiFetch } from '../../../../lib/api-client';

// The public verify page of a pay document (YX-DOC-11): no sign-in; shows only the company, the kind, the name, the
// date and whether it is current or superseded.
export default function YxVerifyDocumentPage() {
  const params = useParams<{ code: string }>();
  const [code, setCode] = useState(decodeURIComponent(params.code ?? ''));
  return <VerifyDocumentScreen code={code} onCode={setCode} onCheck={(c) => apiFetch(`/public/pay/verify/${encodeURIComponent(c)}`) as Promise<VerifyResult>} />;
}
