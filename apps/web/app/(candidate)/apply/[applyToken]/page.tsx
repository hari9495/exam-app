'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '../../../../lib/api-client';
import { EMAIL_PATTERN } from '../../../../lib/candidateValidation';
import { PublicJob } from '../../../../lib/types';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

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

export default function ApplyPage() {
  const { applyToken } = useParams<{ applyToken: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusToken, setStatusToken] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setSubmitError('Enter your name.');
      return;
    }
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) {
      setSubmitError('Enter a valid email address.');
      return;
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
    setFileError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const resumeBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API_BASE}/public/jobs/${applyToken}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone.trim() || undefined, resumeBase64 }),
      });
      if (!res.ok) throw new Error('Submission failed. Please try again.');
      const data = await res.json();
      setStatusToken(data.statusToken);
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
        <Link href={`/application/${statusToken}`} className="text-sm font-medium text-candidate-primary underline">
          Track your application
        </Link>
      </TerminalCard>
    );
  }

  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-4 sm:p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          {job.orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.orgLogo} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
          ) : null}
          <p className="text-sm font-semibold text-candidate-text-secondary">{job.orgName}</p>
        </div>
        <h1 className="mb-2 font-display text-xl font-bold text-candidate-text">{job.jobTitle}</h1>
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
              className="w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none"
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
              className="w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none"
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
              className="w-full rounded border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="apply-resume" className="text-sm font-medium text-candidate-text">
              Resume (PDF, max 5 MB)
            </label>
            <input
              id="apply-resume"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setFileError(null);
              }}
              required
              className="text-sm text-candidate-text-secondary"
            />
            {fileError ? <p className="text-xs text-candidate-danger">{fileError}</p> : null}
          </div>

          <CandidateButton type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Submitting…' : 'Submit application'}
          </CandidateButton>
        </form>
      </div>
    </div>
  );
}
