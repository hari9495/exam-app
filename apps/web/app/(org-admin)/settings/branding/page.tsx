'use client';

import { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import { useOrgBranding, useUpdateBranding, useUpdateBrandingLogo } from '../../../../lib/hooks/useBranding';
import { Button, Input, CollapsibleSection, useToast } from '../../../../components/ui';
import { motion } from 'framer-motion';

// Prudent's own brand colors (Science Blue / Lightning Yellow) -- what an org gets by
// default when it hasn't picked its own, and what "Use Prudent defaults" resets to.
const PRUDENT_PRIMARY_COLOR = '#0053e2';
const PRUDENT_ACCENT_COLOR = '#ffc220';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  // Typed hex tracks independently of `value` so a mid-edit string like "#12" (not yet a
  // valid 6-digit hex) doesn't get clobbered by the picker's own onChange -- only a valid
  // hex is ever forwarded to the parent.
  const [typedHex, setTypedHex] = useState(value);
  useEffect(() => setTypedHex(value), [value]);

  const isValid = HEX_COLOR_PATTERN.test(typedHex);

  function handleHexChange(next: string) {
    const withHash = next.startsWith('#') ? next : `#${next}`;
    setTypedHex(withHash);
    if (HEX_COLOR_PATTERN.test(withHash)) onChange(withHash);
  }

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
        <input
          type="text"
          value={typedHex}
          onChange={(e) => handleHexChange(e.target.value)}
          aria-label={`${label} hex code`}
          spellCheck={false}
          maxLength={7}
          className={clsx(
            'w-28 rounded border bg-gray-50 px-2 py-1.5 font-mono text-sm uppercase text-recruiter-text-secondary focus:outline-none focus:ring-1',
            isValid ? 'border-recruiter-border focus:ring-primary' : 'border-status-danger focus:ring-status-danger',
          )}
        />
      </div>
      {!isValid && <span className="text-xs text-status-danger">Enter a 6-digit hex code, e.g. #0053E2.</span>}
    </div>
  );
}

export default function BrandingSettingsPage() {
  const { data: branding, isLoading, isError, error: loadError } = useOrgBranding();
  const updateBranding = useUpdateBranding();
  const updateLogo = useUpdateBrandingLogo();
  const { toast } = useToast();
  const [primaryColor, setPrimaryColor] = useState(PRUDENT_PRIMARY_COLOR);
  const [accentColor, setAccentColor] = useState(PRUDENT_ACCENT_COLOR);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [colorsError, setColorsError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  // An org that has never picked its own colors comes back with primaryColor/accentColor
  // both null -- the state above already defaults to Prudent's colors, so there's nothing
  // to overwrite here for that case, and this effect only fires once real values exist.
  useEffect(() => {
    if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
    if (branding?.accentColor) setAccentColor(branding.accentColor);
  }, [branding]);

  function handleUsePrudentDefaults() {
    setPrimaryColor(PRUDENT_PRIMARY_COLOR);
    setAccentColor(PRUDENT_ACCENT_COLOR);
  }

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold text-recruiter-text">Branding Settings</h1>

      {isError && (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          Couldn&apos;t load your current branding: {loadError instanceof Error ? loadError.message : 'unknown error'}.
          You can still upload a logo.
        </p>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <CollapsibleSection title="Colors">
          <p className="text-sm text-recruiter-text-secondary sm:col-span-2">
            Used to theme the candidate exam experience and staff console for your organization.
          </p>
          <form onSubmit={handleColorsSubmit} className="contents">
            <ColorSwatch label="Primary Color" value={primaryColor} onChange={setPrimaryColor} />
            <ColorSwatch label="Accent Color" value={accentColor} onChange={setAccentColor} />
            {/* Colours stay gated until the current values load, so a save can't overwrite
                the org's real colours with this component's Prudent-default state. */}
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={!branding} loading={updateBranding.isPending} className="self-start">
                Save colors
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!branding}
                onClick={handleUsePrudentDefaults}
                className="self-start"
              >
                Use Prudent defaults
              </Button>
            </div>
          </form>
          {colorsError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {colorsError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}>
        <CollapsibleSection title="Logo">
          <p className="text-sm text-recruiter-text-secondary sm:col-span-2">
            Shown on the login page, invitation emails, and the candidate exam header.
          </p>
          <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-recruiter-border bg-gray-50 sm:col-span-2">
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
          <form onSubmit={handleLogoSubmit} className="contents">
            <label className="text-sm font-medium text-recruiter-text-secondary sm:col-span-2">
              Upload new logo (PNG, JPEG, or SVG, max 2MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-md border border-recruiter-border p-1.5 text-sm text-recruiter-text-secondary file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
              />
            </label>
            {/* Gated on the FILE, not on the branding fetch: uploading a logo does not
                need the current branding, and coupling them meant one failed GET
                disabled the upload button entirely. */}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!logoFile} loading={updateLogo.isPending} className="self-start">
                Upload logo
              </Button>
            </div>
          </form>
          {logoError && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {logoError}
            </p>
          )}
        </CollapsibleSection>
      </motion.div>
    </div>
  );
}
