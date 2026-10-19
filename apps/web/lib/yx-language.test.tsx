import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from './api-client';
import { savePickedLanguage, YxLanguageProvider } from './yx-language';
import { LegalNotice } from '../app/yx/legal/[doc]/legal-notice';

jest.mock('./api-client', () => ({ apiFetch: jest.fn() }));
const api = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  window.localStorage.clear();
  api.mockReset().mockResolvedValue(null);
});

describe('SEC-01 language picker', () => {
  it('keeps the pick, and saves it as the person’s language once after sign-in', async () => {
    render(
      <YxLanguageProvider>
        <LegalNotice doc="terms" />
      </YxLanguageProvider>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await userEvent.click(await screen.findByRole('option', { name: /Tamil/ }));
    expect(window.localStorage.getItem('yx-language')).toBe('ta');
    await savePickedLanguage('tok');
    expect(api).toHaveBeenCalledWith('/global/me/language', { method: 'PUT', body: JSON.stringify({ language: 'ta' }) }, 'tok');
    await savePickedLanguage('tok');
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('saves nothing when nobody picked a language', async () => {
    await savePickedLanguage('tok');
    expect(api).not.toHaveBeenCalled();
  });
});

describe('SEC-02 legal notices', () => {
  it('links every notice from every notice page, and lists the open-source components', () => {
    render(<LegalNotice doc="openSource" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Open-source notices' })).toBeInTheDocument();
    const notices = screen.getByRole('navigation', { name: 'Legal notices' }); // the footer; the band's menu is "Legal and privacy"
    expect([...notices.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/yx/legal/privacy', '/yx/legal/terms', '/yx/legal/accessibility', '/yx/legal/grievance', '/yx/legal/open-source']);
    expect(screen.getByRole('table', { name: 'Open-source components' })).toBeInTheDocument();
  });

  it('says the contact is not published yet instead of inventing one', () => {
    render(<LegalNotice doc="grievance" />);
    expect(screen.getByText(/the address YukthiX publishes here before go-live/)).toBeInTheDocument();
  });
});
