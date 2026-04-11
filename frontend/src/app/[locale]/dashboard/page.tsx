'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';

type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  studentId?: string | null;
};
type OverviewStatusRow = {
  status?: string;
  _count?: { _all?: number };
};
type TaskOverview = {
  grouped?: OverviewStatusRow[];
  tasks?: Array<{ approvalStatus?: string }>;
};

type QuickKey = 'timeline' | 'tasks' | 'organizations' | 'profile' | 'notifications' | 'admin';
type SidebarRole = 'student' | 'orgAdmin' | 'leagueAdmin';

const ROLE_ORDER: Record<string, QuickKey[]> = {
  STUDENT: ['timeline', 'tasks', 'organizations', 'profile', 'notifications'],
  ORG_ADMIN: ['tasks', 'organizations', 'notifications'],
  LEAGUE_ADMIN: ['admin', 'organizations', 'tasks', 'timeline', 'profile', 'notifications'],
};

const ROLE_THEME: Record<
  string,
  { bar: string; pillBg: string; pillFg: string; pillBorder: string }
> = {
  STUDENT: {
    bar: 'linear-gradient(90deg, #2563eb, #7c3aed)',
    pillBg: 'rgba(37, 99, 235, 0.12)',
    pillFg: '#1d4ed8',
    pillBorder: 'rgba(37, 99, 235, 0.25)',
  },
  ORG_ADMIN: {
    bar: 'linear-gradient(90deg, #059669, #0d9488)',
    pillBg: 'rgba(5, 150, 105, 0.12)',
    pillFg: '#047857',
    pillBorder: 'rgba(5, 150, 105, 0.28)',
  },
  LEAGUE_ADMIN: {
    bar: 'linear-gradient(90deg, #c2410c, #b45309)',
    pillBg: 'rgba(180, 83, 9, 0.14)',
    pillFg: '#9a3412',
    pillBorder: 'rgba(180, 83, 9, 0.3)',
  },
};

const DEFAULT_THEME = ROLE_THEME.STUDENT;

function navKeyForQuick(k: QuickKey): 'timeline' | 'tasks' | 'orgs' | 'profile' | 'notifications' | 'admin' {
  if (k === 'organizations') return 'orgs';
  return k;
}

function sidebarRole(role?: string): SidebarRole {
  if (role === 'ORG_ADMIN') return 'orgAdmin';
  if (role === 'LEAGUE_ADMIN') return 'leagueAdmin';
  return 'student';
}

const QUICK_HREF: Record<QuickKey, string> = {
  timeline: '/timeline',
  tasks: '/tasks',
  organizations: '/organizations',
  profile: '/profile',
  notifications: '/notifications',
  admin: '/admin',
};

const QUICK_DESC: Record<QuickKey, string> = {
  timeline: 'desc.timeline',
  tasks: 'desc.tasks',
  organizations: 'desc.organizations',
  profile: 'desc.profile',
  notifications: 'desc.notifications',
  admin: 'desc.admin',
};

