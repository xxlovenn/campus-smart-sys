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
  managedOrgIds?: string[];
};
type OverviewStatusRow = {
  status?: string;
  _count?: { _all?: number };
};
type TaskOverviewTask = {
  id?: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  status?: string;
  approvalStatus?: string;
  createdAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  primaryOrgId?: string | null;
  primaryOrg?: Record<string, unknown> | null;
};
type TaskOverview = {
  grouped?: OverviewStatusRow[];
  tasks?: TaskOverviewTask[];
};
type DashboardTaskRow = {
  id: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  status?: string;
  approvalStatus?: string;
  startAt?: string | null;
  endAt?: string | null;
  dueAt?: string | null;
  createdAt?: string | null;
  source?: string;
  primaryOrgId?: string | null;
  relatedOrgs?: Array<{ organizationId?: string }>;
};
type ScheduleEntry = {
  id: string;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  courseZh?: string;
  courseEn?: string;
  courseRu?: string;
  locationZh?: string;
  locationEn?: string;
  locationRu?: string;
};
type ScheduleResponse = { entries?: ScheduleEntry[] };
type ReminderPlanRow = {
  id: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  dueAt?: string | null;
};
type UpcomingReminders = {
  plans?: ReminderPlanRow[];
  tasks?: DashboardTaskRow[];
  windowDays?: number;
};
type RecommendationItem = {
  id: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  status?: string;
  dueAt?: string | null;
  recommendationPriority?: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendationScore?: number;
  recommendationReasons?: string[];
  order?: number;
};
type TaskRecommendationsResponse = {
  generatedAt?: string;
  items?: RecommendationItem[];
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
type StudentTaskCardRow = {
  id: string;
  title: string;
  dueAt: string | null;
  score: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
  order?: number;
};
type StudentDeadlineRow = {
  id: string;
  title: string;
  dueAt: string;
  type: 'plan' | 'task';
  overdue: boolean;
};
type TimelineVizItem = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  type: 'COURSE' | 'TASK' | 'ACTIVITY';
  source: string;
  status?: string;
};
type StudentTimelineFilter = 'ALL' | 'COURSE' | 'TASK' | 'ACTIVITY';
type StudentTimelineRange = 'DAY' | 'WEEK' | 'MONTH';
const TIMELINE_SYNC_KEY = 'studentTimelineSyncV1';

type QuickKey = 'timeline' | 'tasks' | 'organizations' | 'profile' | 'notifications' | 'admin';
type SidebarRole = 'student' | 'orgAdmin' | 'leagueAdmin';
type OrgDeadlineWindow = 24 | 48 | 72;
type LeagueRecentFilter = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'DONE';
const ORG_DEADLINE_WINDOWS: OrgDeadlineWindow[] = [24, 48, 72];
const LEAGUE_RECENT_FILTERS: LeagueRecentFilter[] = ['ALL', 'PENDING', 'IN_PROGRESS', 'DONE'];

