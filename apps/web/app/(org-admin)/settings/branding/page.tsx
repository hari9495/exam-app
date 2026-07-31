'use client';

import { useState, useEffect } from 'react';
import { useOrgBranding, useUpdateBranding, useUpdateBrandingLogo } from '../../../../lib/hooks/useBranding';
import { Button, Input, Card, useToast } from '../../../../components/ui';
import { motion } from 'framer-motion';

export default function BrandingSettingsPage() {
  const { data: branding, isLoading, isError, error: loadError } = useOrgBranding();
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
        {isLoading && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading current branding…</p>}
        {isError && (
          <p role="alert" className="mb-4 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
            Couldn&apos;t load your current branding:{' '}
            {loadError instanceof Error ? loadError.message : 'unknown error'}. You can still upload a logo.
          </p>
        )}
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
        <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
          {/* h-11: a bare type=color collapses to a sliver under the shared input padding. */}
          <Input label="Primary Color" type="color" value={primaryColor} onChange={setPrimaryColor} className="h-11" />
          <Input label="Accent Color" type="color" value={accentColor} onChange={setAccentColor} className="h-11" />
          {/* Colours stay gated until the current values load, so a save can't overwrite
              the org's real colours with this component's #0057f0/#fbbc04 defaults. */}
          <Button type="submit" disabled={!branding} loading={updateBranding.isPending}>
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
          {/* Gated on the FILE, not on the branding fetch: uploading a logo does not
              need the current branding, and coupling them meant one failed GET
              disabled the upload button entirely. */}
          <Button type="submit" variant="secondary" disabled={!logoFile} loading={updateLogo.isPending}>
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
