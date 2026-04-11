'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

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
type TaskOverviewTask = {
  status?: string;
  approvalStatus?: string;
  primaryOrgId?: string | null;
  primaryOrg?: Record<string, unknown> | null;
};
type TaskOverview = {
  grouped?: OverviewStatusRow[];
  tasks?: TaskOverviewTask[];
};
type DashboardTaskRow = {
  status?: string;
  approvalStatus?: string;
};
type ReviewStats = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
};
type SegmentTone = 'blue' | 'green' | 'yellow' | 'red' | 'indigo' | 'orange';
type VizSegment = {
  label: string;
  value: number;
  tone: SegmentTone;
};

type QuickKey = 'timeline' | 'tasks' | 'organizations' | 'profile' | 'notifications' | 'admin';
type SidebarRole = 'student' | 'orgAdmin' | 'leagueAdmin';

const ROLE_ORDER: Record<string, QuickKey[]> = {
  STUDENT: ['tasks', 'timeline', 'profile', 'organizations', 'notifications'],
  ORG_ADMIN: ['tasks', 'organizations', 'notifications', 'timeline', 'profile'],
  LEAGUE_ADMIN: ['admin', 'tasks', 'organizations', 'notifications', 'timeline', 'profile'],
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

const CAPABILITY_ROWS = [
  { titleKey: 'capabilities.multilingual.title', descKey: 'capabilities.multilingual.desc' },
  { titleKey: 'capabilities.studentTime.title', descKey: 'capabilities.studentTime.desc' },
  { titleKey: 'capabilities.orgFlow.title', descKey: 'capabilities.orgFlow.desc' },
  { titleKey: 'capabilities.leagueGovernance.title', descKey: 'capabilities.leagueGovernance.desc' },
] as const;

function roleMessageKey(role: string): 'role.STUDENT' | 'role.ORG_ADMIN' | 'role.LEAGUE_ADMIN' {
  if (role === 'ORG_ADMIN') return 'role.ORG_ADMIN';
  if (role === 'LEAGUE_ADMIN') return 'role.LEAGUE_ADMIN';
  return 'role.STUDENT';
}

function roleSummaryKey(role?: string) {
  if (role === 'ORG_ADMIN') return 'roleSummary.orgAdmin' as const;
  if (role === 'LEAGUE_ADMIN') return 'roleSummary.leagueAdmin' as const;
  return 'roleSummary.student' as const;
}

function statusCount(rows: DashboardTaskRow[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

function approvalCount(rows: DashboardTaskRow[], status: string) {
  return rows.filter((row) => row.approvalStatus === status).length;
}

function toneClass(tone: SegmentTone) {
  if (tone === 'blue') return 'dashboard-viz-segment-blue';
  if (tone === 'green') return 'dashboard-viz-segment-green';
  if (tone === 'yellow') return 'dashboard-viz-segment-yellow';
  if (tone === 'red') return 'dashboard-viz-segment-red';
  if (tone === 'orange') return 'dashboard-viz-segment-orange';
  return 'dashboard-viz-segment-indigo';
}

export default function DashboardPage() {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const tSidebar = useTranslations('sidebar');
  const tc = useTranslations('common');
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<DashboardTaskRow[]>([]);
  const [overview, setOverview] = useState<TaskOverview | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setTasks([]);
      setOverview(null);
      setReviewStats(null);
      setOverviewErr(null);
      setReviewErr(null);
      setLoadingData(false);
      return;
    }

    let active = true;

    async function load() {
      setLoadingData(true);
      setErr(null);
      setOverviewErr(null);
      setReviewErr(null);
      try {
        const user = await apiFetch<Me>('/users/me', { token });
        if (!active) return;
        setMe(user);

        try {
          const taskRows = await apiFetch<DashboardTaskRow[]>('/tasks', { token });
          if (active) {
            setTasks(Array.isArray(taskRows) ? taskRows : []);
          }
        } catch {
          if (active) setTasks([]);
        }

        if (user.role === 'LEAGUE_ADMIN') {
          const [overviewRes, reviewRes] = await Promise.allSettled([
            apiFetch<TaskOverview>('/tasks/admin/overview', { token }),
            apiFetch<ReviewStats>('/profile/admin/review-stats', { token }),
          ]);

          if (!active) return;

          if (overviewRes.status === 'fulfilled') {
            setOverview(overviewRes.value);
          } else {
            setOverview(null);
            setOverviewErr(
              overviewRes.reason instanceof Error
                ? overviewRes.reason.message
                : t('states.partialOverview'),
            );
          }

          if (reviewRes.status === 'fulfilled') {
            setReviewStats(reviewRes.value);
          } else {
            setReviewStats(null);
            setReviewErr(
              reviewRes.reason instanceof Error
                ? reviewRes.reason.message
                : t('viz.states.reviewUnavailable'),
            );
          }
        } else if (active) {
          setOverview(null);
          setReviewStats(null);
        }
      } catch (e) {
        if (active) {
          setMe(null);
          setTasks([]);
          setOverview(null);
          setReviewStats(null);
          setErr(e instanceof Error ? e.message : tc('error'));
        }
      } finally {
        if (active) setLoadingData(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [token, tc, t, reloadTick]);

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
  const roleSummary = useMemo(() => t(roleSummaryKey(me?.role)), [me?.role, t]);
  const coreQuickKeys = useMemo(() => quickKeys.slice(0, 3), [quickKeys]);
  const extraQuickKeys = useMemo(() => quickKeys.slice(3), [quickKeys]);
  const isLeagueAdmin = me?.role === 'LEAGUE_ADMIN';
  const metrics = useMemo(() => {
    if (me?.role === 'LEAGUE_ADMIN' && overview) {
      const grouped = Array.isArray(overview.grouped) ? overview.grouped : [];
      const rows = Array.isArray(overview.tasks) ? overview.tasks : [];
      const statusGrouped = (status: string) =>
        grouped.find((row) => row.status === status)?._count?._all ?? 0;
      return {
        todo: statusGrouped('TODO'),
        inProgress: statusGrouped('IN_PROGRESS'),
        done: statusGrouped('DONE'),
        blocked: statusGrouped('BLOCKED'),
        pendingApproval: rows.filter((row) => row.approvalStatus === 'PENDING_APPROVAL').length,
        approved: rows.filter((row) => row.approvalStatus === 'APPROVED').length,
        rejected: rows.filter((row) => row.approvalStatus === 'REJECTED').length,
        total: rows.length,
      };
    }
    return {
      todo: statusCount(tasks, 'TODO'),
      inProgress: statusCount(tasks, 'IN_PROGRESS'),
      done: statusCount(tasks, 'DONE'),
      blocked: statusCount(tasks, 'BLOCKED'),
      pendingApproval: approvalCount(tasks, 'PENDING_APPROVAL'),
      approved: approvalCount(tasks, 'APPROVED'),
      rejected: approvalCount(tasks, 'REJECTED'),
      total: tasks.length,
    };
  }, [me?.role, overview, tasks]);
  const overviewTasks = useMemo(
    () => (Array.isArray(overview?.tasks) ? overview.tasks : []),
    [overview?.tasks],
  );
  const taskStatusSegments = useMemo<VizSegment[] | null>(() => {
    if (!isLeagueAdmin || !overview) return null;
    const grouped = Array.isArray(overview.grouped) ? overview.grouped : [];
    const statusGrouped = (status: string) =>
      grouped.find((row) => row.status === status)?._count?._all ?? 0;
    return [
      { label: t('viz.taskStatus.todo'), value: statusGrouped('TODO'), tone: 'blue' },
      { label: t('viz.taskStatus.inProgress'), value: statusGrouped('IN_PROGRESS'), tone: 'indigo' },
      { label: t('viz.taskStatus.done'), value: statusGrouped('DONE'), tone: 'green' },
      { label: t('viz.taskStatus.blocked'), value: statusGrouped('BLOCKED'), tone: 'red' },
    ];
  }, [isLeagueAdmin, overview, t]);
  const reviewSegments = useMemo<VizSegment[] | null>(() => {
    if (!isLeagueAdmin || !reviewStats) return null;
    return [
      { label: t('viz.review.pending'), value: reviewStats.pending, tone: 'yellow' },
      { label: t('viz.review.approved'), value: reviewStats.approved, tone: 'green' },
      { label: t('viz.review.rejected'), value: reviewStats.rejected, tone: 'red' },
    ];
  }, [isLeagueAdmin, reviewStats, t]);
  const orgTaskRanking = useMemo(() => {
    if (!isLeagueAdmin || overviewTasks.length === 0) return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const task of overviewTasks) {
      const orgId = task.primaryOrgId ?? '';
      if (!orgId) continue;
      const orgName = triField((task.primaryOrg as Record<string, unknown>) ?? {}, 'name', locale);
      const row = map.get(orgId);
      if (row) {
        row.count += 1;
      } else {
        map.set(orgId, {
          name: orgName || t('viz.orgTasks.unknownOrg'),
          count: 1,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [isLeagueAdmin, locale, overviewTasks, t]);

  const statCards = useMemo(() => {
    if (me?.role === 'LEAGUE_ADMIN') {
      return [
        { label: t('stats.league.pendingApproval'), value: metrics.pendingApproval },
        { label: t('stats.league.approved'), value: metrics.approved },
        { label: t('stats.league.rejected'), value: metrics.rejected },
        { label: t('stats.league.total'), value: metrics.total },
      ];
    }
    if (me?.role === 'ORG_ADMIN') {
      return [
        { label: t('stats.org.arranged'), value: metrics.approved },
        { label: t('stats.org.reviewing'), value: metrics.pendingApproval },
        { label: t('stats.org.rejected'), value: metrics.rejected },
        { label: t('stats.org.total'), value: metrics.total },
      ];
    }
    return [
      { label: t('stats.student.todo'), value: metrics.todo },
      { label: t('stats.student.inProgress'), value: metrics.inProgress },
      { label: t('stats.student.done'), value: metrics.done },
      { label: t('stats.student.total'), value: metrics.total },
    ];
  }, [me?.role, metrics, t]);
  const segmentPercent = (value: number, total: number) =>
    total > 0 ? `${Math.max(3, (value / total) * 100)}%` : '0%';
  const renderSegments = (segments: VizSegment[] | null, emptyText: string) => {
    if (!segments) {
      return (
        <div className="dashboard-viz-empty">
          <p className="topbar-muted" style={{ margin: 0 }}>
            {emptyText}
          </p>
        </div>
      );
    }
    const total = segments.reduce((sum, seg) => sum + seg.value, 0);
    if (total === 0) {
      return (
        <div className="dashboard-viz-empty">
          <p className="topbar-muted" style={{ margin: 0 }}>
            {t('viz.states.empty')}
          </p>
        </div>
      );
    }
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="dashboard-viz-bar">
          {segments
            .filter((seg) => seg.value > 0)
            .map((seg) => (
              <div
                key={seg.label}
                className={`dashboard-viz-segment ${toneClass(seg.tone)}`}
                style={{ width: segmentPercent(seg.value, total) }}
                title={`${seg.label}: ${seg.value}`}
              />
            ))}
        </div>
        <div className="dashboard-viz-legend">
          {segments.map((seg) => (
            <div key={seg.label} className="dashboard-viz-legend-row">
              <span className="dashboard-viz-legend-label">
                <span className={`dashboard-viz-dot ${toneClass(seg.tone)}`} />
                {seg.label}
              </span>
              <strong>{seg.value}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!ready || !token) {
    return (
      <div className="page-card page-section dashboard-state">
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          {t('states.authChecking')}
        </p>
      </div>
    );
  }

  if (loadingData && !me) {
    return (
      <div className="page-card page-section dashboard-state">
        <h1 className="page-title" style={{ fontSize: 26, marginBottom: 8 }}>
          {t('title')}
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          {t('states.loadingData')}
        </p>
      </div>
    );
  }

  if (err && !me) {
    return (
      <div className="page-card page-section dashboard-state dashboard-state-error">
        <h1 className="page-title" style={{ fontSize: 26, marginBottom: 8 }}>
          {t('title')}
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          {t('states.errorTitle')}
        </p>
        <p style={{ color: 'var(--danger)', marginTop: 0, marginBottom: 14 }}>{err}</p>
        <button type="button" onClick={() => setReloadTick((v) => v + 1)}>
          {t('states.retry')}
        </button>
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

        <div className="dashboard-hero-grid">
          <div>
            <div className="dashboard-hero">
              <div>
                <h1 className="page-title" style={{ marginBottom: 6 }}>
                  {me ? t('greeting', { name: me.name || me.email }) : t('welcome')}
                </h1>
                <p className="page-subtitle" style={{ marginBottom: 0 }}>
                  {t(subtitleKey)}
                </p>
                <p className="dashboard-hero-tagline">{t('hero.tagline')}</p>
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

            <div className="dashboard-capability-grid">
              {CAPABILITY_ROWS.map((row) => (
                <div key={row.titleKey} className="dashboard-capability-card">
                  <div className="dashboard-capability-title">{t(row.titleKey)}</div>
                  <p className="dashboard-capability-desc">{t(row.descKey)}</p>
                </div>
              ))}
            </div>
          </div>

          {me && (
            <div className="dashboard-role-summary-card">
              <h2 style={{ marginBottom: 10 }}>{t('summary.title')}</h2>
              <p className="page-subtitle" style={{ marginBottom: 14 }}>
                {roleSummary}
              </p>
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

        {err && (
          <p style={{ color: 'var(--danger)', marginTop: 16, marginBottom: 0 }}>
            {t('states.partialData')}: {err}
          </p>
        )}
      </div>

      <div className="page-section">
        <div className="card-soft">
          <div className="dashboard-section-header">
            <div>
              <h2 style={{ marginBottom: 4 }}>{t('stats.title')}</h2>
              <p className="topbar-muted" style={{ margin: 0 }}>
                {t('stats.hint')}
              </p>
            </div>
            <button type="button" onClick={() => setReloadTick((v) => v + 1)}>
              {tc('refresh')}
            </button>
          </div>

          <div className="dashboard-stats-grid">
            {statCards.map((row) => (
              <div key={row.label} className="dashboard-stat-card">
                <div className="topbar-muted">{row.label}</div>
                <strong className="dashboard-stat-value">{row.value}</strong>
              </div>
            ))}
          </div>

          {overviewErr && me?.role === 'LEAGUE_ADMIN' ? (
            <p className="dashboard-state-note">{overviewErr}</p>
          ) : null}

          {!loadingData && tasks.length === 0 ? (
            <div className="dashboard-empty-card">
              <h3 style={{ marginBottom: 8 }}>{t('states.emptyTitle')}</h3>
              <p className="page-subtitle" style={{ marginBottom: 12 }}>
                {t('states.emptyDesc')}
              </p>
              <Link href="/tasks" className="dashboard-link-inline">
                {t('states.emptyAction')}
              </Link>
            </div>
          ) : null}

          {isLeagueAdmin ? (
            <div className="dashboard-viz-grid">
              <div className="dashboard-viz-card">
                <h3 className="dashboard-viz-title">{t('viz.taskStatus.title')}</h3>
                <p className="topbar-muted dashboard-viz-subtitle">{t('viz.taskStatus.hint')}</p>
                {loadingData && !taskStatusSegments ? (
                  <p className="topbar-muted">{t('viz.states.loading')}</p>
                ) : overviewErr ? (
                  <p className="dashboard-viz-error">{overviewErr}</p>
                ) : (
                  renderSegments(taskStatusSegments, t('viz.states.overviewUnavailable'))
                )}
              </div>

              <div className="dashboard-viz-card">
                <h3 className="dashboard-viz-title">{t('viz.review.title')}</h3>
                <p className="topbar-muted dashboard-viz-subtitle">{t('viz.review.hint')}</p>
                {loadingData && !reviewSegments ? (
                  <p className="topbar-muted">{t('viz.states.loading')}</p>
                ) : reviewErr ? (
                  <p className="dashboard-viz-error">{reviewErr}</p>
                ) : (
                  renderSegments(reviewSegments, t('viz.states.reviewUnavailable'))
                )}
              </div>

              <div className="dashboard-viz-card">
                <h3 className="dashboard-viz-title">{t('viz.orgTasks.title')}</h3>
                <p className="topbar-muted dashboard-viz-subtitle">{t('viz.orgTasks.hint')}</p>
                {loadingData && orgTaskRanking.length === 0 ? (
                  <p className="topbar-muted">{t('viz.states.loading')}</p>
                ) : overviewErr ? (
                  <p className="dashboard-viz-error">{t('viz.states.overviewUnavailable')}</p>
                ) : orgTaskRanking.length === 0 ? (
                  <p className="topbar-muted">{t('viz.orgTasks.empty')}</p>
                ) : (
                  <div className="dashboard-viz-org-list">
                    {orgTaskRanking.map((row) => {
                      const max = orgTaskRanking[0]?.count || 1;
                      const pct = `${Math.max(8, (row.count / max) * 100)}%`;
                      return (
                        <div key={row.name} className="dashboard-viz-org-item">
                          <div className="dashboard-viz-org-header">
                            <span>{row.name}</span>
                            <strong>{t('viz.orgTasks.count', { count: row.count })}</strong>
                          </div>
                          <div className="dashboard-viz-org-track">
                            <div className="dashboard-viz-org-fill" style={{ width: pct }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
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
            const className = coreQuickKeys.includes(key)
              ? 'dashboard-link-card dashboard-link-card-primary'
              : 'dashboard-link-card';
            return (
              <Link key={key} href={QUICK_HREF[key]} className={className}>
                <div className="dashboard-link-title">{tSidebar(`${sidebarNs}.${nav}`)}</div>
                <p className="dashboard-link-desc">{t(QUICK_DESC[key])}</p>
                {coreQuickKeys.includes(key) ? (
                  <span className="dashboard-link-badge">{t('quickPrimary')}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
        {extraQuickKeys.length > 0 ? (
          <p className="topbar-muted" style={{ marginTop: 12, marginBottom: 0 }}>
            {t('quickExtraHint')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
