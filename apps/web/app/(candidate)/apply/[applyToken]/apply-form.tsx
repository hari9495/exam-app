'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '../../../../lib/api-client';
import { EMAIL_PATTERN } from '../../../../lib/candidateValidation';
import { CustomFieldInputMap, PublicJob } from '../../../../lib/types';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';
import { CustomFieldsInputs } from '../../../../components/CustomFieldsInputs';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Backend expects raw base64 (Buffer.from(x, 'base64')) -- strip the
// "data:application/pdf;base64," prefix FileReader's readAsDataURL adds.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export default function ApplyForm() {
  const { applyToken } = useParams<{ applyToken: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomFieldInputMap>({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusToken, setStatusToken] = useState<string | null>(null);
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [autofilling, setAutofilling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/jobs/${applyToken}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: PublicJob) => {
        if (!cancelled) setJob(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyToken]);

  // Best-effort: when a valid PDF is attached, ask the server to read contact details out of it
  // and prefill ONLY the fields the applicant hasn't already filled. Silently does nothing on any
  // failure (or when the org has no AI key configured — the endpoint returns {}). The functional
  // setState reads the latest value so we never clobber what the applicant typed.
  async function autofillFromResume(f: File) {
    if (f.type !== 'application/pdf' || f.size > MAX_RESUME_BYTES) return;
    setAutofilling(true);
    try {
      const resumeBase64 = await readFileAsBase64(f);
      const res = await fetch(`${API_BASE}/public/jobs/${applyToken}/parse-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeBase64 }),
      });
      if (!res.ok) return;
      const data: { name?: string; email?: string; phone?: string } = await res.json();
      if (data.name) setName((cur) => (cur.trim() ? cur : data.name!));
      if (data.email) setEmail((cur) => (cur.trim() ? cur : data.email!));
      if (data.phone) setPhone((cur) => (cur.trim() ? cur : data.phone!));
    } catch {
      // Autofill is a convenience — never surface an error; the applicant just fills the form.
    } finally {
      setAutofilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!job) return;
    if (!name.trim()) {
      setSubmitError('Enter your name.');
      return;
    }
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) {
      setSubmitError('Enter a valid email address.');
      return;
    }
    // Mirrors the server's requirement check (public-applications.service.ts) -- the server stays
    // authoritative (a required apply-visible field is enforced there regardless), this just
    // avoids a round trip for the common case.
    for (const def of job.customFields) {
      if (def.required) {
        const v = customFields[def.definitionId];
        if (v === undefined || v === null || v === '') {
          setSubmitError(`${def.label} is required.`);
          return;
        }
      }
    }
    if (!file) {
      setFileError('Attach your resume (PDF).');
      return;
    }
    if (file.type !== 'application/pdf') {
      setFileError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setFileError('File must be 5 MB or smaller.');
      return;
    }
    const requiresConsent = Boolean(job.applyConsentText && job.applyConsentText.trim());
    if (requiresConsent && !consentAccepted) {
      setSubmitError('You must accept the consent statement to apply.');
      return;
    }
    setFileError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const resumeBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API_BASE}/public/jobs/${applyToken}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: phone.trim() || undefined,
          resumeBase64,
          customFields,
          ...(requiresConsent ? { consentAccepted } : {}),
        }),
      });
      if (!res.ok) throw new Error('Submission failed. Please try again.');
      const data = await res.json();
      setStatusToken(data.statusToken);
      setPortalToken(data.portalToken ?? null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadFailed) {
    return <TerminalCard tone="error" title="Not accepting applications" body="This role isn't accepting applications." />;
  }

  if (!job) {
    return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;
  }

  if (statusToken) {
    return (
      <TerminalCard tone="success" title="Application submitted" body="Thanks for applying — we'll be in touch.">
        <div className="flex flex-col gap-2">
          {portalToken && (
            <Link href={`/portal/${portalToken}`} className="text-sm font-medium text-candidate-primary underline">
              View all your applications
            </Link>
          )}
          <Link href={`/application/${statusToken}`} className="text-sm font-medium text-candidate-primary underline">
            Track this application
          </Link>
        </div>
      </TerminalCard>
    );
  }

  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-4 sm:p-8">
      <div className="candidate-rise rounded-lg border border-candidate-border bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.20)]">
        <div className="mb-4 flex items-center gap-3">
          {job.orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.orgLogo} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
          ) : null}
          <p className="text-sm font-semibold text-candidate-text-secondary">{job.orgName}</p>
        </div>
        <h1 className="mb-2 font-display text-xl font-bold text-candidate-text">{job.jobTitle}</h1>
        {job.location || job.employmentType ? (
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-candidate-text-secondary">
            {[job.location, job.employmentType?.replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {job.jobDescription ? (
          <p className="mb-6 whitespace-pre-wrap text-sm text-candidate-text-secondary">{job.jobDescription}</p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {submitError ? (
            <p role="alert" className="rounded-md bg-candidate-danger-bg px-3 py-2 text-sm text-candidate-danger">
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <label htmlFor="apply-name" className="text-sm font-medium text-candidate-text">
              Name
            </label>
            <input
              id="apply-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none focus:ring-2 focus:ring-candidate-primary/20"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="apply-email" className="text-sm font-medium text-candidate-text">
              Email
            </label>
            <input
              id="apply-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none focus:ring-2 focus:ring-candidate-primary/20"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="apply-phone" className="text-sm font-medium text-candidate-text">
              Phone (optional)
            </label>
            <input
              id="apply-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none focus:ring-2 focus:ring-candidate-primary/20"
            />
          </div>

          {job.customFields.length > 0 && (
            <CustomFieldsInputs
              definitions={job.customFields.map((f) => ({ id: f.definitionId, label: f.label, fieldType: f.fieldType, options: f.options, required: f.required }))}
              values={customFields}
              onChange={setCustomFields}
            />
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="apply-resume" className="text-sm font-medium text-candidate-text">
              Resume (PDF, max 5 MB)
            </label>
            <input
              id="apply-resume"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setFileError(null);
                if (picked) void autofillFromResume(picked);
              }}
              required
              className="text-sm text-candidate-text-secondary"
            />
            {autofilling ? <p className="text-xs text-candidate-text-tertiary">Reading your résumé to prefill the form…</p> : null}
            {fileError ? <p className="text-xs text-candidate-danger">{fileError}</p> : null}
          </div>

          {job.applyConsentText && job.applyConsentText.trim() ? (
            <div className="flex flex-col gap-2">
              <p className="whitespace-pre-wrap text-xs text-candidate-text-secondary">{job.applyConsentText}</p>
              <label className="flex items-start gap-2 text-sm text-candidate-text">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-candidate-border"
                />
                I have read and agree to the above.
              </label>
            </div>
          ) : null}

          <CandidateButton
            type="submit"
            disabled={submitting || (Boolean(job.applyConsentText?.trim()) && !consentAccepted)}
            className="w-full"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </CandidateButton>
        </form>
      </div>
    </div>
  );
}
