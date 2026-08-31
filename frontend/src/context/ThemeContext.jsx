/**
 * Light / dark / system theme.
 *
 * The chosen preference is the *only* thing this app puts in localStorage. It
 * is a UI preference, not a credential - no token, session or vehicle data is
 * ever stored there.
 */
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

export const THEME = { LIGHT: 'light', DARK: 'dark', SYSTEM: 'system' };

const STORAGE_KEY = 'vr:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === THEME.LIGHT || stored === THEME.DARK || stored === THEME.SYSTEM) {
      return stored;
    }
  } catch {
    // Private browsing or blocked storage: fall back to the system setting.
  }
  return THEME.SYSTEM;
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;
}

function applyTheme(theme) {
  const dark = theme === THEME.DARK || (theme === THEME.SYSTEM && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);

  // Keep the browser/PWA chrome in step with the rendered theme.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', dark ? '#171346' : '#3b2ed4');
  return dark;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [isDark, setIsDark] = useState(() => {
    const initial = readStoredTheme();
    return initial === THEME.DARK || (initial === THEME.SYSTEM && systemPrefersDark());
  });

  useEffect(() => {
    setIsDark(applyTheme(theme));
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to persist the preference is not worth an error.
    }
  }, [theme]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (theme !== THEME.SYSTEM) return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setIsDark(applyTheme(THEME.SYSTEM));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(
      next === THEME.LIGHT || next === THEME.DARK || next === THEME.SYSTEM
        ? next
        : THEME.SYSTEM,
    );
  }, []);

  /** Cycles light -> dark -> system, for the single-button toggle. */
  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      if (current === THEME.LIGHT) return THEME.DARK;
      if (current === THEME.DARK) return THEME.SYSTEM;
      return THEME.LIGHT;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, isDark, setTheme, cycleTheme }),
    [theme, isDark, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
