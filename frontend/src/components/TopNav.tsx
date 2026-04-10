'use client';

import { useLocale } from 'next-intl';
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

type NavItem = {
  href: string;
  label: string;
};

function roleText(role?: string) {
  switch (role) {
    case 'STUDENT':
      return '学生端';
    case 'ORG_ADMIN':
      return '社团端';
    case 'LEAGUE_ADMIN':
      return '团委端';
    default:
      return '未登录';
  }
}

export function TopNav() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [token, setTok] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

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

  const locales = ['zh', 'en', 'ru'] as const;

  const navItems = useMemo<NavItem[]>(() => {
    const role = me?.role;

    if (role === 'ORG_ADMIN') {
      return [
        { href: '/dashboard', label: '工作台' },
        { href: '/timeline', label: '日程表' },
        { href: '/tasks', label: '社团活动' },
        { href: '/organizations', label: '组织' },
        { href: '/profile', label: '成员信息' },
        { href: '/notifications', label: '通知' },
      ];
    }

    if (role === 'LEAGUE_ADMIN') {
      return [
        { href: '/dashboard', label: '工作台' },
        { href: '/timeline', label: '日程表' },
        { href: '/tasks', label: '团委任务' },
        { href: '/organizations', label: '组织管理' },
        { href: '/profile', label: '学生档案' },
        { href: '/notifications', label: '通知' },
        { href: '/admin', label: '团委后台' },
      ];
    }

    return [
      { href: '/dashboard', label: '工作台' },
      { href: '/timeline', label: '日程表' },
      { href: '/tasks', label: '任务' },
      { href: '/organizations', label: '组织' },
      { href: '/profile', label: '个人档案' },
      { href: '/notifications', label: '通知' },
    ];
  }, [me?.role]);

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
    ? `${me?.name || '未命名用户'} · ${me?.email || ''}`
    : '请先登录';

  const roleLine = token ? roleText(me?.role) : '未登录';

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">校园综合智慧管理系统</div>
        <div className="sidebar-subtitle" style={{ marginTop: 8 }}>
          {accountLine}
        </div>
        <div className="sidebar-subtitle">
          {roleLine}
        </div>
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
            <div style={{ marginBottom: 12 }}>语言: {locale.toUpperCase()}</div>

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
              退出登录
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="sidebar-nav">
            <Link href="/" className="sidebar-link active">
              登录
            </Link>
          </nav>

          <div className="sidebar-footer">
            <div style={{ marginBottom: 12 }}>语言: {locale.toUpperCase()}</div>

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