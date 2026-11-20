/**
 * Checkout-only brand configuration. Values are applied to the widget root,
 * never to document.documentElement or the embedding merchant page.
 */
export const DEFAULT_CHECKOUT_THEME = Object.freeze({
  mode: 'light',
  primaryColor: '#6366f1',
  backgroundColor: '#ffffff',
  borderRadius: 'md',
  logoUrl: '',
  fontFamily: 'inherit',
});

const RADII = Object.freeze({ none: '0', sm: '4px', md: '10px', lg: '18px', full: '999px' });
const COLORS = /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i;
const safeColor = (candidate, fallback) => typeof candidate === 'string' && COLORS.test(candidate.trim()) ? candidate.trim() : fallback;
const safeLogo = (candidate) => {
  if (typeof candidate !== 'string' || !candidate.trim()) return '';
  try {
    const url = new URL(candidate, 'https://orbit.invalid');
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return candidate.trim();
  } catch { return ''; }
};

export function resolveCheckoutTheme(config = {}, legacy = {}) {
  const theme = config && typeof config === 'object' ? config : {};
  const mode = ['dark', 'light'].includes(theme.mode) ? theme.mode
    : ['dark', 'light'].includes(legacy.theme) ? legacy.theme
      : legacy.theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const dark = mode === 'dark';
  const defaultBackground = dark ? '#171923' : DEFAULT_CHECKOUT_THEME.backgroundColor;
  const primaryColor = safeColor(theme.primaryColor ?? legacy.accentColor, DEFAULT_CHECKOUT_THEME.primaryColor);
  const backgroundColor = safeColor(theme.backgroundColor, defaultBackground);
  const borderRadius = Object.hasOwn(RADII, theme.borderRadius) ? theme.borderRadius
    : Object.hasOwn(RADII, legacy.borderRadius) ? legacy.borderRadius : DEFAULT_CHECKOUT_THEME.borderRadius;
  const fontFamily = typeof theme.fontFamily === 'string' && theme.fontFamily.trim() ? theme.fontFamily
    : typeof legacy.fontFamily === 'string' && legacy.fontFamily.trim() ? legacy.fontFamily : 'inherit';
  const logoUrl = safeLogo(theme.logoUrl);
  return {
    mode,
    logoUrl,
    style: {
      '--orbit-accent': primaryColor,
      '--orbit-radius': RADII[borderRadius],
      '--orbit-font': fontFamily,
      '--orbit-surface': backgroundColor,
      '--orbit-text': dark ? '#f8fafc' : '#101828',
      '--orbit-muted': dark ? '#cbd5e1' : '#475467',
      '--orbit-border': dark ? '#64748b' : '#98a2b3',
      '--orbit-error': dark ? '#ffb4ab' : '#b42318',
    },
  };
}
