import { useEffect, useState } from 'react';
import type { DensityChoice, ThemeChoice } from '../../components/shell';

/** localStorage key of an explicit light / dark choice; absent = follow the OS. */
export const THEME_STORAGE_KEY = 'yx-theme';
export function readThemeChoice(): ThemeChoice {
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Theme and density for the account menu (<ProfileMenu theme density>): the OS setting unless the person chose light or
 * dark, kept per browser; the host's sign-in pages read the same key before they paint (apps/web lib/theme-script).
 */
export function useAppearance() {
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  const [density, setDensity] = useState<DensityChoice>('comfortable');
  useEffect(() => {
    setThemeState(readThemeChoice());
  }, []);
  const setTheme = (t: ThemeChoice) => {
    setThemeState(t);
    try {
      if (t === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* private mode: this visit only */
    }
  };
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.dataset.density = density;
  }, [theme, density]);
  return { theme, setTheme, density, setDensity };
}
