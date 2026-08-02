'use client';

import { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';
import { useOrgBranding, useUpdateBranding, useUpdateBrandingLogo } from '../../../../lib/hooks/useBranding';
import { Button, Input, Card, useToast } from '../../../../components/ui';
import { motion } from 'framer-motion';

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-3">
        {/* h-10 w-10: a bare type=color input collapses to a thin sliver under the
            shared border/padding, so it's styled directly here rather than through
            the shared Input component. */}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-recruiter-border p-0.5"
        />
        <span className="rounded border border-recruiter-border bg-gray-50 px-2 py-1.5 font-mono text-sm uppercase text-recruiter-text-secondary">
          {value}
        </span>
      </div>
    </div>
  );
}

export default function BrandingSettingsPage() {
  const { data: branding, isLoading, isError, error: loadError } = useOrgBranding();
  const updateBranding = useUpdateBranding();
  const updateLogo = useUpdateBrandingLogo();
  const { toast } = useToast();
  const [primaryColor, setPrimaryColor] = useState('#0057f0');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [colorsError, setColorsError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
    if (branding?.accentColor) setAccentColor(branding.accentColor);
  }, [branding]);

  function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setColorsError(null);
    updateBranding.mutate(
      { primaryColor, accentColor },
      {
        onSuccess: () => toast('Colors updated.'),
        onError: (err) => setColorsError(err instanceof Error ? err.message : 'Failed to update colors'),
      },
    );
  }

  function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLogoError(null);
    if (!logoFile) return;
    updateLogo.mutate(logoFile, {
      onSuccess: () => {
        toast('Logo updated.');
        setLogoFile(null);
      },
      onError: (err) => setLogoError(err instanceof Error ? err.message : 'Failed to upload logo'),
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold text-recruiter-text">Branding Settings</h1>

      {isError && (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          Couldn&apos;t load your current branding: {loadError instanceof Error ? loadError.message : 'unknown error'}.
          You can still upload a logo.
        </p>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <Card className="w-full">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Colors</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            Used to theme the candidate exam experience and staff console for your organization.
          </p>
          <form onSubmit={handleColorsSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-6">
              <ColorSwatch label="Primary Color" value={primaryColor} onChange={setPrimaryColor} />
              <ColorSwatch label="Accent Color" value={accentColor} onChange={setAccentColor} />
            </div>
            {/* Colours stay gated until the current values load, so a save can't overwrite
                the org's real colours with this component's #0057f0/#fbbc04 defaults. */}
            <Button type="submit" disabled={!branding} loading={updateBranding.isPending} className="self-start">
              Save colors
            </Button>
          </form>
          {colorsError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {colorsError}
            </p>
          )}
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
        <Card className="w-full">
          <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Logo</h2>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            Shown on the login page, invitation emails, and the candidate exam header.
          </p>
          <div className="mb-4 flex h-24 w-full items-center justify-center rounded-md border border-dashed border-recruiter-border bg-gray-50">
            {isLoading ? (
              <span className="text-sm text-recruiter-text-tertiary">Loading…</span>
            ) : branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="Organization logo" className="max-h-20 max-w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-recruiter-text-tertiary">
                <ImageIcon size={22} />
                <span className="text-xs">No logo uploaded</span>
              </div>
            )}
          </div>
          <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-recruiter-text-secondary">
              Upload new logo (PNG, JPEG, or SVG, max 2MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-md border border-recruiter-border p-1.5 text-sm text-recruiter-text-secondary file:mr-3 file:rounded file:border-0 file:bg-recruiter-border file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-recruiter-text hover:file:bg-recruiter-border/80"
              />
            </label>
            {/* Gated on the FILE, not on the branding fetch: uploading a logo does not
                need the current branding, and coupling them meant one failed GET
                disabled the upload button entirely. */}
            <Button type="submit" variant="secondary" disabled={!logoFile} loading={updateLogo.isPending} className="self-start">
              Upload logo
            </Button>
          </form>
          {logoError && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {logoError}
            </p>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
