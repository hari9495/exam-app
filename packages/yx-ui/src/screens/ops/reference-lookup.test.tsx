import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReferenceLookupDialog } from './reference-lookup';

// Answer 947: support looks up the reference a person read out from a Not found page.
describe('Look up a Not found reference', () => {
  it('a code not in the NF-XXXXXX shape is named on the field, which takes focus; nothing is asked', async () => {
    const onLookUp = vi.fn();
    render(<ReferenceLookupDialog onLookUp={onLookUp} onClose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Reference/ }), 'NF-12');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByText('Type the reference as shown, like NF-7KQ2MP.')).toBeInTheDocument();
    expect(document.activeElement?.id).toBe('nf-code');
    expect(onLookUp).not.toHaveBeenCalled();
  });

  it('shows who, when and which page; an unknown code says so', async () => {
    const onLookUp = vi.fn().mockResolvedValueOnce({ code: 'NF-7KQ2MP', at: '2026-11-11T05:42:00.000Z', who: 'Anitha Rao', path: '/yx/people/abc' }).mockRejectedValueOnce(new Error('No such reference in your company.'));
    render(<ReferenceLookupDialog onLookUp={onLookUp} onClose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Reference/ }), ' nf-7kq2mp ');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(onLookUp).toHaveBeenCalledWith('NF-7KQ2MP'));
    expect(await screen.findByText('Anitha Rao')).toBeInTheDocument();
    expect(screen.getByText('/yx/people/abc')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('No such reference in your company.')).toBeInTheDocument();
    expect(screen.queryByText('Anitha Rao')).toBeNull();
  });
});
