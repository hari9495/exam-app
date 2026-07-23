import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuperAdminActingBanner } from './SuperAdminActingBanner';
import { useAuth } from '../lib/auth-context';

jest.mock('../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('SuperAdminActingBanner', () => {
  it('renders nothing when not acting as super_admin', () => {
    (useAuth as jest.Mock).mockReturnValue({ actingSuperAdmin: false, actingOrgName: null, switchOutOfOrg: jest.fn() });

    const { container } = render(<SuperAdminActingBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the org name and calls switchOutOfOrg when Exit is clicked', async () => {
    const switchOutOfOrg = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ actingSuperAdmin: true, actingOrgName: 'Acme Inc', switchOutOfOrg });

    render(<SuperAdminActingBanner />);

    expect(screen.getByText(/viewing as super_admin/i)).toHaveTextContent('Acme Inc');
    await userEvent.click(screen.getByRole('button', { name: /exit to platform admin/i }));

    expect(switchOutOfOrg).toHaveBeenCalled();
  });
});
