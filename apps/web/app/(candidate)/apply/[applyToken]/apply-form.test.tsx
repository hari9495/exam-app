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
      return new Response(JSON.stringify({ received: true }), { status: 200 });
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

    // M10 AT3: no tokens in the answer; the links go to the applicant's inbox.
    expect(await screen.findByText('Application received')).toBeInTheDocument();
    expect(screen.getByText(/sent an email to jane@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

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
        return new Response(JSON.stringify({ received: true }), { status: 200 });
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

    await screen.findByText('Application received');
    const postCall = (global.fetch as jest.Mock).mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'));
    const body = JSON.parse(postCall![1].body);
    expect(body.customFields).toEqual({ 'def-1': 'https://linkedin.com/in/jane' });
  });

  it('blocks submission when a required apply-visible custom field is left blank', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
        return new Response(JSON.stringify({ received: true }), { status: 200 });
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
    expect(screen.queryByText(/I have read and agree/)).not.toBeInTheDocument();
  });

  it('requires the consent checkbox (legacy single text) and sends it as the application consent at that version', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
        return new Response(JSON.stringify({ received: true }), { status: 200 });
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

    await userEvent.click(screen.getByLabelText(/I have read and agree/));
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);

    await screen.findByText('Application received');
    const postCall = (global.fetch as jest.Mock).mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/apply'));
    const body = JSON.parse(postCall![1].body);
    expect(body.consents).toEqual([{ purpose: 'application', version: 2 }]);
    expect(body.website).toBeUndefined();
  });

  it('shows each consent purpose with its version; the optional one is sent only when ticked; a changed notice is explained', async () => {
    let status = 409;
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/jobs/tok-abc/apply')) {
        return status === 409
          ? new Response(JSON.stringify({ message: 'The privacy notice changed while you were applying. Reload the page and read it again.' }), { status })
          : new Response(JSON.stringify({ received: true }), { status: 201 });
      }
      if (urlString.endsWith('/public/jobs/tok-abc')) {
        return new Response(JSON.stringify({ ...JOB, consents: [
          { purpose: 'application', version: 3, text: 'We use your details for this job.', required: true },
          { purpose: 'talent_pool', version: 1, text: 'We may keep your details for later.', required: false },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;
    render(<ApplyForm />);
    expect(await screen.findByText('We use your details for this job.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Jane Candidate');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
    await userEvent.upload(screen.getByLabelText(/Resume/), new File([new Uint8Array([1])], 'cv.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByLabelText(/required/));
    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));
    expect(await screen.findByText(/privacy notice changed/)).toBeInTheDocument();
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).endsWith('/apply'))![1].body);
    expect(body.consents).toEqual([{ purpose: 'application', version: 3 }]);
    status = 201;
    await userEvent.click(screen.getByLabelText(/other suitable roles/));
    await userEvent.click(screen.getByRole('button', { name: /Submit application/i }));
    expect(await screen.findByText('Application received')).toBeInTheDocument();
  });
});
