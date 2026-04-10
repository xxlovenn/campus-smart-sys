'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/navigation';
import { clearToken, getToken } from '@/lib/auth-storage';

type NavItem = {
  href: string;
  label: string;
};

export function TopNav() {
  const t = useTranslations('nav');
  const ta = useTranslations('auth');
  const tapp = useTranslations('app');
  const tc = useTranslations('common');

  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [token, setTok] = useState<string | null>(null);

  useEffect(() => {
    setTok(getToken());
  }, [pathname]);

  const locales = ['zh', 'en', 'ru'] as const;

  const navItems: NavItem[] = [
    { href: '/dashboard', label: t('dashboard') },
    { href: '/timeline', label: t('timeline') },
    { href: '/tasks', label: t('tasks') },
    { href: '/organizations', label: t('orgs') },
    { href: '/profile', label: t('profile') },
    { href: '/admin', label: t('admin') },
    { href: '/notifications', label: t('notifications') },
  ];

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  function logout() {
    clearToken();
    setTok(null);
    router.replace('/', { locale });
  }

  function isActive(href: string) {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  }

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">{tapp('title')}</div>
        <div className="sidebar-subtitle">{tapp('subtitle')}</div>
      </div>

      {token ? (
        <>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div style={{ marginBottom: 12 }}>
              {tc('language')}: {locale.toUpperCase()}
            </div>

            <div className="locale-group" style={{ marginBottom: 16 }}>
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLocale(l)}
                  className={`locale-btn ${locale === l ? 'active' : ''}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            <button type="button" onClick={logout} className="logout-btn">
              {ta('logout')}
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="sidebar-nav">
            <Link href="/" className="sidebar-link active">
              {t('login')}
            </Link>
          </nav>

          <div className="sidebar-footer">
            <div style={{ marginBottom: 12 }}>
              {tc('language')}: {locale.toUpperCase()}
            </div>

            <div className="locale-group">
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLocale(l)}
                  className={`locale-btn ${locale === l ? 'active' : ''}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}