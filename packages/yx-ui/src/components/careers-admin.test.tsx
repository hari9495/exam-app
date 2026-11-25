import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CareersCompanyPages, CareersNotices } from './careers-admin';
import { PageBuilder, type CareersConfig } from './careers';
import { entities, notices } from '../stories/careers.stories';

// Surfaces/Careers staff side (founder decision 8): the builder's live site settings, company pages and versioned
// notices, moved here from the old stand-in with every setting it had. Buttons are never greyed out.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const CONFIG: CareersConfig = { companyName: 'Nilgiri Foods', theme: 'classic', sections: [{ id: 'hero-1', type: 'hero', title: 'Bake with us', text: '' }, { id: 'jobs-1', type: 'jobs', title: 'Open jobs' }] };

describe('Page builder site settings', () => {
  it('publishes; a broken colour points at the field instead; assistant, photo and offline are there', async () => {
    const onPublish = vi.fn();
    const onAssistantChange = vi.fn();
    const onUnpublish = vi.fn();
    const site = { publicUrl: 'https://x/yx/careers/nilgiri', bannerUrl: null, onUploadBanner: vi.fn(async () => undefined), assistantEnabled: false, onAssistantChange, onUnpublish };
    const { rerender } = render(<PageBuilder value={{ ...CONFIG, accent: '#12' }} onChange={() => undefined} jobs={[]} status="published" onPublish={onPublish} site={site} />);
    await ue.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a 6-digit hex colour like 1F6F4A')).toBeInTheDocument();
    expect(screen.getByLabelText(/Accent colour/)).toHaveFocus();
    rerender(<PageBuilder value={{ ...CONFIG, accent: '#1F6F4A' }} onChange={() => undefined} jobs={[]} status="published" onPublish={onPublish} site={site} />);
    await ue.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    await ue.click(screen.getByRole('checkbox', { name: /Careers assistant/ }));
    expect(onAssistantChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('link', { name: 'Open the careers site' })).toHaveAttribute('href', site.publicUrl);
    await ue.click(screen.getByRole('button', { name: 'Take the page offline' }));
    expect(onUnpublish).toHaveBeenCalled();
    expect(screen.getByText(/Hero photo/)).toBeInTheDocument();
  });

  it('a draft page has no link and no offline button', () => {
    render(<PageBuilder value={CONFIG} onChange={() => undefined} jobs={[]} status="draft" site={{ publicUrl: 'u', bannerUrl: null, onUploadBanner: async () => undefined, assistantEnabled: false, onAssistantChange: () => undefined, onUnpublish: () => undefined }} />);
    expect(screen.queryByRole('link', { name: 'Open the careers site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take the page offline' })).not.toBeInTheDocument();
  });
});

describe('Company pages', () => {
  it('a company page needs a plain web address and a hex colour', async () => {
    const onSaveEntity = vi.fn(async () => ({}));
    render(<CareersCompanyPages entities={entities} onSaveEntity={onSaveEntity} onRemoveEntity={async () => ({})} />);
    await ue.click(screen.getByRole('button', { name: 'Set up page for Nilgiri Retail LLP' }));
    const d = screen.getByRole('dialog');
    const save = within(d).getByRole('button', { name: 'Save page' });
    await ue.click(save);
    expect(within(d).getByText('Enter the web address.')).toBeInTheDocument();
    await ue.type(within(d).getByLabelText(/Web address/), 'Nilgiri Retail');
    await ue.click(save);
    expect(onSaveEntity).not.toHaveBeenCalled();
    await ue.clear(within(d).getByLabelText(/Web address/));
    await ue.type(within(d).getByLabelText(/Web address/), 'nilgiri-retail');
    await ue.type(within(d).getByLabelText(/Brand colour/), 'red');
    await ue.click(save);
    expect(onSaveEntity).not.toHaveBeenCalled();
    await ue.clear(within(d).getByLabelText(/Brand colour/));
    await ue.type(within(d).getByLabelText(/Brand colour/), '#112233');
    await ue.click(save);
    expect(onSaveEntity).toHaveBeenCalledWith('e2', { slug: 'nilgiri-retail', headline: null, intro: null, primaryColor: '#112233' });
  });

  it('removing a page asks first', async () => {
    const onRemoveEntity = vi.fn(async () => ({}));
    render(<CareersCompanyPages entities={entities} onSaveEntity={async () => ({})} onRemoveEntity={onRemoveEntity} />);
    await ue.click(screen.getByRole('button', { name: 'Remove page' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove page' }));
    expect(onRemoveEntity).toHaveBeenCalledWith('e1');
  });
});

describe('Privacy notices', () => {
  it('publishes a new version only when the words change', async () => {
    const onPublishNotice = vi.fn(async () => ({}));
    render(<CareersNotices notices={notices} onPublishNotice={onPublishNotice} />);
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Publish a new version: applying for a job/ }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Publish version' }));
    expect(within(d).getByText('Change the words to publish a new version.')).toBeInTheDocument();
    expect(onPublishNotice).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/Notice text/), ' Ask us to delete them any time.');
    await ue.click(within(d).getByRole('button', { name: 'Publish version' }));
    expect(onPublishNotice).toHaveBeenCalledWith('application', expect.stringContaining('delete them any time'));
  });
});
