import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CHECKOUT_THEME, resolveCheckoutTheme } from '../src/checkoutTheme.js';

test('uses Orbit defaults and respects legacy widget theming', () => {
  const defaults = resolveCheckoutTheme();
  assert.equal(defaults.style['--orbit-accent'], DEFAULT_CHECKOUT_THEME.primaryColor);
  assert.equal(defaults.style['--orbit-surface'], '#ffffff');
  assert.equal(defaults.style['--orbit-radius'], '10px');
  assert.equal(resolveCheckoutTheme({}, { theme: 'dark', accentColor: '#123abc', borderRadius: 'full' }).style['--orbit-radius'], '999px');
});

test('merchant theme overrides are root scoped and safe', () => {
  const theme = resolveCheckoutTheme({
    mode: 'dark', primaryColor: '#09f', backgroundColor: '#101010',
    borderRadius: 'sm', logoUrl: 'https://merchant.example/logo.svg',
    fontFamily: 'Inter, sans-serif',
  });
  assert.equal(theme.style['--orbit-accent'], '#09f');
  assert.equal(theme.style['--orbit-surface'], '#101010');
  assert.equal(theme.style['--orbit-radius'], '4px');
  assert.equal(theme.logoUrl, 'https://merchant.example/logo.svg');
  assert.equal(theme.style['--orbit-font'], 'Inter, sans-serif');
  const invalid = resolveCheckoutTheme({ primaryColor: 'red; background: blue', logoUrl: 'javascript:alert(1)' });
  assert.equal(invalid.style['--orbit-accent'], DEFAULT_CHECKOUT_THEME.primaryColor);
  assert.equal(invalid.logoUrl, '');
});
