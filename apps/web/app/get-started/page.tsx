'use client';

import { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { Button, Input, Select, type SelectOption } from '../../components/ui';
import { AuthPageLayout } from '../../components/AuthPageLayout';

const TEAM_SIZE_OPTIONS: SelectOption[] = [
  { value: '1-10', label: '1-10' },
  { value: '11-50', label: '11-50' },
  { value: '51-200', label: '51-200' },
  { value: '200+', label: '200+' },
];

const HIGHLIGHTS = [
  'AI-drafted question banks your team reviews before they go out',
  'Proctored, timed exams with integrity signals on every attempt',
  'Panel-ready reports the moment a candidate submits',
];

export default function GetStartedPage() {
  const [name, setName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState(TEAM_SIZE_OPTIONS[0].value);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/leads', {
        method: 'POST',
        body: JSON.stringify({ name, workEmail, company, teamSize, message: message || undefined }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong -- please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <AuthPageLayout
        title="Get Started"
        panelHeading="Automate early screens."
        panelCopy="Focus human judgment on what matters. Prudent Hire runs the first round end to end, so your panel only meets the candidates worth meeting."
        panelHighlights={HIGHLIGHTS}
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={32} className="text-status-success" aria-hidden="true" />
            <p className="text-sm font-semibold text-recruiter-text">Thanks — we got it.</p>
            <p className="text-sm text-recruiter-text-secondary">
              Someone from our team will reach out to {workEmail} shortly to set up your organization.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-recruiter-text-secondary">
              Tell us about your team and we&apos;ll set up your organization.
            </p>
            {error && (
              <p
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger"
              >
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </p>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input label="Name" value={name} onChange={setName} required />
              <Input label="Work email" type="email" value={workEmail} onChange={setWorkEmail} required />
              <Input label="Company" value={company} onChange={setCompany} required />
              <Select label="Team size" value={teamSize} onChange={setTeamSize} options={TEAM_SIZE_OPTIONS} />
              <div className="flex flex-col gap-1">
                <label htmlFor="get-started-message" className="text-sm font-medium text-gray-700">
                  What are you hoping to screen for? (optional)
                </label>
                <textarea
                  id="get-started-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <Button type="submit" loading={submitting}>
                Request access
              </Button>
            </form>
          </>
        )}
      </AuthPageLayout>
    </MotionConfig>
  );
}
