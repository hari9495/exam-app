import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, press, pressFirst, type } from '../_kit/story-play';
import { IdentityProvidersScreen, type IdentityProvidersScreenProps } from './identity-providers';
import type { IdentityProviderDetail } from './types';

// Settings › Security › Single sign-on providers, as the live page renders it (Kaveri Foods data).
const meta: Meta = { title: 'Screens/Security/Single sign-on providers', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const GOOGLE: IdentityProviderDetail = {
  id: 'p-1', name: 'Kaveri Workspace', type: 'oidc_google', status: 'active', domains: ['kaverifoods.in'], jitEnabled: true, jitRole: 'panel',
  samlEntityId: null, samlSsoUrl: null, samlCertificate: null, oidcIssuer: 'https://accounts.google.com', oidcClientId: '418230557219-kaveri.apps.googleusercontent.com', entraTenantId: null, mfaTrusted: false, clientSecretSet: true,
};
const SAML: IdentityProviderDetail = {
  ...GOOGLE, id: 'p-2', name: 'Kaveri staff directory', type: 'saml', status: 'disabled', domains: ['kaveri-plant.in'], jitEnabled: false, oidcIssuer: null, oidcClientId: null, clientSecretSet: false,
  samlEntityId: 'http://www.okta.com/exk9kaveri', samlSsoUrl: 'https://kaveri.okta.com/app/yukthix/sso/saml', samlCertificate: '-----BEGIN CERTIFICATE-----\nMIIDpDCCAoygAwIBAgIGAY\n-----END CERTIFICATE-----',
};
const idps = (over: Partial<IdentityProvidersScreenProps> = {}) => (
  <IdentityProvidersScreen
    state="ready"
    providers={[GOOGLE, SAML]}
    samlMetadataUrl="https://api.yukthix.in/api/v1/auth/saml/kaveri-foods/metadata"
    oidcRedirectUri="https://api.yukthix.in/api/v1/auth/oidc/callback"
    onSave={ok}
    onSetStatus={ok}
    onRemove={ok}
    {...over}
  />
);
export const Providers: S = { name: 'Providers · one on, one off', render: () => idps() };
export const ProvidersEmpty: S = { name: 'Providers · none yet', render: () => idps({ providers: [] }) };
export const ProvidersLoading: S = { name: 'Providers · loading', render: () => idps({ state: 'loading', providers: [] }) };
export const ProvidersError: S = { name: 'Providers · could not load', render: () => idps({ state: 'error', providers: [], onRetry: () => undefined }) };
export const ProvidersNoAccess: S = { name: 'Providers · no access', render: () => idps({ state: 'no-access', providers: [] }) };
export const TurnOnFailed: S = { name: 'Turn on · refused', render: () => idps({ onSetStatus: fails('Confirm it’s you first: the second sign-in step timed out.') }), play: play(press(/^Turn on Kaveri staff directory/)) };
export const Remove: S = { name: 'Remove · confirm', render: () => idps(), play: play(press(/^Remove Kaveri staff directory/)) };
export const Add: S = { name: 'Add a provider · open', render: () => idps(), play: play(press('Add identity provider')) };
export const AddMissing: S = { name: 'Add a provider · Add pressed with nothing filled', render: () => idps(), play: play(press('Add identity provider'), press('Add provider')) };
export const Edit: S = { name: 'Edit a provider · Google, secret saved', render: () => idps(), play: play(pressFirst(/^Edit Kaveri Workspace/)) };
export const EditFailed: S = {
  name: 'Edit a provider · the server refuses',
  render: () => idps({ onSave: fails('Google did not accept the client ID. Check it in the Google Cloud console.') }),
  play: play(pressFirst(/^Edit Kaveri Workspace/), type(/^Name on the sign-in page/, ' (Google)'), press('Save changes')),
};
