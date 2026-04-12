'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link, usePathname, useRouter } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken, getToken } from '@/lib/auth-storage';

type Me = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
};

type SidebarRole = 'student' | 'orgAdmin' | 'leagueAdmin';
type NavKey = 'dashboard' | 'timeline' | 'tasks' | 'orgs' | 'profile' | 'notifications' | 'admin';
type NavItem = {
  href: string;
  key: NavKey;
};
type ClockMode = 'compact' | 'full';
const CLOCK_MODE_KEY = 'sidebarClockModeV1';

const NAV_ITEMS: Record<SidebarRole, NavItem[]> = {
  student: [
    { href: '/dashboard', key: 'dashboard' },
    { href: '/timeline', key: 'timeline' },
    { href: '/tasks', key: 'tasks' },
    { href: '/organizations', key: 'orgs' },
    { href: '/profile', key: 'profile' },
    { href: '/notifications', key: 'notifications' },
  ],
  orgAdmin: [
    { href: '/dashboard', key: 'dashboard' },
    { href: '/tasks', key: 'tasks' },
    { href: '/organizations', key: 'orgs' },
    { href: '/notifications', key: 'notifications' },
  ],
  leagueAdmin: [
    { href: '/dashboard', key: 'dashboard' },
    { href: '/admin', key: 'admin' },
    { href: '/organizations', key: 'orgs' },
    { href: '/tasks', key: 'tasks' },
    { href: '/profile', key: 'profile' },
    { href: '/notifications', key: 'notifications' },
  ],
};

function sidebarRole(role?: string): SidebarRole {
  if (role === 'ORG_ADMIN') return 'orgAdmin';
  if (role === 'LEAGUE_ADMIN') return 'leagueAdmin';
  return 'student';
}

function roleLabelKey(role?: string): 'STUDENT' | 'ORG_ADMIN' | 'LEAGUE_ADMIN' | 'GUEST' {
  if (role === 'STUDENT') return 'STUDENT';
  if (role === 'ORG_ADMIN') return 'ORG_ADMIN';
  if (role === 'LEAGUE_ADMIN') return 'LEAGUE_ADMIN';
  return 'GUEST';
}

export function TopNav() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const tApp = useTranslations('app');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');

  const [token, setTok] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [clockMode, setClockMode] = useState<ClockMode>('full');

  useEffect(() => {
    const t = getToken();
    setTok(t);

    async function loadMe(currentToken: string) {
      try {
        const user = await apiFetch<Me>('/users/me', { token: currentToken });
        setMe(user);
      } catch {
        setMe(null);
      }
    }

    if (t) {
      loadMe(t);
    } else {
      setMe(null);
    }
  }, [pathname]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(CLOCK_MODE_KEY);
    if (savedMode === 'compact' || savedMode === 'full') {
      setClockMode(savedMode);
    }
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CLOCK_MODE_KEY, clockMode);
  }, [clockMode]);

  const locales = ['zh', 'en', 'ru'] as const;

  const role = sidebarRole(me?.role);
  const navItems = useMemo(() => NAV_ITEMS[role], [role]);

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  function logout() {
    clearToken();
    setTok(null);
    setMe(null);
    router.replace('/', { locale });
  }

  function isActive(href: string) {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  }

  const accountLine = token
    ? `${me?.name || tSidebar('accountFallback')} · ${me?.email || ''}`
    : tSidebar('pleaseLogin');

  const roleLine = token
    ? tSidebar(`role.${roleLabelKey(me?.role)}`)
    : tSidebar('role.GUEST');
  const nowText = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        ...(clockMode === 'full'
          ? {
              year: 'numeric' as const,
              month: '2-digit' as const,
              day: '2-digit' as const,
              second: '2-digit' as const,
            }
          : {}),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now),
    [clockMode, locale, now],
  );

  const renderClockCard = (
    <div className="sidebar-clock-box">
      <div className="sidebar-clock-label">{tCommon('currentDateTime')}</div>
      <div className="sidebar-clock-value">{nowText}</div>
      <div className="sidebar-clock-mode-row">
        <span className="sidebar-clock-mode-label">{tCommon('timeDisplay')}</span>
        <div className="sidebar-clock-mode-group">
          <button
            type="button"
            className={`sidebar-clock-mode-btn ${clockMode === 'compact' ? 'active' : ''}`}
            onClick={() => setClockMode('compact')}
          >
            {tCommon('timeModeCompact')}
          </button>
          <button
            type="button"
            className={`sidebar-clock-mode-btn ${clockMode === 'full' ? 'active' : ''}`}
            onClick={() => setClockMode('full')}
          >
            {tCommon('timeModeFull')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">{tApp('title')}</div>
        <div className="sidebar-subtitle" style={{ marginTop: 8 }}>
          {accountLine}
        </div>
        <div className="sidebar-subtitle">{roleLine}</div>
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
                {tSidebar(`${role}.${item.key}`)}
              </Link>
            ))}
          </nav>

          <div className="sidebar-footer">
            {renderClockCard}
            <div style={{ marginBottom: 12 }}>
              {tCommon('language')}: {locale.toUpperCase()}
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
              {tAuth('logout')}
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="sidebar-nav">
            <Link href="/" className="sidebar-link active">
              {tNav('login')}
            </Link>
          </nav>

          <div className="sidebar-footer">
            {renderClockCard}
            <div style={{ marginBottom: 12 }}>
              {tCommon('language')}: {locale.toUpperCase()}
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