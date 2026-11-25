'use client';

import { useParams } from 'next/navigation';
import { VerifyPageScreen, type VerifyResult } from '@yukthix/ui/pay';
import { apiFetch } from '../../../../lib/api-client';

// The public verify page of a pay document (YX-DOC-11, design T9-08): no sign-in; shows only the company, the kind,
// the name, the date and whether it is current or superseded. The code in the address is checked at once.
export default function YxVerifyDocumentPage() {
  const params = useParams<{ code: string }>();
  return (
    <VerifyPageScreen
      tenant="YukthiX"
      docs={[]}
      code={decodeURIComponent(params.code ?? '')}
      live={{ onCheck: (c) => apiFetch(`/public/pay/verify/${encodeURIComponent(c)}`) as Promise<VerifyResult> }}
    />
  );
}
