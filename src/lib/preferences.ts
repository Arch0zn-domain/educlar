export type Theme = 'light' | 'dark' | 'system';
export const THEME_KEY = 'educlar-theme';
export const COOKIE_KEY = 'educlar-cookies';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
export type CookieConsent = { version: number; preferences: boolean; savedAt: number };
export function readConsent(raw: string | null): CookieConsent | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== CONSENT_VERSION || typeof value.preferences !== 'boolean' ||
      !Number.isFinite(value.savedAt) || value.savedAt > Date.now() || Date.now() - value.savedAt >= CONSENT_MAX_AGE) return null;
    return value;
  } catch { return null; }
}
export function isTheme(value: unknown): value is Theme { return value === 'light' || value === 'dark' || value === 'system'; }
export const themeBootstrap = `try{var c=JSON.parse(localStorage.getItem('${COOKIE_KEY}')||'null');var t=c&&c.version===${CONSENT_VERSION}&&c.preferences===true&&Number.isFinite(c.savedAt)&&c.savedAt<=Date.now()&&Date.now()-c.savedAt<${CONSENT_MAX_AGE}?localStorage.getItem('${THEME_KEY}'):'system';if(!['light','dark','system'].includes(t))t='system';document.documentElement.dataset.themePreference=t;document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){document.documentElement.dataset.themePreference='system';document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`;
