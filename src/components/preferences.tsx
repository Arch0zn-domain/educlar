'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { Moon, Sun, Monitor, Cookie } from 'lucide-react';
import { COOKIE_KEY, THEME_KEY, CONSENT_VERSION, readConsent, isTheme, type CookieConsent, type Theme } from '@/lib/preferences';

const Context = createContext({ openCookies: () => {} });
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    try { const saved = readConsent(localStorage.getItem(COOKIE_KEY)); setConsent(saved); setPreferences(saved?.preferences || false); } catch {}
    setReady(true);
  }, []);
  function save(allowed: boolean) {
    const value = { version: CONSENT_VERSION, preferences: allowed, savedAt: Date.now() };
    setStorageError('');
    try {
      localStorage.setItem(COOKIE_KEY, JSON.stringify(value));
      if (!allowed) localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, document.documentElement.dataset.themePreference || 'system');
    } catch { setStorageError('Browserul nu permite salvarea alegerii. Aceasta rămâne valabilă în pagina curentă.'); }
    setConsent(value); setPreferences(allowed); setOpen(false);
    window.dispatchEvent(new CustomEvent('educlar-consent', { detail: value }));
  }
  return <Context.Provider value={{ openCookies: () => { setPreferences(consent?.preferences || false); setOpen(true); } }}>
    {children}
    {storageError && <div className="notice preference-status" role="status">{storageError}</div>}
    {ready && (!consent || open) && <aside className="cookie-banner" aria-labelledby="cookie-title">
      <div><h2 id="cookie-title"><Cookie size={20}/> Datele tale, alegerea ta</h2>
        <p>Folosim stocare necesară pentru autentificare, comparație și alegerea privind cookies. Cu acordul tău, reținem și tema pe acest dispozitiv. Nu folosim analytics sau publicitate.</p>
        <Link className="text-link" href="/cookies">Politica de cookies</Link>
        {open && <label className="check-field"><input type="checkbox" checked={preferences} onChange={e => setPreferences(e.target.checked)}/>Reține preferința light/dark (opțional)</label>}
      </div>
      <div className="cookie-actions">
        <button className="button secondary" onClick={() => save(false)}>Doar necesare</button>
        <button className="button secondary" onClick={() => save(true)}>Acceptă preferințele</button>
        {open ? <button className="button" onClick={() => save(preferences)}>Salvează alegerea</button> : <button className="text-button" onClick={() => setOpen(true)}>Personalizează</button>}
      </div>
    </aside>}
  </Context.Provider>;
}
export function CookieSettingsButton() {
  const { openCookies } = useContext(Context);
  return <button type="button" className="text-button" onClick={openCookies}>Setări cookies</button>;
}
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const stored = document.documentElement.dataset.themePreference;
    if (isTheme(stored)) setTheme(stored);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const choice = document.documentElement.dataset.themePreference || 'system';
      document.documentElement.dataset.theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    };
    const synchronize = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== COOKIE_KEY && event.key !== null) return;
      let next: Theme = 'system';
      try { const saved = localStorage.getItem(THEME_KEY); if (readConsent(localStorage.getItem(COOKIE_KEY))?.preferences && isTheme(saved)) next = saved; } catch {}
      document.documentElement.dataset.themePreference = next; setTheme(next); apply();
    };
    media.addEventListener('change', apply); window.addEventListener('storage', synchronize);
    return () => { media.removeEventListener('change', apply); window.removeEventListener('storage', synchronize); };
  }, []);
  function change(next: Theme) {
    setTheme(next); document.documentElement.dataset.themePreference = next;
    document.documentElement.dataset.theme = next === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : next;
    try { if (readConsent(localStorage.getItem(COOKIE_KEY))?.preferences) localStorage.setItem(THEME_KEY, next); } catch {}
  }
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return <label className="theme-switch"><Icon size={17}/><span className="sr-only">Tema interfeței</span><select aria-label="Tema interfeței" value={theme} onChange={e => change(e.target.value as Theme)}><option value="system">Sistem</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
