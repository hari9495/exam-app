import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CareersSiteScreen } from './careers';
import { JobBoardsScreen } from './boards';
import { boards, careers } from './careers.stories';

// Recruitment batch AT3 (M10-BUILD-DESIGN §6, §13).

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Careers site (AT3)', () => {
  it('saves the public page settings', async () => {
    const onSave = vi.fn(async () => ({}));
    render(<CareersSiteScreen {...careers} onSave={onSave} />);
    await ue.click(screen.getByRole('checkbox', { name: /Careers assistant/ }));
    await ue.click(screen.getByRole('button', { name: 'Save public page' }));
    expect(onSave).toHaveBeenCalledWith({ enabled: true, assistantEnabled: true, headline: 'Grow with Kaveri', intro: 'We make food people trust.' });
    expect(screen.getByRole('link', { name: 'Open the careers site' })).toHaveAttribute('href', careers.publicUrl);
  });

  it('a company page needs a plain web address and a hex colour', async () => {
    const onSaveEntity = vi.fn(async () => ({}));
    render(<CareersSiteScreen {...careers} onSaveEntity={onSaveEntity} />);
    await ue.click(screen.getByRole('button', { name: 'Set up page for Kaveri Retail LLP' }));
    const d = screen.getByRole('dialog');
    const save = within(d).getByRole('button', { name: 'Save page' });
    await ue.click(save);
    expect(within(d).getByText('Enter the web address.')).toBeInTheDocument();
    await ue.type(within(d).getByLabelText(/Web address/), 'Kaveri Retail');
    await ue.click(save);
    expect(onSaveEntity).not.toHaveBeenCalled();
    await ue.clear(within(d).getByLabelText(/Web address/));
    await ue.type(within(d).getByLabelText(/Web address/), 'kaveri-retail');
    await ue.type(within(d).getByLabelText(/Brand colour/), 'red');
    await ue.click(save);
    expect(onSaveEntity).not.toHaveBeenCalled();
    await ue.clear(within(d).getByLabelText(/Brand colour/));
    await ue.type(within(d).getByLabelText(/Brand colour/), '#112233');
    await ue.click(save);
    expect(onSaveEntity).toHaveBeenCalledWith('e2', { slug: 'kaveri-retail', headline: null, intro: null, primaryColor: '#112233' });
  });

  it('publishes a new notice version only when the words change', async () => {
    const onPublishNotice = vi.fn(async () => ({}));
    render(<CareersSiteScreen {...careers} onPublishNotice={onPublishNotice} />);
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

describe('Job boards (AT3)', () => {
  it('copies a feed link, and a push board asks for its account details', async () => {
    const onCopy = vi.fn(async () => ({}));
    const onSave = vi.fn(async () => ({}));
    render(<JobBoardsScreen {...boards} onCopy={onCopy} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Copy feed link' }));
    expect(onCopy).toHaveBeenCalledWith(boards.boards[0].feedUrl);
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: 'Set up LinkedIn' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save board' }));
    expect(within(d).getAllByText(/^Enter the /)).toHaveLength(2);
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/Access token/), 'secret-token');
    await ue.type(within(d).getByLabelText(/Organisation URN/), 'urn:li:organization:9');
    await ue.click(within(d).getByRole('button', { name: 'Save board' }));
    expect(onSave).toHaveBeenCalledWith(boards.boards[1], { name: 'LinkedIn', provider: 'linkedin', config: { accessToken: 'secret-token', organizationUrn: 'urn:li:organization:9' } });
  });

  it('records a posting cost against a board', async () => {
    const onAddCost = vi.fn(async () => ({}));
    render(<JobBoardsScreen {...boards} onAddCost={onAddCost} />);
    await ue.click(screen.getByRole('button', { name: 'Record a posting cost' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByLabelText(/Amount/), '4500');
    await ue.click(within(d).getByRole('button', { name: 'Record cost' }));
    expect(onAddCost).toHaveBeenCalledWith({ jobBoardId: 'b1', jobId: null, amount: 4500, currency: 'INR', note: null });
  });
});
