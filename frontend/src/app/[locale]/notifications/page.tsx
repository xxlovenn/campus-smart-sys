'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

type N = { id: string; read: boolean; createdAt: string } & Record<string, unknown>;

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { token, ready } = useAuthGuard();
  const [items, setItems] = useState<N[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const list = await apiFetch<N[]>('/notifications', { token });
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    if (!token) return;
    if (!confirmAction('确认将该通知标记为已读吗？')) return;
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH', token });
    load();
  }

  async function markAll() {
    if (!token) return;
    if (!confirmAction('确认将全部通知标记为已读吗？')) return;
    await apiFetch('/notifications/read-all', { method: 'PATCH', token });
    load();
  }

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">正在校验登录状态...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>{t('title')}</h1>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={load}>
          {tc('refresh')}
        </button>
        <button type="button" onClick={markAll}>
          {t('markAll')}
        </button>
      </div>
      <ul style={{ lineHeight: 1.8 }}>
        {items.map((n) => (
          <li key={n.id} style={{ opacity: n.read ? 0.55 : 1 }}>
            <strong>{triField(n, 'title', locale)}</strong> · {String(n.createdAt)}
            <div>{triField(n, 'body', locale)}</div>
            {!n.read && (
              <button type="button" onClick={() => markRead(n.id)}>
                Read
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
