'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/navigation';
import { clearToken, getToken } from '@/lib/auth-storage';

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

  const otherLocales = (['zh', 'en', 'ru'] as const).filter((l) => l !== locale);

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  function logout() {
    clearToken();
    setTok(null);
    router.replace('/', { locale });
  }

  return (
    <header
      style={{
        borderBottom: '1px solid #e5e7eb',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        background: '#fafafa',
      }}
    >
      <Link href="/" style={{ fontWeight: 700 }}>
        {tapp('title')}
      </Link>
      <span style={{ color: '#666' }}>
        {tc('language')}: {locale.toUpperCase()}
      </span>
      {otherLocales.map((l) => (
        <button key={l} type="button" onClick={() => switchLocale(l)} style={{ cursor: 'pointer' }}>
          {l.toUpperCase()}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      {token ? (
        <>
          <Link href="/dashboard">{t('dashboard')}</Link>
          <Link href="/timeline">{t('timeline')}</Link>
          <Link href="/tasks">{t('tasks')}</Link>
          <Link href="/organizations">{t('orgs')}</Link>
          <Link href="/profile">{t('profile')}</Link>
          <Link href="/admin">{t('admin')}</Link>
          <Link href="/notifications">{t('notifications')}</Link>
          <button type="button" onClick={logout}>
            {ta('logout')}
          </button>
        </>
      ) : (
        <Link href="/">{t('login')}</Link>
      )}
    </header>
  );
}