const ROLE_ORDER: Record<string, QuickKey[]> = {
  STUDENT: ['tasks', 'timeline', 'profile', 'organizations', 'notifications'],
  ORG_ADMIN: ['tasks', 'organizations', 'notifications', 'profile'],
  LEAGUE_ADMIN: ['admin', 'tasks', 'organizations', 'notifications', 'profile'],
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

function parseDateValue(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(date: Date, target: Date) {
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

function formatDateTimeShort(value: string | null | undefined) {
  const d = parseDateValue(value);
  if (!d) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toTodayIso(weekday: number | undefined, hhmm: string | undefined) {
  if (!hhmm) return null;
  const [hRaw, mRaw] = hhmm.split(':');
  const hour = Number(hRaw);
  const minute = Number(mRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const now = new Date();
  const d = new Date(now);
  const currentWeekday = now.getDay() || 7;
  const targetWeekday = weekday || currentWeekday;
  d.setDate(now.getDate() + (targetWeekday - currentWeekday));
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function toDayBoundary(date: Date, hour: number, minute: number) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function startOfDay(date: Date) {
  return toDayBoundary(date, 0, 0);
}

function startOfWeekMonday(date: Date) {
  const d = startOfDay(date);
  const weekday = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (weekday - 1));
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function combineDateAndTime(day: Date, hhmm?: string) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function dateKey(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatHourMinuteLabel(value: string | null | undefined) {
  const d = parseDateValue(value);
  if (!d) return '--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [studentDataErr, setStudentDataErr] = useState<string | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminders | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [orgDeadlineWindow, setOrgDeadlineWindow] = useState<OrgDeadlineWindow>(72);
  const [leagueRecentFilter, setLeagueRecentFilter] = useState<LeagueRecentFilter>('ALL');
  const [studentTimelineFilter, setStudentTimelineFilter] = useState<StudentTimelineFilter>('ALL');
  const [studentTimelineRange, setStudentTimelineRange] = useState<StudentTimelineRange>('WEEK');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(TIMELINE_SYNC_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { range?: StudentTimelineRange };
      if (parsed.range && ['DAY', 'WEEK', 'MONTH'].includes(parsed.range)) {
        setStudentTimelineRange(parsed.range);
      }
    } catch {
      // ignore malformed storage payload
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TIMELINE_SYNC_KEY, JSON.stringify({ range: studentTimelineRange }));
  }, [studentTimelineRange]);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setTasks([]);
      setOverview(null);
      setReviewStats(null);
      setOverviewErr(null);
      setReviewErr(null);
      setStudentDataErr(null);
      setScheduleEntries([]);
      setUpcomingReminders(null);
      setRecommendations([]);
      setLoadingData(false);
      return;
    }

    let active = true;

    async function load() {
      setLoadingData(true);
      setErr(null);
      setOverviewErr(null);
      setReviewErr(null);
      setStudentDataErr(null);
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

        if (user.role === 'STUDENT') {
          const [scheduleRes, reminderRes, recommendRes] = await Promise.allSettled([
            apiFetch<ScheduleResponse>('/schedule', { token }),
            apiFetch<UpcomingReminders>('/reminders/upcoming', { token }),
            apiFetch<TaskRecommendationsResponse>('/tasks/recommendations', { token }),
          ]);
          if (!active) return;

          if (scheduleRes.status === 'fulfilled') {
            const entries = Array.isArray(scheduleRes.value?.entries) ? scheduleRes.value.entries : [];
            setScheduleEntries(entries);
          } else {
            setScheduleEntries([]);
            setStudentDataErr(
              scheduleRes.reason instanceof Error
                ? scheduleRes.reason.message
                : t('studentHome.partialLoad'),
            );
          }

          if (reminderRes.status === 'fulfilled') {
            setUpcomingReminders(reminderRes.value);
          } else {
            setUpcomingReminders({ plans: [], tasks: [], windowDays: 7 });
            setStudentDataErr((prev) =>
              prev || (reminderRes.reason instanceof Error ? reminderRes.reason.message : t('studentHome.partialLoad')),
            );
          }

          if (recommendRes.status === 'fulfilled') {
            setRecommendations(Array.isArray(recommendRes.value?.items) ? recommendRes.value.items : []);
          } else {
            setRecommendations([]);
            setStudentDataErr((prev) =>
              prev ||
              (recommendRes.reason instanceof Error ? recommendRes.reason.message : t('studentHome.partialLoad')),
            );
          }
        } else if (active) {
          setStudentDataErr(null);
          setScheduleEntries([]);
          setUpcomingReminders(null);
          setRecommendations([]);
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
  const isStudent = me?.role === 'STUDENT';
  const isOrgAdmin = me?.role === 'ORG_ADMIN';
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
  const leagueRecentTasks = useMemo(() => {
    if (!isLeagueAdmin) return [];
    const rows = tasks
      .map((row) => {
        const sortDate =
          parseDateValue(row.createdAt ?? null) ??
          parseDateValue(row.startAt ?? null) ??
          parseDateValue(row.endAt ?? row.dueAt ?? null);
        return {
          id: row.id,
          title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
          status: row.status ?? 'TODO',
          createdAt: row.createdAt ?? null,
          sortTime: sortDate?.getTime() ?? 0,
        };
      })
      .sort((a, b) => b.sortTime - a.sortTime);
    return rows.slice(0, 6);
  }, [isLeagueAdmin, locale, tasks, t]);
  const leaguePendingReviewTasks = useMemo(() => {
    if (!isLeagueAdmin) return [];
    return tasks
      .filter((row) => row.approvalStatus === 'PENDING_APPROVAL')
      .map((row) => ({
        id: row.id,
        title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
        dueAt: row.endAt ?? row.dueAt ?? row.startAt ?? null,
      }))
      .sort((a, b) => {
        const da = parseDateValue(a.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const db = parseDateValue(b.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      })
      .slice(0, 5);
  }, [isLeagueAdmin, locale, tasks, t]);
  const filteredLeagueRecentTasks = useMemo(() => {
    if (leagueRecentFilter === 'ALL') return leagueRecentTasks;
    if (leagueRecentFilter === 'PENDING') {
      return leagueRecentTasks.filter((row) => row.status === 'TODO' || row.status === 'BLOCKED');
    }
    if (leagueRecentFilter === 'IN_PROGRESS') {
      return leagueRecentTasks.filter((row) => row.status === 'IN_PROGRESS');
    }
    return leagueRecentTasks.filter((row) => row.status === 'DONE');
  }, [leagueRecentFilter, leagueRecentTasks]);
  const studentWindowStart = useMemo(() => {
    const now = new Date();
    if (studentTimelineRange === 'DAY') return startOfDay(now);
    if (studentTimelineRange === 'WEEK') return startOfWeekMonday(now);
    return startOfMonth(now);
  }, [studentTimelineRange]);
  const studentWindowEnd = useMemo(() => {
    if (studentTimelineRange === 'DAY') return addDays(studentWindowStart, 1);
    if (studentTimelineRange === 'WEEK') return addDays(studentWindowStart, 7);
    return new Date(
      studentWindowStart.getFullYear(),
      studentWindowStart.getMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );
  }, [studentTimelineRange, studentWindowStart]);
  const todayCourses = useMemo(() => {
    if (!isStudent) return [];
    const weekday = new Date().getDay() || 7;
    const unique = new Set<string>();
    return scheduleEntries
      .filter((row) => row.weekday === weekday)
      .filter((row) => {
        const key = [
          triField(row as unknown as Record<string, unknown>, 'course', locale) || '',
          row.startTime ?? '',
          row.endTime ?? '',
          triField(row as unknown as Record<string, unknown>, 'location', locale) || '',
        ].join('|');
        if (unique.has(key)) return false;
        unique.add(key);
        return true;
      })
      .sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))
      .slice(0, 12);
  }, [isStudent, locale, scheduleEntries]);
  const todayTaskCards = useMemo<StudentTaskCardRow[]>(() => {
    if (!isStudent) return [];
    if (recommendations.length > 0) {
      return recommendations.slice(0, 5).map((row) => ({
        id: row.id,
        title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
        dueAt: row.dueAt ?? null,
        score: row.recommendationScore ?? 0,
        priority: row.recommendationPriority ?? 'LOW',
        reasons: Array.isArray(row.recommendationReasons) ? row.recommendationReasons : [],
        order: row.order,
      }));
    }

    const now = new Date();
    const scoreFor = (task: DashboardTaskRow) => {
      const due = parseDateValue(task.endAt ?? task.dueAt ?? task.startAt ?? null);
      let score = 0;
      if (task.status === 'IN_PROGRESS') score += 45;
      else if (task.status === 'TODO') score += 30;
      else if (task.status === 'BLOCKED') score += 20;
      else if (task.status === 'DONE') score -= 25;
      if (task.approvalStatus === 'PENDING_APPROVAL') score -= 10;
      if (due) {
        const diff = due.getTime() - now.getTime();
        if (diff < 0) score += 60;
        else if (isSameDay(due, now)) score += 45;
        else if (diff <= 24 * 60 * 60 * 1000) score += 35;
      }
      return score;
    };

    const rows = tasks
      .map((task) => {
        const due = parseDateValue(task.endAt ?? task.dueAt ?? task.startAt ?? null);
        const score = scoreFor(task);
        const priority: StudentTaskCardRow['priority'] =
          score >= 80 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
        return {
          id: task.id,
          title: triField(task as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
          dueAt: due ? due.toISOString() : null,
          score,
          priority,
          reasons: [],
        };
      })
      .sort((a, b) => b.score - a.score || String(a.dueAt ?? '').localeCompare(String(b.dueAt ?? '')));

    const todayOnly = rows.filter((row) => {
      const due = parseDateValue(row.dueAt);
      return due ? isSameDay(due, now) : false;
    });
    return (todayOnly.length > 0 ? todayOnly : rows).slice(0, 5);
  }, [isStudent, locale, recommendations, tasks, t]);
  const studentDeadlines = useMemo<StudentDeadlineRow[]>(() => {
    if (!isStudent) return [];
    const now = Date.now();
    const horizon = now + 48 * 60 * 60 * 1000;
    const planRows: StudentDeadlineRow[] = (upcomingReminders?.plans ?? []).flatMap((row) => {
        const due = parseDateValue(row.dueAt ?? null);
        if (!due) return [];
        return [
          {
            id: `plan-${row.id}`,
            title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
            dueAt: due.toISOString(),
            type: 'plan' as const,
            overdue: due.getTime() < now,
          },
        ];
      });
    const taskRows: StudentDeadlineRow[] = (upcomingReminders?.tasks ?? []).flatMap((row) => {
        const due = parseDateValue(row.endAt ?? row.dueAt ?? row.startAt ?? null);
        if (!due) return [];
        return [
          {
            id: `task-${row.id}`,
            title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
            dueAt: due.toISOString(),
            type: 'task' as const,
            overdue: due.getTime() < now,
          },
        ];
      });

    return [...planRows, ...taskRows]
      .filter((row) => {
        const due = parseDateValue(row.dueAt);
        if (!due) return false;
        const ts = due.getTime();
        return ts <= horizon;
      })
      .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
      .slice(0, 5);
  }, [isStudent, locale, t, upcomingReminders]);
  const aiSuggestions = useMemo(() => {
    if (!isStudent) return [];
    const rows: string[] = [];
    if (studentDeadlines.length > 0) {
      rows.push(t('studentHome.ai.deadlineFirst', { count: studentDeadlines.length }));
    }
    if (todayTaskCards.length > 0) {
      rows.push(t('studentHome.ai.taskFirst', { task: todayTaskCards[0].title }));
    }
    if (todayCourses.length > 0) {
      rows.push(
        t('studentHome.ai.courseFirst', {
          course:
            triField(todayCourses[0] as unknown as Record<string, unknown>, 'course', locale) || t('title'),
        }),
      );
    }
    if (rows.length === 0) {
      rows.push(t('studentHome.ai.focus'));
    }
    return rows.slice(0, 3);
  }, [isStudent, locale, studentDeadlines.length, t, todayCourses, todayTaskCards]);
  const studentTimelineItems = useMemo<TimelineVizItem[]>(() => {
    if (!isStudent) return [];
    const courseRows: TimelineVizItem[] = [];
    for (let d = new Date(studentWindowStart); d < studentWindowEnd; d = addDays(d, 1)) {
      const weekday = d.getDay() || 7;
      const rows = scheduleEntries.filter((row) => row.weekday === weekday);
      for (const row of rows) {
        courseRows.push({
          id: `course-${row.id}-${d.toISOString().slice(0, 10)}`,
          title: triField(row as unknown as Record<string, unknown>, 'course', locale) || t('title'),
          startAt: combineDateAndTime(d, row.startTime),
          endAt: combineDateAndTime(d, row.endTime),
          type: 'COURSE',
          source: '课表',
        });
      }
    }
    const taskRows: TimelineVizItem[] = tasks
      .filter((row) => row.status !== 'DONE')
      .map((row) => ({
        id: `task-${row.id}`,
        title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
        startAt: row.startAt ?? null,
        endAt: row.endAt ?? row.dueAt ?? null,
        type: row.source === 'ORG_REQUEST' ? 'ACTIVITY' : 'TASK',
        source: row.source === 'ORG_REQUEST' ? '活动' : '任务',
        status: row.status,
      }));
    const startTs = studentWindowStart.getTime();
    const endTs = studentWindowEnd.getTime();
    return [...courseRows, ...taskRows]
      .filter((row) => {
        const ts = parseDateValue(row.startAt ?? row.endAt)?.getTime();
        if (!ts) return false;
        return ts >= startTs && ts < endTs;
      })
      .sort((a, b) => {
        const ta = parseDateValue(a.startAt ?? a.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const tb = parseDateValue(b.startAt ?? b.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      })
      .slice(0, 20);
  }, [isStudent, locale, scheduleEntries, studentWindowEnd, studentWindowStart, t, tasks]);
  const filteredStudentTimelineItems = useMemo(() => {
    if (studentTimelineFilter === 'ALL') return studentTimelineItems;
    return studentTimelineItems.filter((row) => row.type === studentTimelineFilter);
  }, [studentTimelineFilter, studentTimelineItems]);
  const studentTimelineAxisRows = useMemo(() => {
    if (!isStudent || studentTimelineRange !== 'DAY') return [];
    const dayStart = toDayBoundary(studentWindowStart, 6, 0);
    const dayEnd = toDayBoundary(studentWindowStart, 23, 0);
    const totalMinutes = Math.max(1, (dayEnd.getTime() - dayStart.getTime()) / (60 * 1000));
    return filteredStudentTimelineItems
      .map((row) => {
        const parsedStart = parseDateValue(row.startAt ?? row.endAt);
        const parsedEnd = parseDateValue(row.endAt ?? row.startAt);
        if (!parsedStart && !parsedEnd) return null;
        const start = parsedStart ?? parsedEnd!;
        const end = parsedEnd ?? parsedStart!;
        const safeStart = start.getTime() <= end.getTime() ? start : end;
        const safeEnd = end.getTime() >= start.getTime() ? end : start;
        const clippedStartMs = clampNumber(safeStart.getTime(), dayStart.getTime(), dayEnd.getTime());
        const clippedEndMs = clampNumber(safeEnd.getTime(), dayStart.getTime(), dayEnd.getTime());
        if (clippedEndMs <= dayStart.getTime() || clippedStartMs >= dayEnd.getTime()) return null;
        const leftPct = ((clippedStartMs - dayStart.getTime()) / (60 * 1000 * totalMinutes)) * 100;
        const durationPct = ((Math.max(clippedEndMs - clippedStartMs, 30 * 60 * 1000) / 60_000) / totalMinutes) * 100;
        return {
          id: row.id,
          title: row.title,
          leftPct: clampNumber(leftPct, 0, 100),
          widthPct: clampNumber(durationPct, 6, 100),
          type: row.type,
          source: row.source,
          startAt: row.startAt,
          endAt: row.endAt,
          status: row.status,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [filteredStudentTimelineItems, isStudent, studentTimelineRange, studentWindowStart]);
  const studentWeekDays = useMemo(() => {
    if (!isStudent || studentTimelineRange !== 'WEEK') return [];
    return Array.from({ length: 7 }, (_, idx) => {
      const day = addDays(studentWindowStart, idx);
      const key = dateKey(day);
      const items = filteredStudentTimelineItems
        .filter((row) => {
          const start = parseDateValue(row.startAt ?? row.endAt);
          return start ? dateKey(start) === key : false;
        })
        .slice(0, 5);
      return { key, day, items };
    });
  }, [filteredStudentTimelineItems, isStudent, studentTimelineRange, studentWindowStart]);
  const studentMonthCells = useMemo(() => {
    if (!isStudent || studentTimelineRange !== 'MONTH') return [];
    const year = studentWindowStart.getFullYear();
    const month = studentWindowStart.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const cells: Array<{ day: Date | null; items: TimelineVizItem[] }> = [];
    for (let i = 0; i < offset; i += 1) cells.push({ day: null, items: [] });
    for (let day = 1; day <= days; day += 1) {
      const d = new Date(year, month, day);
      const key = dateKey(d);
      const items = filteredStudentTimelineItems
        .filter((row) => {
          const start = parseDateValue(row.startAt ?? row.endAt);
          return start ? dateKey(start) === key : false;
        })
        .slice(0, 3);
      cells.push({ day: d, items });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, items: [] });
    return cells;
  }, [filteredStudentTimelineItems, isStudent, studentTimelineRange, studentWindowStart]);
  const orgScopedTasks = useMemo(() => {
    if (!isOrgAdmin) return [];
    const managed = Array.isArray(me?.managedOrgIds) ? me.managedOrgIds : [];
    return tasks.filter((task) => {
      if (managed.length === 0) return true;
      if (task.primaryOrgId && managed.includes(task.primaryOrgId)) return true;
      return (task.relatedOrgs ?? []).some((row) => row.organizationId && managed.includes(row.organizationId));
    });
  }, [isOrgAdmin, me?.managedOrgIds, tasks]);
  const orgActivityTimelineItems = useMemo<TimelineVizItem[]>(() => {
    if (!isOrgAdmin) return [];
    const rows = orgScopedTasks
      .filter((row) => row.approvalStatus === 'APPROVED')
      .map((row) => ({
        id: `org-activity-${row.id}`,
        title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
        startAt: row.startAt ?? null,
        endAt: row.endAt ?? row.dueAt ?? null,
        type: 'ACTIVITY' as const,
        source: '活动安排',
        status: row.status,
      }))
      .sort((a, b) => {
        const ta = parseDateValue(a.startAt ?? a.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const tb = parseDateValue(b.startAt ?? b.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    return rows.slice(0, 6);
  }, [isOrgAdmin, locale, orgScopedTasks, t]);
  const leagueActivityTimelineItems = useMemo<TimelineVizItem[]>(() => {
    if (!isLeagueAdmin) return [];
    return tasks
      .filter((row) => row.approvalStatus === 'APPROVED')
      .map((row) => ({
        id: `league-activity-${row.id}`,
        title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
        startAt: row.startAt ?? null,
        endAt: row.endAt ?? row.dueAt ?? null,
        type: 'ACTIVITY' as const,
        source: '全局活动',
        status: row.status,
      }))
      .sort((a, b) => {
        const ta = parseDateValue(a.startAt ?? a.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const tb = parseDateValue(b.startAt ?? b.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      })
      .slice(0, 8);
  }, [isLeagueAdmin, locale, t, tasks]);
  const orgUpcomingActivityItems = useMemo(() => {
    if (!isOrgAdmin) return [];
    const now = Date.now();
    const horizon = now + 14 * 24 * 60 * 60 * 1000;
    return orgActivityTimelineItems.filter((row) => {
      const start = parseDateValue(row.startAt ?? row.endAt)?.getTime();
      const end = parseDateValue(row.endAt ?? row.startAt)?.getTime();
      const key = start ?? end ?? Number.MAX_SAFE_INTEGER;
      return key >= now - 2 * 60 * 60 * 1000 && key <= horizon;
    });
  }, [isOrgAdmin, orgActivityTimelineItems]);
  const orgActivitySummary = useMemo(() => {
    if (!isOrgAdmin) return { next7: 0, next14: 0, pendingReview: 0 };
    const now = Date.now();
    const h7 = now + 7 * 24 * 60 * 60 * 1000;
    const h14 = now + 14 * 24 * 60 * 60 * 1000;
    const next7 = orgUpcomingActivityItems.filter((row) => {
      const ts = parseDateValue(row.startAt ?? row.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ts <= h7;
    }).length;
    const next14 = orgUpcomingActivityItems.filter((row) => {
      const ts = parseDateValue(row.startAt ?? row.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ts <= h14;
    }).length;
    const pendingReview = orgScopedTasks.filter((row) => row.approvalStatus === 'PENDING_APPROVAL').length;
    return { next7, next14, pendingReview };
  }, [isOrgAdmin, orgScopedTasks, orgUpcomingActivityItems]);
  const orgCalendarDays = useMemo(() => {
    if (!isOrgAdmin) {
      return [] as Array<{
        key: string;
        label: string;
        weekday: string;
        items: Array<{ id: string; title: string; start: Date; end: Date; status?: string }>;
        overlapCount: number;
      }>;
    }
    const weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return {
        date: d,
        key: `${d.getFullYear()}-${mm}-${dd}`,
        label: `${mm}/${dd}`,
        weekday: weekdayShort[d.getDay()],
        items: [] as Array<{ id: string; title: string; start: Date; end: Date; status?: string }>,
        overlapCount: 0,
      };
    });
    for (const row of orgUpcomingActivityItems) {
      const start = parseDateValue(row.startAt ?? row.endAt);
      const end = parseDateValue(row.endAt ?? row.startAt);
      if (!start || !end) continue;
      const safeStart = start.getTime() <= end.getTime() ? start : end;
      const safeEnd = end.getTime() >= start.getTime() ? end : start;
      const key = `${safeStart.getFullYear()}-${String(safeStart.getMonth() + 1).padStart(2, '0')}-${String(
        safeStart.getDate(),
      ).padStart(2, '0')}`;
      const day = days.find((d) => d.key === key);
      if (!day) continue;
      day.items.push({
        id: row.id,
        title: row.title,
        start: safeStart,
        end: safeEnd,
        status: row.status,
      });
    }
    for (const day of days) {
      day.items.sort((a, b) => a.start.getTime() - b.start.getTime());
      let overlapCount = 0;
      let latestEnd = -1;
      for (const item of day.items) {
        const startTs = item.start.getTime();
        const endTs = item.end.getTime();
        if (latestEnd !== -1 && startTs < latestEnd) overlapCount += 1;
        latestEnd = Math.max(latestEnd, endTs);
      }
      day.overlapCount = overlapCount;
    }
    return days.map(({ key, label, weekday, items, overlapCount }) => ({
      key,
      label,
      weekday,
      items,
      overlapCount,
    }));
  }, [isOrgAdmin, orgUpcomingActivityItems]);
  const leagueUpcomingActivityItems = useMemo(() => {
    if (!isLeagueAdmin) return [];
    const now = Date.now();
    const horizon = now + 14 * 24 * 60 * 60 * 1000;
    return leagueActivityTimelineItems.filter((row) => {
      const ts = parseDateValue(row.startAt ?? row.endAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ts >= now - 2 * 60 * 60 * 1000 && ts <= horizon;
    });
  }, [isLeagueAdmin, leagueActivityTimelineItems]);
  const leaguePendingReviewHeadline = useMemo(() => {
    if (!isLeagueAdmin) return null;
    const pending = tasks.filter((row) => row.approvalStatus === 'PENDING_APPROVAL');
    if (pending.length === 0) return null;
    const nearest = [...pending]
      .map((row) => ({
        id: row.id,
        title: triField(row as unknown as Record<string, unknown>, 'title', locale) || t('quickEntry'),
        dueAt: row.endAt ?? row.dueAt ?? row.startAt ?? null,
      }))
      .sort((a, b) => {
        const da = parseDateValue(a.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const db = parseDateValue(b.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      })[0];
    return {
      total: pending.length,
      nearest,
    };
  }, [isLeagueAdmin, locale, t, tasks]);
  const recommendationReasonLabel = (code: string): string | null => {
    switch (code) {
      case 'overdue':
        return t('studentHome.recommendations.reasons.overdue');
      case 'due_6h':
        return t('studentHome.recommendations.reasons.due6h');
      case 'due_24h':
        return t('studentHome.recommendations.reasons.due24h');
      case 'due_72h':
        return t('studentHome.recommendations.reasons.due72h');
      case 'in_progress':
        return t('studentHome.recommendations.reasons.inProgress');
      case 'todo':
        return t('studentHome.recommendations.reasons.todo');
      case 'blocked':
        return t('studentHome.recommendations.reasons.blocked');
      case 'not_done':
        return t('studentHome.recommendations.reasons.notDone');
      case 'done':
        return t('studentHome.recommendations.reasons.done');
      case 'no_deadline':
        return t('studentHome.recommendations.reasons.noDeadline');
      default:
        return null;
    }
  };
  const taskStatusLabel = (status?: string) => {
    if (status === 'DONE') return t('leagueBoard.status.done');
    if (status === 'IN_PROGRESS') return t('leagueBoard.status.inProgress');
    if (status === 'BLOCKED') return t('leagueBoard.status.blocked');
    return t('leagueBoard.status.todo');
  };
  const taskStatusBadgeClass = (status?: string) => {
    if (status === 'DONE') return 'badge badge-green';
    if (status === 'IN_PROGRESS') return 'badge badge-blue';
    if (status === 'BLOCKED') return 'badge badge-red';
    return 'badge badge-yellow';
  };
  const leagueRecentFilterLabel = (filter: LeagueRecentFilter) => {
    if (filter === 'PENDING') return t('leagueBoard.filters.pending');
    if (filter === 'IN_PROGRESS') return t('leagueBoard.filters.inProgress');
    if (filter === 'DONE') return t('leagueBoard.filters.done');
    return t('leagueBoard.filters.all');
  };
  const orgWindowLabel = (hours: OrgDeadlineWindow) => {
    if (hours === 24) return t('orgModule.windows.h24');
    if (hours === 48) return t('orgModule.windows.h48');
    return t('orgModule.windows.h72');
  };
  const orgTaskStats = useMemo(() => {
    if (!isOrgAdmin) {
      return { total: 0, done: 0, inProgress: 0, todo: 0, upcomingDeadline: 0, completionRate: 0 };
    }
    const now = Date.now();
    const horizon = now + orgDeadlineWindow * 60 * 60 * 1000;
    const done = orgScopedTasks.filter((task) => task.status === 'DONE').length;
    const inProgress = orgScopedTasks.filter((task) => task.status === 'IN_PROGRESS').length;
    const todo = orgScopedTasks.filter((task) => task.status === 'TODO' || task.status === 'BLOCKED').length;
    const upcomingDeadline = orgScopedTasks.filter((task) => {
      if (task.status === 'DONE') return false;
      const d = parseDateValue(task.endAt ?? task.dueAt ?? null);
      if (!d) return false;
      const ts = d.getTime();
      return ts >= now && ts <= horizon;
    }).length;
    const completionRate = orgScopedTasks.length > 0 ? Math.round((done / orgScopedTasks.length) * 100) : 0;
    return {
      total: orgScopedTasks.length,
      done,
      inProgress,
      todo,
      upcomingDeadline,
      completionRate,
    };
  }, [isOrgAdmin, orgDeadlineWindow, orgScopedTasks]);
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
  const timelineMarks = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '23:00'];
  const activityStripRows = (rows: TimelineVizItem[]) => {
    if (rows.length === 0) return [];
    const now = new Date();
    const dayStart = toDayBoundary(now, 6, 0);
    const dayEnd = toDayBoundary(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), 23, 0);
    const totalMinutes = Math.max(1, (dayEnd.getTime() - dayStart.getTime()) / (60 * 1000));
    return rows.map((row) => {
      const parsedStart = parseDateValue(row.startAt ?? row.endAt);
      const parsedEnd = parseDateValue(row.endAt ?? row.startAt);
      const start = parsedStart ?? parsedEnd ?? dayStart;
      const end = parsedEnd ?? parsedStart ?? start;
      const leftPct = ((clampNumber(start.getTime(), dayStart.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60_000 / totalMinutes) * 100;
      const widthPct = (Math.max(end.getTime() - start.getTime(), 2 * 60 * 60 * 1000) / 60_000 / totalMinutes) * 100;
      return {
        ...row,
        leftPct: clampNumber(leftPct, 0, 100),
        widthPct: clampNumber(widthPct, 4, 100),
      };
    });
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
        {studentDataErr && isStudent ? (
          <p className="dashboard-state-note">{t('studentHome.partialLoad')}: {studentDataErr}</p>
        ) : null}
        {isLeagueAdmin ? (
          <div className="dashboard-league-board">
            <div className="dashboard-section-header">
              <div>
                <h2 style={{ marginBottom: 4 }}>{t('leagueBoard.title')}</h2>
                <p className="topbar-muted" style={{ margin: 0 }}>
                  {t('leagueBoard.hint')}
                </p>
              </div>
            </div>

            <div className="dashboard-stats-grid">
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('leagueBoard.cards.totalTasks')}</div>
                <strong className="dashboard-stat-value">{metrics.total}</strong>
              </div>
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('leagueBoard.cards.approved')}</div>
                <strong className="dashboard-stat-value">{metrics.approved}</strong>
              </div>
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('leagueBoard.cards.pending')}</div>
                <strong className="dashboard-stat-value">{metrics.pendingApproval}</strong>
              </div>
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('leagueBoard.cards.rejected')}</div>
                <strong className="dashboard-stat-value">{metrics.rejected}</strong>
              </div>
            </div>

            <div className="dashboard-league-grid">
              <div className="dashboard-league-card">
                <h3 className="dashboard-viz-title">活动时间可视化（简版）</h3>
                <p className="topbar-muted dashboard-viz-subtitle">未来 14 天全局活动安排时间带（无课表）</p>
                {leaguePendingReviewHeadline ? (
                  <div className="dashboard-viz-alert">
                    待审核活动 {leaguePendingReviewHeadline.total} 条，最近截止：
                    <strong style={{ marginLeft: 4 }}>{leaguePendingReviewHeadline.nearest.title}</strong>
                    <span style={{ marginLeft: 6 }}>
                      {formatDateTimeShort(leaguePendingReviewHeadline.nearest.dueAt)}
                    </span>
                  </div>
                ) : null}
                {leagueUpcomingActivityItems.length === 0 ? (
                  <p className="topbar-muted">未来 14 天暂无可展示的活动安排</p>
                ) : (
                  <div className="dashboard-activity-strip">
                    <div className="dashboard-activity-strip-track" />
                    {activityStripRows(leagueUpcomingActivityItems.slice(0, 6)).map((row) => (
                      <div key={row.id} className="dashboard-activity-strip-row">
                        <div className="dashboard-activity-strip-meta">
                          <strong>{row.title}</strong>
                          <span className="topbar-muted">{formatDateTimeShort(row.startAt)}</span>
                        </div>
                        <div
                          className="dashboard-activity-strip-fill dashboard-activity-strip-fill-league"
                          style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="dashboard-league-card">
                <h3 className="dashboard-viz-title">{t('leagueBoard.orgList.title')}</h3>
                <p className="topbar-muted dashboard-viz-subtitle">{t('leagueBoard.orgList.hint')}</p>
                {orgTaskRanking.length === 0 ? (
                  <p className="topbar-muted">{t('leagueBoard.orgList.empty')}</p>
                ) : (
                  <ul className="dashboard-simple-list">
                    {orgTaskRanking.map((row) => (
                      <li key={row.name} className="dashboard-simple-item">
                        <span>{row.name}</span>
                        <strong>{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="dashboard-league-card">
                <h3 className="dashboard-viz-title">{t('leagueBoard.recent.title')}</h3>
                <p className="topbar-muted dashboard-viz-subtitle">{t('leagueBoard.recent.hint')}</p>
                <div className="dashboard-chip-group" style={{ marginBottom: 8 }}>
                  {LEAGUE_RECENT_FILTERS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLeagueRecentFilter(key)}
                      className={`dashboard-chip ${leagueRecentFilter === key ? 'dashboard-chip-active' : ''}`}
                    >
                      {leagueRecentFilterLabel(key)}
                    </button>
                  ))}
                </div>
                {filteredLeagueRecentTasks.length === 0 ? (
                  <p className="topbar-muted">{t('leagueBoard.recent.empty')}</p>
                ) : (
                  <ul className="dashboard-simple-list">
                    {filteredLeagueRecentTasks.map((row) => (
                      <li key={row.id} className="dashboard-simple-item">
                        <div>
                          <div>{row.title}</div>
                          <div className="topbar-muted" style={{ fontSize: 12 }}>
                            {formatDateTimeShort(row.createdAt)}
                          </div>
                        </div>
                        <strong>{taskStatusLabel(row.status)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="dashboard-league-card">
                <h3 className="dashboard-viz-title">{t('leagueBoard.pendingReview.title')}</h3>
                <p className="topbar-muted dashboard-viz-subtitle">{t('leagueBoard.pendingReview.hint')}</p>
                {leaguePendingReviewTasks.length === 0 ? (
                  <p className="topbar-muted">{t('leagueBoard.pendingReview.empty')}</p>
                ) : (
                  <ul className="dashboard-simple-list">
                    {leaguePendingReviewTasks.map((row) => (
                      <li key={row.id} className="dashboard-simple-item">
                        <div>
                          <div>{row.title}</div>
                          <div className="topbar-muted" style={{ fontSize: 12 }}>
                            {t('common.due')}: {formatDateTimeShort(row.dueAt)}
                          </div>
                        </div>
                        <strong>{t('leagueBoard.pendingReview.badge')}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {isStudent ? (
          <div className="dashboard-student-grid">
            <div className="dashboard-student-card" style={{ gridColumn: '1 / -1' }}>
              <div className="dashboard-section-header">
                <div>
                  <div className="dashboard-student-card-title" style={{ marginBottom: 4 }}>
                    课表 + 任务 + 活动合并时间可视化
                  </div>
                  <p className="topbar-muted" style={{ margin: 0, fontSize: 12 }}>
                    与统一时间轴同步范围：{studentTimelineRange}
                  </p>
                </div>
                <div className="dashboard-chip-group">
                  {([
                    ['DAY', '日'],
                    ['WEEK', '周'],
                    ['MONTH', '月'],
                  ] as Array<[StudentTimelineRange, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStudentTimelineRange(key)}
                      className={`dashboard-chip ${studentTimelineRange === key ? 'dashboard-chip-active' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                  {([
                    ['ALL', '全部'],
                    ['COURSE', '课程'],
                    ['TASK', '任务'],
                    ['ACTIVITY', '活动'],
                  ] as Array<[StudentTimelineFilter, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStudentTimelineFilter(key)}
                      className={`dashboard-chip ${studentTimelineFilter === key ? 'dashboard-chip-active' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredStudentTimelineItems.length === 0 ? (
                <p className="topbar-muted">当前筛选下暂无时间条目</p>
              ) : (
                <div className="dashboard-student-viz-layout">
                  {studentTimelineRange === 'DAY' ? (
                    <div className="dashboard-hour-strip">
                      <div className="dashboard-hour-track">
                        {timelineMarks.map((mark) => (
                          <span key={mark} className="dashboard-hour-mark">
                            {mark}
                          </span>
                        ))}
                      </div>
                      <div className="dashboard-hour-events">
                        {studentTimelineAxisRows.length === 0 ? (
                          <p className="topbar-muted" style={{ margin: 0 }}>
                            今日未命中可视化时间段
                          </p>
                        ) : (
                          studentTimelineAxisRows.map((row) => (
                            <div key={row.id} className="dashboard-hour-event-row">
                              <div className="dashboard-hour-event-title">
                                <span>{row.title}</span>
                                <span className="topbar-muted">
                                  {formatHourMinuteLabel(row.startAt)}-{formatHourMinuteLabel(row.endAt)}
                                </span>
                              </div>
                              <div className="dashboard-hour-event-track">
                                <div
                                  className={`dashboard-hour-event-fill ${
                                    row.type === 'COURSE' ? 'dashboard-hour-event-course' : 'dashboard-hour-event-task'
                                  }`}
                                  style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }}
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="dashboard-hour-strip">
                      {studentTimelineRange === 'WEEK' ? (
                        <div className="timeline-table-wrap">
                          <table className="timeline-table">
                            <thead>
                              <tr>
                                {studentWeekDays.map((cell) => (
                                  <th key={cell.key}>
                                    {cell.day.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' })}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {studentWeekDays.map((cell) => (
                                  <td key={`rows-${cell.key}`}>
                                    <div className="timeline-cell-stack">
                                      {cell.items.length === 0 ? (
                                        <span className="topbar-muted">—</span>
                                      ) : (
                                        cell.items.map((row) => (
                                          <div
                                            key={row.id}
                                            className={`timeline-event-chip ${
                                              row.type === 'COURSE'
                                                ? 'timeline-chip-course'
                                                : row.type === 'ACTIVITY'
                                                  ? 'timeline-chip-activity'
                                                  : 'timeline-chip-task'
                                            }`}
                                          >
                                            {formatHourMinuteLabel(row.startAt)} {row.title}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="timeline-table-wrap">
                          <table className="timeline-table">
                            <tbody>
                              {Array.from({ length: Math.ceil(studentMonthCells.length / 7) }, (_, rowIdx) => (
                                <tr key={`m-${rowIdx}`}>
                                  {studentMonthCells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, idx) => (
                                    <td key={`c-${rowIdx}-${idx}`} className={cell.day ? 'timeline-month-cell' : 'timeline-month-empty'}>
                                      {cell.day ? (
                                        <>
                                          <div className="timeline-month-day">{cell.day.getDate()}</div>
                                          <div className="timeline-cell-stack">
                                            {cell.items.length === 0 ? (
                                              <span className="topbar-muted">—</span>
                                            ) : (
                                              cell.items.map((row) => (
                                                <div
                                                  key={row.id}
                                                  className={`timeline-event-chip ${
                                                    row.type === 'COURSE'
                                                      ? 'timeline-chip-course'
                                                      : row.type === 'ACTIVITY'
                                                        ? 'timeline-chip-activity'
                                                        : 'timeline-chip-task'
                                                  }`}
                                                >
                                                  {formatHourMinuteLabel(row.startAt)} {row.title}
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        </>
                                      ) : null}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                  <ul className="dashboard-student-list">
                    {filteredStudentTimelineItems.slice(0, 6).map((row) => (
                      <li key={row.id} className="dashboard-student-item">
                        <div>
                          <strong>{row.title}</strong>
                          <div className="topbar-muted" style={{ marginTop: 3, fontSize: 12 }}>
                            {row.source} · {formatDateTimeShort(row.startAt)} - {formatDateTimeShort(row.endAt)}
                          </div>
                        </div>
                        <span
                          className={
                            row.type === 'COURSE'
                              ? 'badge badge-green'
                              : row.type === 'ACTIVITY'
                                ? 'badge badge-yellow'
                                : 'badge badge-blue'
                          }
                        >
                          {row.type === 'COURSE' ? '课程' : row.type === 'ACTIVITY' ? '活动' : '任务'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="dashboard-student-card">
              <div className="dashboard-student-card-title">{t('studentHome.courses.title')}</div>
              {todayCourses.length === 0 ? (
                <p className="topbar-muted">{t('studentHome.courses.empty')}</p>
              ) : (
                <ul className="dashboard-student-list">
                  {todayCourses.map((row, idx) => (
                    <li key={`${row.id}-${idx}`} className="dashboard-student-item">
                      <div>
                        <strong>
                          {triField(row as unknown as Record<string, unknown>, 'course', locale) || t('title')}
                        </strong>
                        <div className="topbar-muted" style={{ marginTop: 3, fontSize: 12 }}>
                          {triField(row as unknown as Record<string, unknown>, 'location', locale) || '—'}
                        </div>
                      </div>
                      <span className="dashboard-student-time">{`${row.startTime ?? '--:--'}-${row.endTime ?? '--:--'}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dashboard-student-card">
              <div className="dashboard-student-card-title">
                {t('studentHome.recommendations.title')} · 已优化
              </div>
              {todayTaskCards.length === 0 ? (
                <p className="topbar-muted">{t('studentHome.recommendations.empty')}</p>
              ) : (
                <ul className="dashboard-student-list">
                  {todayTaskCards.map((row) => (
                    <li key={row.id} className="dashboard-student-item dashboard-student-item-compact">
                      <div style={{ minWidth: 0 }}>
                        <strong>
                          {row.order ? `${t('studentHome.recommendations.order', { order: row.order })} · ` : ''}
                          {row.title}
                        </strong>
                      </div>
                      <span
                        className={`dashboard-priority-pill dashboard-priority-${row.priority.toLowerCase()}`}
                      >
                        {t(`studentHome.tasks.priority.${row.priority.toLowerCase()}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dashboard-student-card dashboard-student-card-ai">
              <div className="dashboard-ai-title-row">
                <div className="dashboard-student-card-title" style={{ marginBottom: 0 }}>
                  {t('studentHome.ai.title')} · 已优化
                </div>
                <span className="dashboard-ai-badge">AI</span>
              </div>
              <p className="topbar-muted dashboard-ai-hint">{t('studentHome.ai.hint')}</p>
              {aiSuggestions.length === 0 ? (
                <p className="topbar-muted">{t('studentHome.ai.empty')}</p>
              ) : (
                <ul className="dashboard-student-list">
                  {aiSuggestions.map((row, idx) => (
                    <li key={`${idx}-${row}`} className="dashboard-student-item dashboard-ai-item">
                      <span className="dashboard-ai-index">{idx + 1}</span>
                      <span className="dashboard-ai-text">{row}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dashboard-student-card dashboard-student-card-alert">
              <div className="dashboard-student-card-title">{t('studentHome.deadlines.title')}</div>
              {studentDeadlines.length === 0 ? (
                <p className="topbar-muted">{t('studentHome.deadlines.empty')}</p>
              ) : (
                <ul className="dashboard-student-list">
                  {studentDeadlines.map((row) => (
                    <li key={row.id} className="dashboard-student-item">
                      <div>
                        <strong>{row.title}</strong>
                        <div className="topbar-muted" style={{ marginTop: 3, fontSize: 12 }}>
                          {row.type === 'plan'
                            ? t('studentHome.deadlines.plan')
                            : t('studentHome.deadlines.task')}
                        </div>
                      </div>
                      <div className="dashboard-deadline-text">
                        {row.overdue
                          ? t('studentHome.deadlines.overdue')
                          : t('studentHome.deadlines.dueAt', { time: formatDateTimeShort(row.dueAt) })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {isOrgAdmin ? (
        <div className="page-section">
          <div className="card-soft">
            <div className="dashboard-section-header">
              <div>
                <h2 style={{ marginBottom: 4 }}>{t('orgModule.title')}</h2>
                <p className="topbar-muted" style={{ margin: 0 }}>
                  {t('orgModule.hint')}
                </p>
              </div>
              <div className="dashboard-chip-group">
                {ORG_DEADLINE_WINDOWS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => setOrgDeadlineWindow(hour)}
                    className={`dashboard-chip ${orgDeadlineWindow === hour ? 'dashboard-chip-active' : ''}`}
                  >
                    {orgWindowLabel(hour)}
                  </button>
                ))}
              </div>
            </div>
            <div className="dashboard-stats-grid">
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('orgModule.cards.total')}</div>
                <strong className="dashboard-stat-value">{orgTaskStats.total}</strong>
              </div>
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('orgModule.cards.done')}</div>
                <strong className="dashboard-stat-value">{orgTaskStats.done}</strong>
              </div>
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('orgModule.cards.inProgress')}</div>
                <strong className="dashboard-stat-value">{orgTaskStats.inProgress}</strong>
              </div>
              <div className="dashboard-stat-card">
                <div className="topbar-muted">{t('orgModule.cards.todo')}</div>
                <strong className="dashboard-stat-value">{orgTaskStats.todo}</strong>
              </div>
            </div>
            <div className="dashboard-org-progress">
              <div className="dashboard-org-progress-head">
                <strong>{t('orgModule.completionRate')}</strong>
                <strong>{orgTaskStats.completionRate}%</strong>
              </div>
              <div className="dashboard-viz-bar">
                <div
                  className="dashboard-viz-segment dashboard-viz-segment-green"
                  style={{ width: segmentPercent(orgTaskStats.done, Math.max(1, orgTaskStats.total)) }}
                />
                <div
                  className="dashboard-viz-segment dashboard-viz-segment-indigo"
                  style={{ width: segmentPercent(orgTaskStats.inProgress, Math.max(1, orgTaskStats.total)) }}
                />
                <div
                  className="dashboard-viz-segment dashboard-viz-segment-blue"
                  style={{ width: segmentPercent(orgTaskStats.todo, Math.max(1, orgTaskStats.total)) }}
                />
              </div>
            </div>
            <div className="dashboard-empty-card" style={{ marginTop: 12 }}>
              <strong>{t('orgModule.cards.upcomingDeadline')}</strong>
              <p className="topbar-muted" style={{ marginBottom: 0, marginTop: 6 }}>
                {t('orgModule.upcomingHint', { count: orgTaskStats.upcomingDeadline, hours: orgDeadlineWindow })}
              </p>
            </div>
            <div className="dashboard-empty-card" style={{ marginTop: 12 }}>
              <strong>活动时间可视化（简版）</strong>
              <p className="topbar-muted" style={{ marginTop: 6, marginBottom: 10 }}>
                未来 14 天活动安排时间带（无课表） · 7 天内 {orgActivitySummary.next7} 条
              </p>
              <div className="dashboard-org-kpis">
                <span className="badge badge-blue">7天内活动 {orgActivitySummary.next7}</span>
                <span className="badge badge-green">14天内活动 {orgActivitySummary.next14}</span>
                <span className="badge badge-yellow">待审核 {orgActivitySummary.pendingReview}</span>
              </div>
              {orgUpcomingActivityItems.length === 0 ? (
                <p className="topbar-muted" style={{ marginBottom: 0, marginTop: 6 }}>
                  暂无近期活动安排
                </p>
              ) : (
                <div
                  style={{
                    marginTop: 10,
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  }}
                >
                  {orgCalendarDays.map((day) => (
                    <div
                      key={day.key}
                      className="dashboard-viz-card"
                      style={{
                        padding: 10,
                        background:
                          day.items.length === 0
                            ? '#ffffff'
                            : day.items.some((item) => item.status === 'BLOCKED')
                              ? 'rgba(239, 68, 68, 0.08)'
                              : day.items.some((item) => item.status === 'IN_PROGRESS')
                                ? 'rgba(59, 130, 246, 0.10)'
                                : day.items.every((item) => item.status === 'DONE')
                                  ? 'rgba(16, 185, 129, 0.10)'
                                  : 'rgba(245, 158, 11, 0.10)',
                        borderColor:
                          day.items.length === 0
                            ? 'var(--border)'
                            : day.items.some((item) => item.status === 'BLOCKED')
                              ? 'rgba(239, 68, 68, 0.45)'
                              : day.items.some((item) => item.status === 'IN_PROGRESS')
                                ? 'rgba(59, 130, 246, 0.45)'
                                : day.items.every((item) => item.status === 'DONE')
                                  ? 'rgba(16, 185, 129, 0.45)'
                                  : 'rgba(245, 158, 11, 0.45)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong>{day.label}</strong>
                        <span className="topbar-muted" style={{ fontSize: 12 }}>
                          {day.weekday}
                        </span>
                      </div>
                      <div className="topbar-muted" style={{ marginTop: 4, fontSize: 12 }}>
                        当日活动 {day.items.length} 场
                        {day.overlapCount > 0 ? ` · 时间冲突 ${day.overlapCount} 处` : ''}
                      </div>
                      {day.items.length === 0 ? (
                        <div className="topbar-muted" style={{ marginTop: 8, fontSize: 12 }}>
                          暂无安排
                        </div>
                      ) : (
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          {day.items.slice(0, 4).map((item) => {
                            const startMinutes = item.start.getHours() * 60 + item.start.getMinutes();
                            const endMinutes = item.end.getHours() * 60 + item.end.getMinutes();
                            const leftPct = clampNumber(((startMinutes - 360) / (17 * 60)) * 100, 0, 100);
                            const widthPct = clampNumber((Math.max(endMinutes - startMinutes, 45) / (17 * 60)) * 100, 8, 100);
                            return (
                              <div key={item.id} style={{ display: 'grid', gap: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.title}
                                  </span>
                                  <span className={taskStatusBadgeClass(item.status)}>{taskStatusLabel(item.status)}</span>
                                </div>
                                <div className="topbar-muted" style={{ fontSize: 12 }}>
                                  {formatHourMinuteLabel(item.start.toISOString())}-{formatHourMinuteLabel(item.end.toISOString())}
                                </div>
                                <div style={{ position: 'relative', height: 6, background: 'rgba(148,163,184,.25)', borderRadius: 999 }}>
                                  <div
                                    style={{
                                      position: 'absolute',
                                      left: `${leftPct}%`,
                                      width: `${widthPct}%`,
                                      height: '100%',
                                      borderRadius: 999,
                                      background: 'linear-gradient(90deg,#14b8a6,#0ea5e9)',
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
