'use client';

import { useEffect, useRef, useState } from 'react';
import { StepUpDialog, type MfaProof } from '@yukthix/ui/auth';
import { apiFetch, setStepUpHandler } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { passkeyAssertion } from '../../lib/yx-security';

// Step-up (P12 YX-IAM-02): when the API refuses a sensitive action with STEP_UP_REQUIRED, this
// asks the person to confirm it is them (the YukthiX "Confirm it's you" dialog), then apiFetch sends
// the action again. Several requests needing it at once share one prompt.
export function StepUpProvider() {
  const { accessToken } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);
  const [factors, setFactors] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setStepUpHandler(() => {
      if (!pending.current) {
        let resolve!: (ok: boolean) => void;
        const promise = new Promise<boolean>((r) => (resolve = r));
        pending.current = { promise, resolve };
        setFactors(null);
        setOpen(true);
        apiFetch('/auth/mfa', {}, tokenRef.current ?? undefined)
          .then((status: { factors: { type: string }[] }) => setFactors([...new Set(status.factors.map((f) => f.type))]))
          .catch(() => setFactors([]));
      }
      return pending.current.promise;
    });
    return () => setStepUpHandler(null);
  }, []);

  function finish(ok: boolean) {
    setOpen(false);
    pending.current?.resolve(ok);
    pending.current = null;
  }

  const token = () => tokenRef.current ?? undefined;
  const submit = async (proof: MfaProof) => {
    await apiFetch('/auth/mfa/step-up', { method: 'POST', body: JSON.stringify(proof) }, token());
    finish(true);
  };

  return (
    <StepUpDialog
      open={open}
      onCancel={() => finish(false)}
      factors={factors}
      getPasskey={() => passkeyAssertion(() => apiFetch('/auth/mfa/step-up/passkey-options', { method: 'POST' }, token()))}
      submit={submit}
      setupHref="/yx/me/security"
    />
  );
}
