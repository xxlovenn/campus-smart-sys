'use client';

import { useLocale } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

type Me = {
  id: string;
  role: string;
  name?: string;
  email?: string;
};

export default function TimelinePage() {
  const locale = useLocale();
  const token = getToken();

  const [me, setMe] = useState<Me | null>(null);
  const [plans, setPlans] = useState<unknown[]>([]);
  const [schedule, setSchedule] = useState<unknown[]>([]);
  const [upcoming, setUpcoming] = useState<{ plans: unknown[]; tasks: unknown[] } | null>(null);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const pageMeta = useMemo(() => {
    if (me?.role === 'LEAGUE_ADMIN') {
      return {
        pageTitle: '日程表',
        pageSubtitle: '统一管理团委日程、事务安排与近期提醒',
        createTitle: '新建日程',
        createHint: '只需填写一次标题，系统会同步到三语字段，方便展示与管理。',
        sectionSchedule: '日程安排',
        sectionUpcoming: '近期事项',
        actionSync: '同步日程',
      };
    }

    if (me?.role === 'ORG_ADMIN') {
      return {
        pageTitle: '日程表',
        pageSubtitle: '统一管理组织安排、模拟课表与近期提醒',
        createTitle: '新建日程',
        createHint: '只需填写一次标题，系统会同步到三语字段，方便展示与管理。',
        sectionSchedule: '日程安排',
        sectionUpcoming: '即将到期（7天内）',
        actionSync: '同步模拟课表 API',
      };
    }

    return {
      pageTitle: '日程表',
      pageSubtitle: '统一管理个人计划、模拟课表与即将到期提醒',
      createTitle: '新建计划',
      createHint: '只需填写一次标题',
      sectionSchedule: '课表（含模拟 API）',
      sectionUpcoming: '即将到期（7天内）',
      actionSync: '同步模拟课表 API',
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
      setPlans(p);
      setSchedule(s.entries);
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

    try {
      await apiFetch('/plans', {
        method: 'POST',
        token,
        body: JSON.stringify({
          titleZh: title,
          titleEn: title,
          titleRu: title,
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          syncedToTimeline: true,
        }),
      });

      setTitle('');
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function syncMock() {
    if (!token) return;
    try {
      await apiFetch('/schedule/sync-mock', { method: 'POST', token });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '同步失败');
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
                placeholder="搜索（前端过滤）"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ maxWidth: 320 }}
              />
              <button type="button" onClick={load}>
                刷新
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

            <form onSubmit={addPlan} style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <input
                placeholder="标题（中文）"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <button type="submit">创建</button>
            </form>
          </div>
        </div>

        <div className="page-section">
          <div className="card-soft">
            <h2 style={{ marginBottom: 14 }}>Plans</h2>
            {plans.filter((x) => filter.match(x as Record<string, unknown>)).length === 0 ? (
              <div className="topbar-muted">暂无计划</div>
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
                          截止时间：{o.dueAt ? String(o.dueAt) : '—'}
                        </div>
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
              <div className="topbar-muted">暂无数据</div>
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
                  <div className="topbar-muted">暂无近期计划</div>
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