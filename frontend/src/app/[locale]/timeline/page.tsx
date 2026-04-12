'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

const TIMELINE_SYNC_KEY = 'studentTimelineSyncV1';

type Me = { id: string; role: string };
type TimelineRange = 'DAY' | 'WEEK' | 'MONTH';
type PlanStatus = 'TODO' | 'DONE';
type TimelineItemType = 'PLAN' | 'TASK' | 'COURSE' | 'ACTIVITY';
type TimelineSourceKind = 'SCHEDULE' | 'PLAN' | 'CAMPUS_TASK' | 'ORG_ACTIVITY';
type PlanRow = Record<string, unknown> & {
  id: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  noteZh?: string;
  noteEn?: string;
  noteRu?: string;
  startAt?: string;
  endAt?: string;
  dueAt?: string;
  status?: PlanStatus;
};
type ScheduleRow = Record<string, unknown> & { id: string; weekday?: number; startTime?: string; endTime?: string };
type TaskRow = Record<string, unknown> & {
  id: string;
  startAt?: string;
  endAt?: string;
  dueAt?: string;
  status?: string;
  source?: string;
};
type TimelineDisplayItem = {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  type: TimelineItemType;
  detail: string;
  sourceKind: TimelineSourceKind;
};

function toLocalDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function formatDateTime(value: unknown, locale = 'default') {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function toTimeMs(value: unknown) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime();
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

function combineDateTime(day: Date, hhmm?: string) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function ymd(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function TimelinePage() {
  const locale = useLocale();
  const t = useTranslations('timeline');
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<Me | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<TimelineRange>('WEEK');
  const [activeSources, setActiveSources] = useState<TimelineSourceKind[]>([
    'SCHEDULE',
    'PLAN',
    'CAMPUS_TASK',
    'ORG_ACTIVITY',
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [form, setForm] = useState(() => {
    const now = new Date();
    return {
      title: '',
      startAt: toLocalDateTimeValue(now),
      endAt: toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000)),
      note: '',
    };
  });

  const nowMin = useMemo(() => toLocalDateTimeValue(new Date()), []);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const [m, p, s, t] = await Promise.all([
        apiFetch<Me>('/users/me', { token }),
        apiFetch<PlanRow[]>('/plans/timeline', { token }),
        apiFetch<{ entries: ScheduleRow[] }>('/schedule', { token }),
        apiFetch<TaskRow[]>('/tasks', { token }),
      ]);
      setMe(m);
      setPlans(Array.isArray(p) ? p : []);
      setSchedule(Array.isArray(s.entries) ? s.entries : []);
      setTasks(Array.isArray(t) ? t : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('errors.load'));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(TIMELINE_SYNC_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { range?: TimelineRange };
      if (parsed.range && ['DAY', 'WEEK', 'MONTH'].includes(parsed.range)) {
        setRange(parsed.range);
      }
    } catch {
      // ignore malformed storage payload
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TIMELINE_SYNC_KEY, JSON.stringify({ range }));
  }, [range]);

  const windowStart = useMemo(() => {
    const now = new Date();
    if (range === 'DAY') return startOfDay(now);
    if (range === 'WEEK') return startOfWeekMonday(now);
    return startOfMonth(now);
  }, [range]);
  const windowEnd = useMemo(() => {
    if (range === 'DAY') return addDays(windowStart, 1);
    if (range === 'WEEK') return addDays(windowStart, 7);
    return new Date(windowStart.getFullYear(), windowStart.getMonth() + 1, 1, 0, 0, 0, 0);
  }, [range, windowStart]);

  const mergedTimeline = useMemo(() => {
    const rangeStart = windowStart.getTime();
    const rangeEnd = windowEnd.getTime();
    const planItems = plans
      .filter((row) => String(row.source ?? 'PERSONAL') === 'PERSONAL')
      .map((row) => ({
      id: `plan-${row.id}`,
      title: triField(row, 'title', locale) || t('labels.plan'),
      time: row.startAt ?? row.dueAt ?? row.endAt ?? null,
      type: 'PLAN',
      detail: triField(row, 'note', locale) || '',
      status: row.status || 'TODO',
    }));
    const taskItems = tasks.map((row) => ({
      id: `task-${row.id}`,
      title: triField(row, 'title', locale) || t('labels.task'),
      time: row.startAt ?? row.endAt ?? row.dueAt ?? null,
      type: 'TASK',
      detail: triField(row, 'desc', locale) || '',
      status: String(row.status ?? 'TODO'),
    }));
    const needle = q.trim().toLowerCase();
    return [...planItems, ...taskItems]
      .filter((row) => {
        const ts = toTimeMs(row.time);
        if (ts < rangeStart || ts > rangeEnd) return false;
        return !needle || JSON.stringify(row).toLowerCase().includes(needle);
      })
      .sort((a, b) => toTimeMs(a.time) - toTimeMs(b.time));
  }, [locale, plans, q, tasks, t, windowEnd, windowStart]);

  const timelineDisplayEvents = useMemo<TimelineDisplayItem[]>(() => {
    const startTs = windowStart.getTime();
    const endTs = windowEnd.getTime();
    const planEvents: TimelineDisplayItem[] = plans
      .filter((row) => String(row.source ?? 'PERSONAL') === 'PERSONAL')
      .map((row) => {
        const startValue = row.startAt ?? row.dueAt ?? row.endAt;
        const start = startValue ? new Date(String(startValue)) : null;
        const end = row.endAt ? new Date(String(row.endAt)) : null;
        if (!start || Number.isNaN(start.getTime())) return null;
        return {
          id: `plan-${row.id}`,
          title: triField(row, 'title', locale) || t('labels.plan'),
          start,
          end: end && !Number.isNaN(end.getTime()) ? end : null,
          type: 'PLAN',
          detail: triField(row, 'note', locale) || '',
          sourceKind: 'PLAN',
        };
      })
      .filter((row): row is TimelineDisplayItem => Boolean(row));

    const taskEvents: TimelineDisplayItem[] = tasks
      .filter((row) => row.status !== 'DONE')
      .map((row) => {
        const startValue = row.startAt ?? row.endAt ?? row.dueAt;
        const start = startValue ? new Date(String(startValue)) : null;
        const end = row.endAt ? new Date(String(row.endAt)) : null;
        if (!start || Number.isNaN(start.getTime())) return null;
        const isActivity = row.source === 'ORG_REQUEST';
        return {
          id: `task-${row.id}`,
          title:
            `${isActivity ? `${t('labels.activity')} · ` : ''}${
              triField(row, 'title', locale) || t('labels.task')
            }`,
          start,
          end: end && !Number.isNaN(end.getTime()) ? end : null,
          type: isActivity ? 'ACTIVITY' : 'TASK',
          detail: triField(row, 'desc', locale) || '',
          sourceKind: isActivity ? 'ORG_ACTIVITY' : 'CAMPUS_TASK',
        };
      })
      .filter((row): row is TimelineDisplayItem => Boolean(row));

    const scheduleEvents: TimelineDisplayItem[] = [];
    for (const row of schedule) {
      const weekday = Number(row.weekday ?? 0);
      if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) continue;
      for (let d = new Date(windowStart); d < windowEnd; d = addDays(d, 1)) {
        const wd = d.getDay() === 0 ? 7 : d.getDay();
        if (wd !== weekday) continue;
        const start = combineDateTime(d, row.startTime);
        if (!start) continue;
        const end = combineDateTime(d, row.endTime);
        scheduleEvents.push({
          id: `schedule-${row.id}-${ymd(d)}`,
          title: triField(row, 'course', locale) || t('scheduleSection.title'),
          start,
          end,
          type: 'COURSE',
          detail: triField(row, 'location', locale) || '',
          sourceKind: 'SCHEDULE',
        });
      }
    }

    return [...planEvents, ...taskEvents, ...scheduleEvents]
      .filter((row) => {
        const ts = row.start.getTime();
        if (ts < startTs || ts >= endTs) return false;
        return true;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [locale, plans, schedule, t, tasks, windowEnd, windowStart]);

  const filteredTimelineEvents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return timelineDisplayEvents.filter((row) => {
      if (!activeSources.includes(row.sourceKind)) return false;
      if (!needle) return true;
      return JSON.stringify(row).toLowerCase().includes(needle);
    });
  }, [activeSources, q, timelineDisplayEvents]);

  const scopedPlans = useMemo(
    () => mergedTimeline.filter((row) => row.type === 'PLAN').slice(0, 20),
    [mergedTimeline],
  );
  const dayHours = useMemo(() => Array.from({ length: 24 }, (_, idx) => idx), []);
  const weekHours = useMemo(() => Array.from({ length: 16 }, (_, idx) => idx + 6), []);
  const weekdayHeaders = useMemo(() => {
    if (locale.startsWith('zh')) return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    if (locale.startsWith('ru')) return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }, [locale]);
  const dayEventsByHour = useMemo(() => {
    const map = new Map<number, TimelineDisplayItem[]>();
    for (const event of filteredTimelineEvents) {
      const hour = event.start.getHours();
      const rows = map.get(hour) ?? [];
      rows.push(event);
      map.set(hour, rows);
    }
    return map;
  }, [filteredTimelineEvents]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, idx) => addDays(windowStart, idx)), [windowStart]);
  const weekEventsByCell = useMemo(() => {
    const map = new Map<string, TimelineDisplayItem[]>();
    for (const event of filteredTimelineEvents) {
      const weekdayIdx = (event.start.getDay() + 6) % 7;
      const hour = event.start.getHours();
      const key = `${weekdayIdx}-${hour}`;
      const rows = map.get(key) ?? [];
      rows.push(event);
      map.set(key, rows);
    }
    return map;
  }, [filteredTimelineEvents]);
  const monthMeta = useMemo(() => {
    const year = windowStart.getFullYear();
    const month = windowStart.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const cells: Array<Date | null> = [];
    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return { cells, days };
  }, [windowStart]);
  const monthEventsByDate = useMemo(() => {
    const map = new Map<string, TimelineDisplayItem[]>();
    for (const event of filteredTimelineEvents) {
      const key = ymd(event.start);
      const rows = map.get(key) ?? [];
      rows.push(event);
      map.set(key, rows);
    }
    return map;
  }, [filteredTimelineEvents]);
  const sourceStats = useMemo(() => {
    const countBy = (kind: TimelineSourceKind) =>
      timelineDisplayEvents.filter((row) => row.sourceKind === kind).length;
    return {
      schedule: countBy('SCHEDULE'),
      plan: countBy('PLAN'),
      campusTask: countBy('CAMPUS_TASK'),
      orgActivity: countBy('ORG_ACTIVITY'),
    };
  }, [timelineDisplayEvents]);
  const upcomingHighlights = useMemo(() => {
    const now = Date.now();
    const horizon = now + 48 * 60 * 60 * 1000;
    return filteredTimelineEvents
      .filter((row) => {
        const ts = row.start.getTime();
        return ts >= now && ts <= horizon;
      })
      .slice(0, 8);
  }, [filteredTimelineEvents]);
  const sourceChipLabel = useCallback(
    (kind: TimelineSourceKind) => {
      if (kind === 'SCHEDULE') return t('sources.schedule');
      if (kind === 'PLAN') return t('sources.plan');
      if (kind === 'CAMPUS_TASK') return t('sources.campusTask');
      return t('sources.orgActivity');
    },
    [t],
  );
  const toggleSource = useCallback((kind: TimelineSourceKind) => {
    setActiveSources((prev) => {
      if (prev.includes(kind)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== kind);
      }
      return [...prev, kind];
    });
  }, []);

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.title.trim()) {
      setErr(t('errors.titleRequired'));
      return;
    }
    if (!confirmAction(t('confirm.create'))) return;
    try {
      await apiFetch('/plans', {
        method: 'POST',
        token,
        body: JSON.stringify({
          titleZh: form.title.trim(),
          titleEn: form.title.trim(),
          titleRu: form.title.trim(),
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          dueAt: new Date(form.endAt).toISOString(),
          noteZh: form.note.trim(),
          noteEn: form.note.trim(),
          noteRu: form.note.trim(),
          status: 'TODO',
          syncedToTimeline: true,
        }),
      });
      const now = new Date();
      setForm({
        title: '',
        startAt: toLocalDateTimeValue(now),
        endAt: toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000)),
        note: '',
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('errors.create'));
    }
  }

  async function savePlanEdit() {
    if (!token || !editing) return;
    if (!confirmAction(t('confirm.save'))) return;
    try {
      await apiFetch(`/plans/${editing.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          titleZh: triField(editing, 'title', locale),
          titleEn: triField(editing, 'title', locale),
          titleRu: triField(editing, 'title', locale),
          startAt: editing.startAt,
          endAt: editing.endAt,
          dueAt: editing.endAt,
          noteZh: triField(editing, 'note', locale),
          noteEn: triField(editing, 'note', locale),
          noteRu: triField(editing, 'note', locale),
          status: editing.status || 'TODO',
          syncedToTimeline: true,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('errors.save'));
    }
  }

  async function removePlan(id: string) {
    if (!token) return;
    if (!confirmAction(t('confirm.remove'))) return;
    try {
      await apiFetch(`/plans/${id}`, { method: 'DELETE', token });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('errors.remove'));
    }
  }

  async function togglePlanStatus(plan: PlanRow) {
    if (!token) return;
    const status = plan.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      await apiFetch(`/plans/${plan.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('errors.status'));
    }
  }

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">{t('loadingAuth')}</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">{t('title')}</h1>
        <p className="page-subtitle">
          {t('subtitle')}
        </p>
        {err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null}

        <div className="card-soft" style={{ display: 'grid', gap: 10 }}>
          <div className="dashboard-stats-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{t('sources.schedule')}</div>
              <strong className="dashboard-stat-value">{sourceStats.schedule}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{t('sources.plan')}</div>
              <strong className="dashboard-stat-value">{sourceStats.plan}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{t('sources.campusTask')}</div>
              <strong className="dashboard-stat-value">{sourceStats.campusTask}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{t('sources.orgActivity')}</div>
              <strong className="dashboard-stat-value">{sourceStats.orgActivity}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              ['DAY', t('range.day')],
              ['WEEK', t('range.week')],
              ['MONTH', t('range.month')],
            ] as Array<[TimelineRange, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`dashboard-chip ${range === key ? 'dashboard-chip-active' : ''}`}
                onClick={() => setRange(key)}
              >
                {t('range.view', { label })}
              </button>
            ))}
            <input
              placeholder={t('searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 280, marginLeft: 'auto' }}
            />
            <button type="button" onClick={load}>{t('actions.refresh')}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['SCHEDULE', 'PLAN', 'CAMPUS_TASK', 'ORG_ACTIVITY'] as TimelineSourceKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`dashboard-chip ${activeSources.includes(kind) ? 'dashboard-chip-active' : ''}`}
                onClick={() => toggleSource(kind)}
              >
                {sourceChipLabel(kind)}
              </button>
            ))}
          </div>
          {filteredTimelineEvents.length === 0 ? (
            <div className="topbar-muted">{t('empty.range')}</div>
          ) : null}
          {upcomingHighlights.length > 0 ? (
            <div className="dashboard-empty-card" style={{ marginTop: 0 }}>
              <strong>{t('upcoming')}</strong>
              <ul className="list-clean" style={{ marginTop: 6 }}>
                {upcomingHighlights.map((row) => (
                  <li key={`upcoming-${row.id}`} className="list-item" style={{ paddingTop: 6, paddingBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span>{row.title}</span>
                      <span className="topbar-muted" style={{ fontSize: 12 }}>
                        {sourceChipLabel(row.sourceKind)}
                      </span>
                    </div>
                    <div className="topbar-muted" style={{ fontSize: 12 }}>
                      {formatDateTime(row.start, locale)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="timeline-table-wrap">
            {range === 'DAY' ? (
              <table className="timeline-table">
                <thead>
                  <tr>
                    <th>{t('range.day')}</th>
                    {dayHours.map((hour) => (
                      <th key={hour}>{String(hour).padStart(2, '0')}:00</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{windowStart.toLocaleDateString(locale)}</td>
                    {dayHours.map((hour) => {
                      const rows = dayEventsByHour.get(hour) ?? [];
                      return (
                        <td key={hour}>
                          <div className="timeline-cell-stack">
                            {rows.slice(0, 3).map((row) => (
                              <div key={row.id} className={`timeline-event-chip timeline-chip-${row.type.toLowerCase()}`}>
                                {String(row.start.getHours()).padStart(2, '0')}:{String(row.start.getMinutes()).padStart(2, '0')} {row.title}
                              </div>
                            ))}
                            {rows.length > 3 ? <div className="topbar-muted">+{rows.length - 3}</div> : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            ) : null}

            {range === 'WEEK' ? (
              <table className="timeline-table">
                <thead>
                  <tr>
                    <th>{t('range.week')}</th>
                    {weekdayHeaders.map((day, idx) => (
                      <th key={day}>
                        {day}
                        <div className="topbar-muted" style={{ fontSize: 11 }}>
                          {weekDates[idx].toLocaleDateString(locale)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekHours.map((hour) => (
                    <tr key={hour}>
                      <td>{String(hour).padStart(2, '0')}:00</td>
                      {weekdayHeaders.map((_, weekdayIdx) => {
                        const rows = weekEventsByCell.get(`${weekdayIdx}-${hour}`) ?? [];
                        return (
                          <td key={`${weekdayIdx}-${hour}`}>
                            <div className="timeline-cell-stack">
                              {rows.slice(0, 2).map((row) => (
                                <div key={row.id} className={`timeline-event-chip timeline-chip-${row.type.toLowerCase()}`}>
                                  {String(row.start.getHours()).padStart(2, '0')}:{String(row.start.getMinutes()).padStart(2, '0')} {row.title}
                                </div>
                              ))}
                              {rows.length > 2 ? <div className="topbar-muted">+{rows.length - 2}</div> : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {range === 'MONTH' ? (
              <table className="timeline-table">
                <thead>
                  <tr>
                    {weekdayHeaders.map((day) => (
                      <th key={day}>{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(monthMeta.cells.length / 7) }, (_, rowIdx) => (
                    <tr key={rowIdx}>
                      {monthMeta.cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, colIdx) => {
                        if (!cell) {
                          return <td key={`empty-${rowIdx}-${colIdx}`} className="timeline-month-empty" />;
                        }
                        const rows = monthEventsByDate.get(ymd(cell)) ?? [];
                        return (
                          <td key={ymd(cell)} className="timeline-month-cell">
                            <div className="timeline-month-day">{cell.getDate()}</div>
                            <div className="timeline-cell-stack">
                              {rows.slice(0, 3).map((row) => (
                                <div key={row.id} className={`timeline-event-chip timeline-chip-${row.type.toLowerCase()}`}>
                                  {String(row.start.getHours()).padStart(2, '0')}:{String(row.start.getMinutes()).padStart(2, '0')} {row.title}
                                </div>
                              ))}
                              {rows.length > 3 ? <div className="topbar-muted">+{rows.length - 3}</div> : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>

        <div className="page-section" style={{ marginTop: 16 }}>
          <div className="card-soft">
            <h3 style={{ marginBottom: 12 }}>{t('create.title')}</h3>
            <form onSubmit={addPlan} style={{ display: 'grid', gap: 10, maxWidth: 680 }}>
              <input
                placeholder={t('create.name')}
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                required
              />
              <input
                placeholder={t('create.note')}
                value={form.note}
                onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
              />
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">{t('create.startAt')}</span>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  min={nowMin}
                  onChange={(e) => setForm((s) => ({ ...s, startAt: e.target.value }))}
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">{t('create.endAt')}</span>
                <input
                  type="datetime-local"
                  value={form.endAt}
                  min={form.startAt || nowMin}
                  onChange={(e) => setForm((s) => ({ ...s, endAt: e.target.value }))}
                  required
                />
              </label>
              <button type="submit">{t('actions.create')}</button>
            </form>
          </div>
        </div>

        <div className="page-section">
          <div className="card-soft">
            <h3 style={{ marginBottom: 12 }}>{t('manage.title')}</h3>
            <ul className="list-clean">
              {scopedPlans.length === 0 ? (
                <li className="list-item topbar-muted">{t('empty.plans')}</li>
              ) : (
                scopedPlans.map((row) => {
                  const id = row.id.replace('plan-', '');
                  const plan = plans.find((p) => p.id === id);
                  if (!plan) return null;
                  return (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <strong>{triField(plan, 'title', locale)}</strong>
                        <span className={`badge ${plan.status === 'DONE' ? 'badge-green' : 'badge-yellow'}`}>
                          {plan.status === 'DONE' ? t('status.done') : t('status.todo')}
                        </span>
                      </div>
                      <div className="topbar-muted" style={{ marginTop: 6 }}>
                        {formatDateTime(plan.startAt, locale)} - {formatDateTime(plan.endAt, locale)}
                      </div>
                      <div className="topbar-muted" style={{ marginTop: 4 }}>
                        {t('labels.note')}: {triField(plan, 'note', locale) || '—'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => togglePlanStatus(plan)}>
                          {plan.status === 'DONE' ? t('actions.markTodo') : t('actions.markDone')}
                        </button>
                        <button type="button" onClick={() => setEditing({ ...plan })}>{t('actions.edit')}</button>
                        <button type="button" className="logout-btn" onClick={() => removePlan(plan.id)}>{t('actions.delete')}</button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        {editing ? (
          <div className="page-section">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <h3 style={{ margin: 0 }}>{t('edit.title')}</h3>
              <input
                value={triField(editing, 'title', locale)}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, titleZh: e.target.value, titleEn: e.target.value, titleRu: e.target.value } : s))
                }
              />
              <input
                value={triField(editing, 'note', locale)}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, noteZh: e.target.value, noteEn: e.target.value, noteRu: e.target.value } : s))
                }
              />
              <input
                type="datetime-local"
                value={editing.startAt ? toLocalDateTimeValue(new Date(editing.startAt)) : ''}
                onChange={(e) => setEditing((s) => (s ? { ...s, startAt: new Date(e.target.value).toISOString() } : s))}
              />
              <input
                type="datetime-local"
                value={editing.endAt ? toLocalDateTimeValue(new Date(editing.endAt)) : ''}
                onChange={(e) => setEditing((s) => (s ? { ...s, endAt: new Date(e.target.value).toISOString() } : s))}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={savePlanEdit}>{t('actions.save')}</button>
                <button type="button" className="modal-close" onClick={() => setEditing(null)}>{t('actions.cancel')}</button>
              </div>
            </div>
          </div>
        ) : null}

        {me?.role === 'STUDENT' ? (
          <div className="page-section">
            <div className="card-soft">
              <h3 style={{ marginBottom: 12 }}>{t('scheduleSection.title')}</h3>
              {schedule.length === 0 ? (
                <div className="topbar-muted">{t('scheduleSection.empty')}</div>
              ) : (
                <ul className="list-clean">
                  {schedule.slice(0, 12).map((row) => (
                    <li key={row.id} className="list-item">
                      <strong>{triField(row, 'course', locale)}</strong>
                      <div className="topbar-muted" style={{ marginTop: 4 }}>
                        {t('scheduleSection.weekday', { day: String(row.weekday ?? '—') })} · {String(row.startTime ?? '--:--')} - {String(row.endTime ?? '--:--')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}