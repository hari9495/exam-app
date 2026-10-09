import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentityProvidersScreen, idpDraftOf, idpInput, type IdentityProvidersScreenProps } from './identity-providers';
import type { IdentityProviderDetail } from './types';

const GOOGLE: IdentityProviderDetail = {
  id: 'p-1', name: 'Kaveri Google', type: 'oidc_google', status: 'active', domains: ['kaverifoods.in'], jitEnabled: false,
  samlEntityId: null, samlSsoUrl: null, samlCertificate: null, oidcIssuer: 'https://accounts.google.com', oidcClientId: 'client-1', entraTenantId: null, jitRole: null, mfaTrusted: false, clientSecretSet: true,
};
const SAML: IdentityProviderDetail = {
  ...GOOGLE, id: 'p-2', name: 'Okta', type: 'saml', status: 'disabled', domains: [], oidcIssuer: null, oidcClientId: null, clientSecretSet: false,
  samlEntityId: 'http://okta/abc', samlSsoUrl: 'https://okta.example/sso', samlCertificate: '-----BEGIN CERTIFICATE-----\nMII\n-----END CERTIFICATE-----',
};
const METADATA = 'https://api.yukthix.in/api/v1/auth/saml/kaveri-foods/metadata';

function setup(overrides: Partial<IdentityProvidersScreenProps> = {}) {
  const props: IdentityProvidersScreenProps = {
    state: 'ready',
    providers: [GOOGLE, SAML],
    samlMetadataUrl: METADATA,
    oidcRedirectUri: 'https://api.yukthix.in/api/v1/auth/oidc/callback',
    onSave: vi.fn(async () => undefined),
    onSetStatus: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<IdentityProvidersScreen {...props} />);
  return props;
}

describe('IdentityProvidersScreen', () => {
  it('lists each provider with its type, domains and On/Off', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Identity providers' });
    const [google, okta] = within(list).getAllByRole('listitem');
    expect(google).toHaveTextContent('Kaveri Google');
    expect(google).toHaveTextContent('Google · kaverifoods.in');
    expect(within(google).getByText('On')).toBeInTheDocument();
    expect(okta).toHaveTextContent('SAML · existing accounts only');
    expect(within(okta).getByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Single sign-on providers' })).toBeInTheDocument();
  });

  it('copies the SAML metadata URL with the company web address', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    setup();
    expect(screen.getByText(METADATA)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy SAML metadata URL' }));
    expect(writeText).toHaveBeenCalledWith(METADATA);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('turns a provider on and off', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off Kaveri Google' }));
    expect(props.onSetStatus).toHaveBeenCalledWith('p-1', 'disabled');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on Okta' }));
    expect(props.onSetStatus).toHaveBeenCalledWith('p-2', 'active');
  });

  it('says why a provider could not be turned on', async () => {
    setup({ onSetStatus: vi.fn(async () => { throw new Error('Set the entity ID, SSO URL and certificate before turning this provider on'); }) });
    await userEvent.click(screen.getByRole('button', { name: 'Turn on Okta' }));
    expect(await screen.findByText(/before turning this provider on/)).toBeInTheDocument();
  });

  it('removes only after the confirm dialog', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Okta' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remove Okta?');
    expect(props.onRemove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove provider' }));
    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith('p-2'));
  });

  it('adds a Microsoft Entra ID provider; errors show only after Save', async () => {
    const props = setup({ providers: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Add identity provider' }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('radio', { name: 'Microsoft Entra ID' }));
    await userEvent.type(within(drawer).getByLabelText(/Name on the sign-in page/), 'Kaveri staff');
    expect(within(drawer).queryByText('Enter the client ID')).toBeNull();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add provider' }));
    expect((await within(drawer).findAllByText('Enter the client ID')).length).toBeGreaterThan(0);
    expect(props.onSave).not.toHaveBeenCalled();

    await userEvent.type(within(drawer).getByLabelText(/Email domains/), 'KaveriFoods.in');
    await userEvent.type(within(drawer).getByLabelText(/Directory \(tenant\) ID/), '11111111-2222-3333-4444-555555555555');
    await userEvent.type(within(drawer).getByLabelText(/Client ID/), 'app-1');
    await userEvent.type(within(drawer).getByLabelText(/Client secret/), 's3cret');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add provider' }));
    await waitFor(() =>
      expect(props.onSave).toHaveBeenCalledWith(null, {
        type: 'oidc_entra', name: 'Kaveri staff', domains: ['kaverifoods.in'], jitEnabled: false, mfaTrusted: false,
        entraTenantId: '11111111-2222-3333-4444-555555555555', oidcClientId: 'app-1', oidcClientSecret: 's3cret',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('editing never shows the saved secret and keeps it when left blank', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Kaveri Google' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).queryByRole('radiogroup', { name: 'Type' })).toBeNull();
    expect(within(drawer).getByLabelText(/Client secret/)).toHaveValue('');
    expect(within(drawer).getByText(/never shown again; type a new one/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('p-1', { name: 'Kaveri Google', domains: ['kaverifoods.in'], jitEnabled: false, mfaTrusted: false, oidcClientId: 'client-1' }));
  });

  it('shows the no-access state on a 403', () => {
    setup({ state: 'no-access' });
    expect(screen.getByText(/a System Admin/)).toBeInTheDocument();
  });
});

describe('idpInput', () => {
  it('SAML needs an https sign-in URL and a PEM certificate; JIT needs a domain', () => {
    const d = { ...idpDraftOf(null), type: 'saml' as const, name: 'Okta', samlEntityId: 'x', samlSsoUrl: 'http://okta', samlCertificate: 'abc', jitEnabled: true };
    expect(idpInput(d, null).errors.map((e) => e.fieldId)).toEqual(['idp-domains', 'idp-saml-url', 'idp-saml-cert']);
  });

  it('refuses a domain that is not one', () => {
    expect(idpInput({ ...idpDraftOf(GOOGLE), domains: 'acme' }, GOOGLE).errors).toEqual([{ fieldId: 'idp-domains', message: 'acme is not an email domain, like acme.com' }]);
  });
});
