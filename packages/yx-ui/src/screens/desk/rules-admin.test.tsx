import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RulesAdmin, type RulesAdminProps } from './rules-admin';
import { RULES, RULE_SCHEMA, WEBHOOKS } from './esm-data';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const props = (over: Partial<RulesAdminProps> = {}): RulesAdminProps => ({
  rules: RULES, schema: RULE_SCHEMA, webhooks: WEBHOOKS, onSave: vi.fn().mockResolvedValue(undefined), onStatus: vi.fn().mockResolvedValue(undefined), onRuns: vi.fn().mockResolvedValue([]),
  onDryRun: vi.fn(), onInstall: vi.fn().mockResolvedValue(undefined), onAddWebhook: vi.fn().mockResolvedValue({ secret: 'whsec_44aa' }), onWebhookActive: vi.fn().mockResolvedValue(undefined), ...over,
});

describe('desk rules (SD-2.05)', () => {
  it('Save on a new rule with no name asks for one', async () => {
    const p = props();
    render(<RulesAdmin {...p} />);
    await ue.click(screen.getByRole('button', { name: 'New rule' }));
    await ue.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name the rule.')).toBeInTheDocument();
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('Add webhook pressed empty names what is missing; added, the secret stays to copy', async () => {
    const p = props();
    render(<RulesAdmin {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add webhook' }));
    expect(await screen.findByText('Name the webhook.')).toBeInTheDocument();
    expect(screen.getByText('Give the https address.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Webhook name' })).toHaveFocus();
    await ue.type(screen.getByRole('textbox', { name: 'Webhook name' }), 'Board');
    await ue.type(screen.getByRole('textbox', { name: 'Webhook address' }), 'https://board.test/h');
    await ue.click(screen.getByRole('button', { name: 'Add webhook' }));
    expect(await screen.findByText('Copy the signing secret now')).toBeInTheDocument();
    expect(p.onAddWebhook).toHaveBeenCalledWith({ name: 'Board', url: 'https://board.test/h' });
  });
});
