export const COLOR_MODE_KEY = 'reliability.colorMode';

export type ColorMode = 'Light' | 'Dark';

export function applyColorMode(mode: ColorMode) {
  const dark = mode === 'Dark';
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}

export function getStoredColorMode(): ColorMode {
  try {
    return localStorage.getItem(COLOR_MODE_KEY) === 'Dark' ? 'Dark' : 'Light';
  } catch {
    return 'Light';
  }
}
