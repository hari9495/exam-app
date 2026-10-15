import { jobPosting } from './job-posting';
import { ldJson } from '../../../../../lib/request-origin';

const job = {
  slug: 'senior-accountant-chennai-abc123', applyToken: 't', title: 'Senior Accountant', location: 'Chennai', employmentType: 'FULL_TIME', department: 'Finance',
  salaryMin: null, salaryMax: null, salaryCurrency: null, company: { name: 'Kaveri Foods', slug: 'kaveri' }, postedAt: '2026-10-01T00:00:00.000Z',
  description: 'Keep the books </script><script>alert(1)</script>', orgName: 'Kaveri Group', logoUrl: null, primaryColor: null,
};

describe('jobPosting (Google for Jobs)', () => {
  it('has the required fields, the entity as employer, and no salary unless the job shows it', () => {
    const ld = jobPosting(job, 'https://hr.example/careers/k/jobs/x');
    expect(ld).toMatchObject({ '@type': 'JobPosting', title: 'Senior Accountant', datePosted: job.postedAt, url: 'https://hr.example/careers/k/jobs/x', hiringOrganization: { name: 'Kaveri Foods' }, employmentType: 'FULL_TIME' });
    expect(ld.description).toContain('Keep the books');
    expect(ld.baseSalary).toBeUndefined();
    expect(jobPosting({ ...job, salaryMin: 900000, salaryMax: 1200000, salaryCurrency: 'INR' }, 'u').baseSalary).toMatchObject({ currency: 'INR', value: { minValue: 900000, maxValue: 1200000 } });
    expect(jobPosting({ ...job, location: null }, 'u').jobLocationType).toBe('TELECOMMUTE');
  });

  it('job text can never close the JSON-LD script block', () => {
    const out = ldJson(jobPosting(job, 'u'));
    expect(out).not.toContain('<');
    expect(JSON.parse(out).description).toContain('</script>');
  });
});
