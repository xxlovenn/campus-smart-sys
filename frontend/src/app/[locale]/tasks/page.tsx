'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

type Me = { role: string };
type Task = Record<string, unknown> & { id: string; status: string };

export default function TasksPage() {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = getToken();
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overview, setOverview] = useState<unknown | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    titleZh: '',
    titleEn: '',
    titleRu: '',
    primaryOrgId: '',
    assigneeId: '',
    relatedOrgIds: '',
    dueAt: '',
  });

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      const list = await apiFetch<Task[]>('/tasks', { token });
      setTasks(list);
      if (m.role === 'LEAGUE_ADMIN') {
        const ov = await apiFetch<unknown>('/tasks/admin/overview', { token });
        setOverview(ov);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    if (!token) return;
    await apiFetch(`/tasks/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const related = form.relatedOrgIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await apiFetch('/tasks', {
      method: 'POST',
      token,
      body: JSON.stringify({
        titleZh: form.titleZh,
        titleEn: form.titleEn,
        titleRu: form.titleRu,
        primaryOrgId: form.primaryOrgId || undefined,
        assigneeId: form.assigneeId || undefined,
        relatedOrgIds: related.length ? related : undefined,
        dueAt: form.dueAt || undefined,
      }),
    });
    setForm({
      titleZh: '',
      titleEn: '',
      titleRu: '',
      primaryOrgId: '',
      assigneeId: '',
      relatedOrgIds: '',
      dueAt: '',
    });
    load();
  }

  if (!token) {
    return (
      <p>
        <Link href="/">Login</Link>
      </p>
    );
  }

  const canCreate = me?.role === 'ORG_ADMIN' || me?.role === 'LEAGUE_ADMIN';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>{t('list')}</h1>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <button type="button" onClick={load}>
        {tc('refresh')}
      </button>

      {canCreate && (
        <form onSubmit={createTask} style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
          <h3>{t('new')}</h3>
          <input
            placeholder={t('titleZh')}
            value={form.titleZh}
            onChange={(e) => setForm((s) => ({ ...s, titleZh: e.target.value }))}
            required
          />
          <input
            placeholder="Title EN"
            value={form.titleEn}
            onChange={(e) => setForm((s) => ({ ...s, titleEn: e.target.value }))}
            required
          />
          <input
            placeholder="Title RU"
            value={form.titleRu}
            onChange={(e) => setForm((s) => ({ ...s, titleRu: e.target.value }))}
            required
          />
          <input
            placeholder={t('primaryOrg')}
            value={form.primaryOrgId}
            onChange={(e) => setForm((s) => ({ ...s, primaryOrgId: e.target.value }))}
            required
          />
          <input
            placeholder={t('assignee')}
            value={form.assigneeId}
            onChange={(e) => setForm((s) => ({ ...s, assigneeId: e.target.value }))}
          />
          <input
            placeholder={t('relatedOrgs')}
            value={form.relatedOrgIds}
            onChange={(e) => setForm((s) => ({ ...s, relatedOrgIds: e.target.value }))}
          />
          <input
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm((s) => ({ ...s, dueAt: e.target.value }))}
          />
          <button type="submit">{tc('create')}</button>
        </form>
      )}

      <ul style={{ lineHeight: 1.8 }}>
        {tasks.map((task) => (
          <li key={task.id}>
            <strong>{triField(task, 'title', locale)}</strong> · {tc('status')}: {task.status} ·{' '}
            {tc('due')}: {task.dueAt ? String(task.dueAt) : '—'}
            <div style={{ marginTop: 6 }}>
              <label>
                {tc('status')}{' '}
                <select
                  value={task.status}
                  onChange={(e) => setStatus(task.id, e.target.value)}
                >
                  {['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        ))}
      </ul>

      {me?.role === 'LEAGUE_ADMIN' && overview != null ? (
        <div>
          <h2>{t('overview')}</h2>
          <pre style={{ background: '#111', color: '#eee', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(overview as Record<string, unknown>, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