function roleMessageKey(role: string): 'role.STUDENT' | 'role.ORG_ADMIN' | 'role.LEAGUE_ADMIN' {
  if (role === 'ORG_ADMIN') return 'role.ORG_ADMIN';
  if (role === 'LEAGUE_ADMIN') return 'role.LEAGUE_ADMIN';
  return 'role.STUDENT';
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tn = useTranslations('nav');
  const tSidebar = useTranslations('sidebar');
  const tc = useTranslations('common');
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<TaskOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setOverview(null);
      return;
    }
    setErr(null);
    apiFetch<Me>('/users/me', { token })
      .then(async (user) => {
        setMe(user);
        if (user.role !== 'LEAGUE_ADMIN') {
          setOverview(null);
          return;
        }
        try {
          const ov = await apiFetch<TaskOverview>('/tasks/admin/overview', { token });
          setOverview(ov);
        } catch {
          setOverview(null);
        }
      })
      .catch((e) => {
        setOverview(null);
        setErr(e instanceof Error ? e.message : tc('error'));
      });
  }, [token, tc]);

  const theme = useMemo(() => {
    const r = me?.role ?? 'STUDENT';
    return ROLE_THEME[r] ?? DEFAULT_THEME;
  }, [me?.role]);

  const subtitleKey = useMemo(() => {
    switch (me?.role) {
      case 'ORG_ADMIN':
        return 'subtitleOrgAdmin' as const;
      case 'LEAGUE_ADMIN':
        return 'subtitleLeagueAdmin' as const;
      default:
        return 'subtitleStudent' as const;
    }
  }, [me?.role]);

  const quickKeys = useMemo(() => {
    const r = me?.role ?? 'STUDENT';
    return ROLE_ORDER[r] ?? ROLE_ORDER.STUDENT;
  }, [me?.role]);

  const sidebarNs = useMemo(() => sidebarRole(me?.role), [me?.role]);

  if (token === null) {
    return (
      <div className="page-card page-section">
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          {tc('loading')}
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="page-card page-section">
        <h1 className="page-title">{t('title')}</h1>
        <p className="page-subtitle">
          {t('loginHint')}{' '}
          <Link href="/" style={{ color: 'var(--primary)', fontWeight: 700 }}>
            {tn('login')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-card page-section">
        <div
          className="dashboard-accent-bar"
          style={{ background: theme.bar }}
          aria-hidden
        />

        <div className="dashboard-hero">
          <div>
            <h1 className="page-title" style={{ marginBottom: 6 }}>
              {me ? t('greeting', { name: me.name || me.email }) : t('welcome')}
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              {t(subtitleKey)}
            </p>
          </div>
          {me && (
            <span
              className="dashboard-role-pill"
              style={{
                background: theme.pillBg,
                color: theme.pillFg,
                border: `1px solid ${theme.pillBorder}`,
              }}
            >
              {t(roleMessageKey(me.role))}
            </span>
          )}
        </div>

        {err && (
          <p style={{ color: 'var(--danger)', marginTop: 16, marginBottom: 0 }}>{err}</p>
        )}

        {me?.role === 'LEAGUE_ADMIN' && overview ? (
          <div className="card-soft" style={{ marginTop: 22 }}>
            {(() => {
              const grouped = Array.isArray(overview.grouped) ? overview.grouped : [];
              const rows = Array.isArray(overview.tasks) ? overview.tasks : [];
              const statusCount = (status: string) =>
                grouped.find((row) => row.status === status)?._count?._all ?? 0;
              const pendingApproval = rows.filter(
                (row) => row.approvalStatus === 'PENDING_APPROVAL',
              ).length;
              const approved = rows.filter((row) => row.approvalStatus === 'APPROVED').length;
              const rejected = rows.filter((row) => row.approvalStatus === 'REJECTED').length;
              return (
                <div style={{ display: 'grid', gap: 14 }}>
                  <h2 style={{ marginBottom: 0 }}>全局任务看板</h2>
                  <div className="grid-two">
                    <div className="card-soft">
                      <div className="topbar-muted">待开始</div>
                      <strong style={{ fontSize: 22 }}>{statusCount('TODO')}</strong>
                    </div>
                    <div className="card-soft">
                      <div className="topbar-muted">进行中</div>
                      <strong style={{ fontSize: 22 }}>{statusCount('IN_PROGRESS')}</strong>
                    </div>
                    <div className="card-soft">
                      <div className="topbar-muted">已完成</div>
                      <strong style={{ fontSize: 22 }}>{statusCount('DONE')}</strong>
                    </div>
                    <div className="card-soft">
                      <div className="topbar-muted">受阻</div>
                      <strong style={{ fontSize: 22 }}>{statusCount('BLOCKED')}</strong>
                    </div>
                  </div>
                  <div className="grid-two">
                    <div className="card-soft">
                      <div className="topbar-muted">待审核申请</div>
                      <strong style={{ fontSize: 22 }}>{pendingApproval}</strong>
                    </div>
                    <div className="card-soft">
                      <div className="topbar-muted">审核通过</div>
                      <strong style={{ fontSize: 22 }}>{approved}</strong>
                    </div>
                    <div className="card-soft">
                      <div className="topbar-muted">审核驳回</div>
                      <strong style={{ fontSize: 22 }}>{rejected}</strong>
                    </div>
                    <div className="card-soft">
                      <div className="topbar-muted">任务总数</div>
                      <strong style={{ fontSize: 22 }}>{rows.length}</strong>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}

        {me && (
          <div className="card-soft" style={{ marginTop: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', marginBottom: 12 }}>
              {t('accountCard')}
            </div>
            <div className="dashboard-account">
              <div className="dashboard-account-row">
                <span>
                  <strong>{me.name}</strong>
                </span>
                <span>{me.email}</span>
              </div>
              <div className="dashboard-account-row">
                <span>
                  {t('studentIdLabel')}: {me.studentId ?? '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="page-section">
        <h2 className="page-title" style={{ fontSize: 20, marginBottom: 4 }}>
          {t('quickEntry')}
        </h2>
        <p className="page-subtitle" style={{ marginBottom: 0, fontSize: 14 }}>
          {t('quickEntryHint')}
        </p>

        <div className="dashboard-grid">
          {quickKeys.map((key) => {
            const nav = navKeyForQuick(key);
            return (
              <Link key={key} href={QUICK_HREF[key]} className="dashboard-link-card">
                <div className="dashboard-link-title">{tSidebar(`${sidebarNs}.${nav}`)}</div>
                <p className="dashboard-link-desc">{t(QUICK_DESC[key])}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
