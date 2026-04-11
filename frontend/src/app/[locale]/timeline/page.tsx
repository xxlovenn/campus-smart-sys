'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

type Me = { id: string; role: string };
type TimelineRange = 'DAY' | 'WEEK' | 'MONTH';
type PlanStatus = 'TODO' | 'DONE';
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
type TaskRow = Record<string, unknown> & { id: string; startAt?: string; endAt?: string; dueAt?: string };

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

  const rangeStart = useMemo(() => {
    const now = new Date();
    if (range === 'DAY') {
      now.setHours(0, 0, 0, 0);
      return now.getTime();
    }
    if (range === 'WEEK') return now.getTime();
    return now.getTime();
  }, [range]);
  const rangeEnd = useMemo(() => {
    const now = new Date();
    if (range === 'DAY') {
      now.setHours(23, 59, 59, 999);
      return now.getTime();
    }
    if (range === 'WEEK') return now.getTime() + 7 * 24 * 60 * 60 * 1000;
    return now.getTime() + 30 * 24 * 60 * 60 * 1000;
  }, [range]);

  const mergedTimeline = useMemo(() => {
    const planItems = plans.map((row) => ({
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
  }, [locale, plans, q, rangeEnd, rangeStart, tasks]);

  const scopedPlans = useMemo(
    () => mergedTimeline.filter((row) => row.type === 'PLAN').slice(0, 20),
    [mergedTimeline],
  );

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
          <ul className="list-clean">
            {mergedTimeline.length === 0 ? (
              <li className="list-item topbar-muted">{t('empty.range')}</li>
            ) : (
              mergedTimeline.map((row) => (
                <li key={row.id} className="list-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <strong>{row.title}</strong>
                    <span className={`badge ${row.type === 'PLAN' ? 'badge-blue' : 'badge-green'}`}>
                      {row.type === 'PLAN' ? t('labels.plan') : t('labels.task')}
                    </span>
                  </div>
                  <div className="topbar-muted" style={{ marginTop: 6 }}>{formatDateTime(row.time, locale)}</div>
                  {row.detail ? <div className="topbar-muted" style={{ marginTop: 4 }}>{row.detail}</div> : null}
                </li>
              ))
            )}
          </ul>
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