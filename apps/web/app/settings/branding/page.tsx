'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

interface Branding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export default function BrandingSettingsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#1a73e8');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    apiFetch('/organizations/branding', {}, accessToken)
      .then((data: Branding) => {
        setBranding(data);
        if (data.primaryColor) setPrimaryColor(data.primaryColor);
        if (data.accentColor) setAccentColor(data.accentColor);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load branding'));
  }, [accessToken, router]);

  async function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const updated = await apiFetch('/organizations/branding', { method: 'PATCH', body: JSON.stringify({ primaryColor, accentColor }) }, accessToken ?? undefined);
      setBranding(updated);
      setMessage('Colors updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update colors');
    }
  }

  async function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!logoFile) {
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', logoFile);
      const updated = await apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
      setBranding(updated);
      setMessage('Logo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    }
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>Branding Settings</h1>
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 80 }} />}
      <form onSubmit={handleColorsSubmit}>
        <label>
          Primary color
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        </label>
        <label>
          Accent color
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        </label>
        <button type="submit">Save colors</button>
      </form>
      <form onSubmit={handleLogoSubmit}>
        <label>
          Logo (PNG, JPEG, or SVG, max 2MB)
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="submit">Upload logo</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}
