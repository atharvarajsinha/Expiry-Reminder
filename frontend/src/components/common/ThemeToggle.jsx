import { Monitor, Moon, Sun } from 'lucide-react';

import { THEME } from '../../context/ThemeContext.jsx';
import { useTheme } from '../../hooks/useTheme.js';
import { Button } from './Button.jsx';

const NEXT_LABEL = {
  [THEME.LIGHT]: 'Switch to dark theme',
  [THEME.DARK]: 'Use system theme',
  [THEME.SYSTEM]: 'Switch to light theme',
};

const ICONS = {
  [THEME.LIGHT]: Sun,
  [THEME.DARK]: Moon,
  [THEME.SYSTEM]: Monitor,
};

/**
 * Cycles light -> dark -> system.
 *
 * The icon shows the *current* setting and the accessible label announces what
 * pressing it will do, which is the part a screen-reader user needs.
 */
export function ThemeToggle({ size = 'sm', className }) {
  const { theme, cycleTheme } = useTheme();
  const Icon = ICONS[theme] || Monitor;

  return (
    <Button
      variant="ghost"
      size={size}
      iconOnly
      icon={Icon}
      onClick={cycleTheme}
      aria-label={NEXT_LABEL[theme] || 'Change theme'}
      title={NEXT_LABEL[theme]}
      className={className}
    />
  );
}
