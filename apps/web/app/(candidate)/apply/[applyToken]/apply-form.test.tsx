import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import ApplyForm from './apply-form';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const JOB = {
  jobTitle: 'Senior Backend Engineer',
  jobDescription: 'Build the pipeline.',
  orgName: 'Acme Corp',
  orgLogo: null,
  customFields: [],
};

function mockFetch() {
  global.fetch = jest.fn(async (url, options) => {
    const urlString = String(url);
    if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
      return new Response(JSON.stringify({ statusToken: 'tok-1' }), { status: 200 });
    }
    // Résumé autofill fires on file-select; return no fields so it's a no-op for these tests.
    if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/parse-resume')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlString.endsWith('/public/jobs/tok-abc')) {
      return new Response(JSON.stringify(JOB), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as unknown as typeof fetch;
}

describe('ApplyForm', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ applyToken: 'tok-abc' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads the job, submits the application, and shows the status link', async () => {
    mockFetch();
    render(<ApplyForm />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');

    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));

    const link = await screen.findByRole('link', { name: 'Track this application' });
    expect(link).toHaveAttribute('href', '/application/tok-1');

    const postCall = (global.fetch as jest.Mock).mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'));
    expect(postCall).toBeDefined();
    expect(String(postCall![0])).toBe('http://localhost:3001/api/v1/public/jobs/tok-abc/apply');
    const body = JSON.parse(postCall![1].body);
    expect(body).toMatchObject({ name: 'Jane Candidate', email: 'jane@example.com' });
    expect(body.resumeBase64).toBeTruthy();
    // Raw base64, not a data: URL -- must match the backend's @IsBase64 + Buffer.from(x, 'base64').
    expect(body.resumeBase64).not.toContain('data:');
  });

  it('blocks submission and shows an inline error when name is blank', async () => {
    mockFetch();
    render(<ApplyForm />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your name.');
    expect((global.fetch as jest.Mock).mock.calls.some(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'))).toBe(false);
  });

  it('blocks submission and shows an inline error when email is invalid', async () => {
    mockFetch();
    render(<ApplyForm />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect((global.fetch as jest.Mock).mock.calls.some(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'))).toBe(false);
  });

  it('renders apply-visible custom fields and forwards them in the apply POST body', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
        return new Response(JSON.stringify({ statusToken: 'tok-1' }), { status: 200 });
      }
      if (urlString.endsWith('/public/jobs/tok-abc')) {
        return new Response(
          JSON.stringify({
            ...JOB,
            customFields: [{ definitionId: 'def-1', key: 'linkedin', label: 'LinkedIn URL', fieldType: 'text', options: null, required: true }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
    render(<ApplyForm />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText(/LinkedIn URL/), 'https://linkedin.com/in/jane');
    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));

    await screen.findByRole('link', { name: 'Track this application' });
    const postCall = (global.fetch as jest.Mock).mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'));
    const body = JSON.parse(postCall![1].body);
    expect(body.customFields).toEqual({ 'def-1': 'https://linkedin.com/in/jane' });
  });

  it('blocks submission when a required apply-visible custom field is left blank', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
        return new Response(JSON.stringify({ statusToken: 'tok-1' }), { status: 200 });
      }
      if (urlString.endsWith('/public/jobs/tok-abc')) {
        return new Response(
          JSON.stringify({
            ...JOB,
            customFields: [{ definitionId: 'def-1', key: 'linkedin', label: 'LinkedIn URL', fieldType: 'text', options: null, required: true }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
    render(<ApplyForm />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('LinkedIn URL is required.');
    expect((global.fetch as jest.Mock).mock.calls.some(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'))).toBe(false);
  });

  it('shows a generic message when the job is not accepting applications', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 404 })) as unknown as typeof fetch;
    render(<ApplyForm />);

    expect(await screen.findByText("This role isn't accepting applications.")).toBeInTheDocument();
  });

  // --- Zoho #21 candidate consent capture ---

  it('renders no consent checkbox when the job has no applyConsentText configured', async () => {
    mockFetch();
    render(<ApplyForm />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('I have read and agree to the above.')).not.toBeInTheDocument();
  });

  it('requires the consent checkbox and blocks submission until checked, then sends consentAccepted:true', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
        return new Response(JSON.stringify({ statusToken: 'tok-1' }), { status: 200 });
      }
      if (urlString.endsWith('/public/jobs/tok-abc')) {
        return new Response(
          JSON.stringify({ ...JOB, applyConsentText: 'We will process your data per our privacy policy.', applyConsentVersion: 2 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
    render(<ApplyForm />);

    expect(await screen.findByText('We will process your data per our privacy policy.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Resume/), file);

    const submitButton = screen.getByRole('button', { name: /Submit application/i });
    expect(submitButton).toBeDisabled();
    await userEvent.click(submitButton);
    expect((global.fetch as jest.Mock).mock.calls.some(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'))).toBe(false);

    await userEvent.click(screen.getByLabelText('I have read and agree to the above.'));
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);

    await screen.findByRole('link', { name: 'Track this application' });
    const postCall = (global.fetch as jest.Mock).mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'));
    const body = JSON.parse(postCall![1].body);
    expect(body.consentAccepted).toBe(true);
  });
});
