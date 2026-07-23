'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { useBranding, useUpdateBranding, useUpdateBrandingLogo } from '../../../../lib/hooks/useBranding';
import { Button, Input, Card, useToast } from '../../../../components/ui';
import { motion } from 'framer-motion';

export default function BrandingSettingsPage() {
  const { organizationSlug } = useAuth();
  const { data: branding } = useBranding(organizationSlug);
  const updateBranding = useUpdateBranding();
  const updateLogo = useUpdateBrandingLogo();
  const { toast } = useToast();
  const [primaryColor, setPrimaryColor] = useState('#0057f0');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
    if (branding?.accentColor) setAccentColor(branding.accentColor);
  }, [branding]);

  function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateBranding.mutate(
      { primaryColor, accentColor },
      {
        onSuccess: () => toast('Colors updated.'),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update colors'),
      },
    );
  }

  function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!logoFile) return;
    updateLogo.mutate(logoFile, {
      onSuccess: () => toast('Logo updated.'),
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to upload logo'),
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <Card className="max-w-md">
        <h1 className="mb-4 text-xl font-semibold text-recruiter-text">Branding Settings</h1>
        {!branding && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading current branding…</p>}
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
        <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
          <Input label="Primary color" type="color" value={primaryColor} onChange={setPrimaryColor} />
          <Input label="Accent color" type="color" value={accentColor} onChange={setAccentColor} />
          <Button type="submit" disabled={!branding}>
            Save colors
          </Button>
        </form>
        <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-recruiter-text-secondary">
            Logo (PNG, JPEG, or SVG, max 2MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-md border border-recruiter-border p-1.5 text-sm text-recruiter-text-secondary"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!branding}>
            Upload logo
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
    </motion.div>
  );
}
