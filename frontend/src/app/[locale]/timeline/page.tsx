'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

export default function TimelinePage() {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = getToken();

  const [plans, setPlans] = useState<unknown[]>([]);
  const [schedule, setSchedule] = useState<unknown[]>([]);
  const [upcoming, setUpcoming] = useState<{ plans: unknown[]; tasks: unknown[] } | null>(null);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const [p, s, u] = await Promise.all([
        apiFetch<unknown[]>('/plans/timeline', { token }),
        apiFetch<{ entries: unknown[] }>('/schedule', { token }),
        apiFetch<{ plans: unknown[]; tasks: unknown[] }>('/reminders/upcoming', { token }),
      ]);
      setPlans(p);
      setSchedule(s.entries);
      setUpcoming(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

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
  }

  async function syncMock() {
    if (!token) return;
    await apiFetch('/schedule/sync-mock', { method: 'POST', token });
    load();
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
        <h1 className="page-title">{t('plans')}</h1>
        <p className="page-subtitle">
          统一管理个人计划、模拟课表与即将到期提醒
        </p>

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

        {/* 顶部操作区 */}
        <div className="page-section">
          <div className="card-soft">
            <h3 style={{ marginBottom: 14 }}>操作区</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                placeholder={tc('search')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ maxWidth: 320 }}
              />
              <button type="button" onClick={load}>
                {tc('refresh')}
              </button>
              <button type="button" onClick={syncMock}>
                {tc('syncMock')}
              </button>
            </div>
          </div>
        </div>

        {/* 新建计划 */}
        <div className="page-section">
          <div className="card-soft">
            <h3 style={{ marginBottom: 14 }}>{t('addPlan')}</h3>
            <p className="topbar-muted" style={{ marginBottom: 14 }}>
              只需填写一次标题，系统会按当前方案同步到三语字段，方便演示与管理。
            </p>

            <form onSubmit={addPlan} style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <input
                placeholder={t('titleZh')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <button type="submit">{tc('create')}</button>
            </form>
          </div>
        </div>

        {/* 计划列表 */}
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

        {/* 课表 */}
        <div className="page-section">
          <div className="card-soft">
            <h2 style={{ marginBottom: 14 }}>{t('schedule')}</h2>
            {schedule.filter((x) => filter.match(x as Record<string, unknown>)).length === 0 ? (
              <div className="topbar-muted">暂无课表数据</div>
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

        {/* 即将到期 */}
        <div className="page-section">
          <h2 style={{ marginBottom: 14 }}>{t('upcoming')}</h2>

          {upcoming && (
            <div className="grid-two">
              <div className="card-soft">
                <h4 style={{ marginBottom: 12 }}>Plans</h4>
                {upcoming.plans.length === 0 ? (
                  <div className="topbar-muted">暂无即将到期计划</div>
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
                  <div className="topbar-muted">暂无即将到期任务</div>
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