'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { Button, Input, Card } from '../../../../components/ui';
import { useToast } from '../../../../components/ui';
import { BrandingResponse } from '../../../../lib/types';

export default function BrandingSettingsPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [branding, setBranding] = useState<BrandingResponse | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#1a73e8');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch('/organizations/branding', {}, accessToken)
      .then((data: BrandingResponse) => {
        setBranding(data);
        if (data.primaryColor) setPrimaryColor(data.primaryColor);
        if (data.accentColor) setAccentColor(data.accentColor);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load branding'));
  }, [accessToken]);

  async function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await apiFetch(
        '/organizations/branding',
        { method: 'PATCH', body: JSON.stringify({ primaryColor, accentColor }) },
        accessToken ?? undefined,
      );
      setBranding(updated);
      toast('Colors updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update colors');
    }
  }

  async function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!logoFile) return;
    try {
      const formData = new FormData();
      formData.append('file', logoFile);
      const updated = await apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
      setBranding(updated);
      toast('Logo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    }
  }

  return (
    <Card className="max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Branding Settings</h1>
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
      <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
        <Input label="Primary color" type="color" value={primaryColor} onChange={setPrimaryColor} />
        <Input label="Accent color" type="color" value={accentColor} onChange={setAccentColor} />
        <Button type="submit">Save colors</Button>
      </form>
      <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700">
          Logo (PNG, JPEG, or SVG, max 2MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </label>
        <Button type="submit" variant="secondary">
          Upload logo
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </Card>
  );
}
