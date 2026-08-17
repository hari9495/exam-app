import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import ApplyPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const JOB = {
  jobTitle: 'Senior Backend Engineer',
  jobDescription: 'Build the pipeline.',
  orgName: 'Acme Corp',
  orgLogo: null,
};

function mockFetch() {
  global.fetch = jest.fn(async (url, options) => {
    const urlString = String(url);
    if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
      return new Response(JSON.stringify({ statusToken: 'tok-1' }), { status: 200 });
    }
    if (urlString.endsWith('/public/jobs/tok-abc')) {
      return new Response(JSON.stringify(JOB), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as unknown as typeof fetch;
}

describe('ApplyPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ applyToken: 'tok-abc' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads the job, submits the application, and shows the status link', async () => {
    mockFetch();
    render(<ApplyPage />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');

    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));

    const link = await screen.findByRole('link', { name: 'Track your application' });
    expect(link).toHaveAttribute('href', '/application/tok-1');

    const postCall = (global.fetch as jest.Mock).mock.calls.find(([, options]) => options?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(String(postCall![0])).toBe('http://localhost:3001/api/v1/public/jobs/tok-abc/apply');
    const body = JSON.parse(postCall![1].body);
    expect(body).toMatchObject({ name: 'Jane Candidate', email: 'jane@example.com' });
    expect(body.resumeBase64).toBeTruthy();
    // Raw base64, not a data: URL -- must match the backend's @IsBase64 + Buffer.from(x, 'base64').
    expect(body.resumeBase64).not.toContain('data:');
  });

  it('shows a generic message when the job is not accepting applications', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 404 })) as unknown as typeof fetch;
    render(<ApplyPage />);

    expect(await screen.findByText("This role isn't accepting applications.")).toBeInTheDocument();
  });
});
