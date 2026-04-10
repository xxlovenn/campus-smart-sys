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
  const [titles, setTitles] = useState({ zh: '', en: '', ru: '' });
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
        titleZh: titles.zh,
        titleEn: titles.en,
        titleRu: titles.ru,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        syncedToTimeline: true,
      }),
    });
    setTitles({ zh: '', en: '', ru: '' });
    load();
  }

  async function syncMock() {
    if (!token) return;
    await apiFetch('/schedule/sync-mock', { method: 'POST', token });
    load();
  }

  const filter = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (row: Record<string, unknown>) => {
      if (!needle) return true;
      const blob = JSON.stringify(row).toLowerCase();
      return blob.includes(needle);
    };
    return { match };
  }, [q]);

  if (!token) {
    return (
      <p>
        <Link href="/">Login</Link>
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <h1>{t('plans')}</h1>
      <input
        placeholder={tc('search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 420 }}
      />
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <button type="button" onClick={load}>
        {tc('refresh')}
      </button>
      <button type="button" onClick={syncMock}>
        {tc('syncMock')}
      </button>

      <form onSubmit={addPlan} style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
        <h3>{t('addPlan')}</h3>
        <input
          placeholder={t('titleZh')}
          value={titles.zh}
          onChange={(e) => setTitles((s) => ({ ...s, zh: e.target.value }))}
          required
        />
        <input
          placeholder={t('titleEn')}
          value={titles.en}
          onChange={(e) => setTitles((s) => ({ ...s, en: e.target.value }))}
          required
        />
        <input
          placeholder={t('titleRu')}
          value={titles.ru}
          onChange={(e) => setTitles((s) => ({ ...s, ru: e.target.value }))}
          required
        />
        <button type="submit">{tc('create')}</button>
      </form>

      <ul>
        {plans
          .filter((x) => filter.match(x as Record<string, unknown>))
          .map((p) => {
            const o = p as Record<string, unknown>;
            return (
              <li key={String(o.id)}>
                {triField(o, 'title', locale)} · {o.dueAt ? String(o.dueAt) : '—'}
              </li>
            );
          })}
      </ul>

      <h2>{t('schedule')}</h2>
      <ul>
        {schedule
          .filter((x) => filter.match(x as Record<string, unknown>))
          .map((s) => {
            const o = s as Record<string, unknown>;
            return (
              <li key={String(o.id)}>
                {triField(o, 'course', locale)} · {String(o.weekday)} · {String(o.startTime)}-
                {String(o.endTime)} · {triField(o, 'location', locale)} ·{' '}
                <em>{String(o.source ?? '')}</em>
              </li>
            );
          })}
      </ul>

      <h2>{t('upcoming')}</h2>
      {upcoming && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <h4>Plans</h4>
            <ul>
              {upcoming.plans.map((p) => {
                const o = p as Record<string, unknown>;
                return (
                  <li key={String(o.id)}>
                    {triField(o, 'title', locale)} · {String(o.dueAt ?? '')}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h4>Tasks</h4>
            <ul>
              {upcoming.tasks.map((p) => {
                const o = p as Record<string, unknown>;
                return (
                  <li key={String(o.id)}>
                    {triField(o, 'title', locale)} · {String(o.dueAt ?? '')}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
