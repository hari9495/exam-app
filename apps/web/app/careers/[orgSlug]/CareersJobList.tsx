'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CareersJob } from '../../../lib/types';

function formatSalary(job: CareersJob): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.salaryCurrency ? `${job.salaryCurrency} ` : '';
  if (job.salaryMin != null && job.salaryMax != null) return `${currency}${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()}`;
  return `${currency}${(job.salaryMin ?? job.salaryMax)!.toLocaleString()}`;
}

const ALL = '__all__';

export function CareersJobList({ jobs }: { jobs: CareersJob[] }) {
  const [department, setDepartment] = useState(ALL);
  const [location, setLocation] = useState(ALL);

  const departments = useMemo(() => Array.from(new Set(jobs.map((j) => j.department).filter((v): v is string => Boolean(v)))), [jobs]);
  const locations = useMemo(() => Array.from(new Set(jobs.map((j) => j.location).filter((v): v is string => Boolean(v)))), [jobs]);

  const filtered = jobs.filter(
    (j) => (department === ALL || j.department === department) && (location === ALL || j.location === location),
  );

  return (
    <div className="candidate-rise flex flex-col gap-4">
      {(departments.length > 0 || locations.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {departments.length > 0 && (
            <select
              aria-label="Filter by department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="rounded border border-candidate-border px-3 py-2 text-sm"
            >
              <option value={ALL}>All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          {locations.length > 0 && (
            <select
              aria-label="Filter by location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded border border-candidate-border px-3 py-2 text-sm"
            >
              <option value={ALL}>All locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-candidate-text-secondary">No open roles right now</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((job) => {
            const salary = formatSalary(job);
            const meta = [job.department, job.location, job.employmentType?.replace(/_/g, ' ').toLowerCase(), salary].filter(Boolean);
            return (
              <li key={job.applyToken}>
                <Link
                  href={`/apply/${job.applyToken}`}
                  className="block rounded-lg border border-candidate-border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.20)] transition-all hover:border-candidate-primary hover:shadow-[0_2px_4px_rgba(16,24,40,0.06),0_16px_36px_-18px_rgba(16,24,40,0.28)]"
                >
                  <p className="font-display text-base font-bold text-candidate-text">{job.title}</p>
                  {meta.length > 0 && (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-candidate-text-secondary">
                      {meta.join(' · ')}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default CareersJobList;
