'use client';

import { useLocale } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { confirmAction } from '@/lib/confirm';
import { triField } from '@/lib/tri';

type Me = {
  id: string;
  role: string;
  name?: string;
  email?: string;
};

function toLocalDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(
    date.getHours(),
  )}时${pad(date.getMinutes())}分`;
}

export default function TimelinePage() {
  const locale = useLocale();
  const token = getToken();

  const [me, setMe] = useState<Me | null>(null);
  const [plans, setPlans] = useState<unknown[]>([]);
  const [schedule, setSchedule] = useState<unknown[]>([]);
  const [upcoming, setUpcoming] = useState<{ plans: unknown[]; tasks: unknown[] } | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState(() => {
    const now = new Date();
    const start = toLocalDateTimeValue(now);
    const end = toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000));

    return {
      title: '',
      startAt: start,
      endAt: end,
      location: '',
    };
  });

  const nowMin = useMemo(() => toLocalDateTimeValue(new Date()), []);

  const pageMeta = useMemo(() => {
    if (me?.role === 'LEAGUE_ADMIN') {
      return {
        pageTitle: '日程表',
        pageSubtitle: '统一管理团委日程、事务安排与近期提醒',
        createTitle: '新建日程',
        createHint: '可录入任务或日程名称，并设置开始时间、结束时间与地点。',
        sectionPlans: '日程事项',
        sectionSchedule: '日程安排',
        sectionUpcoming: '近期事项',
        actionRefresh: '更新列表',
        actionSync: '导入日程安排',
        searchPlaceholder: '搜索任务、课程',
        emptyPlans: '暂无日程事项',
        emptySchedule: '暂无日程安排',
      };
    }

    if (me?.role === 'ORG_ADMIN') {
      return {
        pageTitle: '日程表',
        pageSubtitle: '统一管理组织安排、活动时间轴与近期提醒',
        createTitle: '新建安排',
        createHint: '可录入任务或课程名称，并设置开始时间、结束时间与地点。',
        sectionPlans: '组织安排',
        sectionSchedule: '课程 / 安排',
        sectionUpcoming: '近期事项',
        actionRefresh: '更新列表',
        actionSync: '导入课程安排',
        searchPlaceholder: '搜索任务、课程',
        emptyPlans: '暂无组织安排',
        emptySchedule: '暂无课程 / 安排',
      };
    }

    return {
      pageTitle: '个人计划',
      pageSubtitle: '统一管理个人计划、模拟课表与即将到期提醒',
      createTitle: '新建计划',
      createHint: '可录入任务或课程名称，并设置开始时间、结束时间与地点。',
      sectionPlans: '个人计划',
      sectionSchedule: '课程安排',
      sectionUpcoming: '即将到期（7天内）',
      actionRefresh: '更新列表',
      actionSync: '导入课程安排',
      searchPlaceholder: '搜索任务、课程',
      emptyPlans: '暂无计划',
      emptySchedule: '暂无课程数据',
    };
  }, [me?.role]);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);

    try {
      const [m, p, s, u] = await Promise.all([
        apiFetch<Me>('/users/me', { token }),
        apiFetch<unknown[]>('/plans/timeline', { token }),
        apiFetch<{ entries: unknown[] }>('/schedule', { token }),
        apiFetch<{ plans: unknown[]; tasks: unknown[] }>('/reminders/upcoming', { token }),
      ]);

      setMe(m);
      setPlans(Array.isArray(p) ? p : []);
      setSchedule(Array.isArray(s.entries) ? s.entries : []);
      setUpcoming(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!form.title.trim()) {
      setErr('请输入任务或课程名称');
      return;
    }

    if (new Date(form.startAt).getTime() < Date.now() - 60 * 1000) {
      setErr('开始时间不能早于当前时间');
      return;
    }

    if (new Date(form.endAt).getTime() < new Date(form.startAt).getTime()) {
      setErr('结束时间不能早于开始时间');
      return;
    }
    if (!confirmAction('确认创建该日程/计划吗？')) return;

    try {
      await apiFetch('/plans', {
        method: 'POST',
        token,
        body: JSON.stringify({
          titleZh: form.title,
          titleEn: form.title,
          titleRu: form.title,
          dueAt: new Date(form.endAt).toISOString(),
          syncedToTimeline: true,
          noteZh: form.location || '',
          noteEn: form.location || '',
          noteRu: form.location || '',
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
        }),
      });

      const now = new Date();
      setForm({
        title: '',
        startAt: toLocalDateTimeValue(now),
        endAt: toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000)),
        location: '',
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function syncMock() {
    if (!token) return;
    if (!confirmAction('确认导入课程安排吗？')) return;
    try {
      await apiFetch('/schedule/sync-mock', { method: 'POST', token });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '导入失败');
    }
  }

  const filter = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return {
      match: (row: Record<string, unknown>) =>
        !needle || JSON.stringify(row).toLowerCase().includes(needle),
    };
  }, [q]);

  if (!token) {
    return (
      <div className="page-card">
        <Link href="/">Login</Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">{pageMeta.pageTitle}</h1>
        <p className="page-subtitle">{pageMeta.pageSubtitle}</p>

        {err && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
            }}
          >
            {err}
          </div>
        )}

        <div className="page-section">
          <div className="card-soft">
            <h3 style={{ marginBottom: 14 }}>操作区</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                placeholder={pageMeta.searchPlaceholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ maxWidth: 320 }}
              />
              <button type="button" onClick={load}>
                {pageMeta.actionRefresh}
              </button>
              <button type="button" onClick={syncMock}>
                {pageMeta.actionSync}
              </button>
            </div>
          </div>
        </div>

        <div className="page-section">
          <div className="card-soft">
            <h3 style={{ marginBottom: 14 }}>{pageMeta.createTitle}</h3>
            <p className="topbar-muted" style={{ marginBottom: 14 }}>
              {pageMeta.createHint}
            </p>

            <form onSubmit={addPlan} style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
              <input
                placeholder="任务 / 课程名称"
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                required
              />

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">开始时间</span>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  min={nowMin}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setForm((s) => {
                      const next = { ...s, startAt: nextStart };
                      if (new Date(next.endAt).getTime() < new Date(nextStart).getTime()) {
                        next.endAt = nextStart;
                      }
                      return next;
                    });
                  }}
                  required
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">结束时间</span>
                <input
                  type="datetime-local"
                  value={form.endAt}
                  min={form.startAt || nowMin}
                  onChange={(e) => setForm((s) => ({ ...s, endAt: e.target.value }))}
                  required
                />
              </label>

              <input
                placeholder="地点（可不填）"
                value={form.location}
                onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
              />

              <button type="submit">创建</button>
            </form>
          </div>
        </div>

        <div className="page-section">
          <div className="card-soft">
            <h2 style={{ marginBottom: 14 }}>{pageMeta.sectionPlans}</h2>
            {plans.filter((x) => filter.match(x as Record<string, unknown>)).length === 0 ? (
              <div className="topbar-muted">{pageMeta.emptyPlans}</div>
            ) : (
              <ul className="list-clean">
                {plans
                  .filter((x) => filter.match(x as Record<string, unknown>))
                  .map((p) => {
                    const o = p as Record<string, unknown>;
                    return (
                      <li key={String(o.id)} className="list-item">
                        <strong>{triField(o, 'title', locale)}</strong>
                        <div className="topbar-muted" style={{ marginTop: 6 }}>
                          截止时间：{o.dueAt ? formatDateTime(o.dueAt) : '—'}
                        </div>
                        {'startAt' in o ? (
                          <div className="topbar-muted" style={{ marginTop: 4 }}>
                            开始时间：{formatDateTime(o.startAt)}
                          </div>
                        ) : null}
                        {'endAt' in o ? (
                          <div className="topbar-muted" style={{ marginTop: 4 }}>
                            结束时间：{formatDateTime(o.endAt)}
                          </div>
                        ) : null}
                        {'noteZh' in o || 'noteEn' in o || 'noteRu' in o ? (
                          <div className="topbar-muted" style={{ marginTop: 4 }}>
                            地点：{triField(o, 'note', locale) || '—'}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>

        <div className="page-section">
          <div className="card-soft">
            <h2 style={{ marginBottom: 14 }}>{pageMeta.sectionSchedule}</h2>
            {schedule.filter((x) => filter.match(x as Record<string, unknown>)).length === 0 ? (
              <div className="topbar-muted">{pageMeta.emptySchedule}</div>
            ) : (
              <ul className="list-clean">
                {schedule
                  .filter((x) => filter.match(x as Record<string, unknown>))
                  .map((s) => {
                    const o = s as Record<string, unknown>;
                    return (
                      <li key={String(o.id)} className="list-item">
                        <strong>{triField(o, 'course', locale)}</strong>
                        <div className="topbar-muted" style={{ marginTop: 6 }}>
                          星期 {String(o.weekday)} · {String(o.startTime)} - {String(o.endTime)}
                        </div>
                        <div className="topbar-muted" style={{ marginTop: 4 }}>
                          地点：{triField(o, 'location', locale)} · 来源：{String(o.source ?? '')}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>

        <div className="page-section">
          <h2 style={{ marginBottom: 14 }}>{pageMeta.sectionUpcoming}</h2>

          {upcoming && (
            <div className="grid-two">
              <div className="card-soft">
                <h4 style={{ marginBottom: 12 }}>Plans</h4>
                {upcoming.plans.length === 0 ? (
                  <div className="topbar-muted">暂无近期事项</div>
                ) : (
                  <ul className="list-clean">
                    {upcoming.plans.map((p) => {
                      const o = p as Record<string, unknown>;
                      return (
                        <li key={String(o.id)} className="list-item">
                          <strong>{triField(o, 'title', locale)}</strong>
                          <div className="topbar-muted" style={{ marginTop: 6 }}>
                            {String(o.dueAt ?? '')}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="card-soft">
                <h4 style={{ marginBottom: 12 }}>Tasks</h4>
                {upcoming.tasks.length === 0 ? (
                  <div className="topbar-muted">暂无近期任务</div>
                ) : (
                  <ul className="list-clean">
                    {upcoming.tasks.map((p) => {
                      const o = p as Record<string, unknown>;
                      return (
                        <li key={String(o.id)} className="list-item">
                          <strong>{triField(o, 'title', locale)}</strong>
                          <div className="topbar-muted" style={{ marginTop: 6 }}>
                            {String(o.dueAt ?? '')}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}