'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

type N = {
  id: string;
  read: boolean;
  createdAt: string;
  notificationType?: 'LEAGUE_PUBLISH' | 'ORG_PUBLISH' | 'REVIEW_RESULT';
  publisherZh?: string;
  publisherEn?: string;
  publisherRu?: string;
} & Record<string, unknown>;

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
    if (!confirmAction(t('confirm.markOne'))) return;
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH', token });
    load();
  }

  async function markAll() {
    if (!token) return;
    if (!confirmAction(t('confirm.markAll'))) return;
    await apiFetch('/notifications/read-all', { method: 'PATCH', token });
    load();
  }

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  function formatPublishedAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function publisherLabel(item: N) {
    return triField(item, 'publisher', locale) || t('publisherFallback');
  }

  function typeClass(item: N) {
    if (item.notificationType === 'LEAGUE_PUBLISH') return 'badge-blue';
    if (item.notificationType === 'ORG_PUBLISH') return 'badge-green';
    return 'badge-yellow';
  }

  function typeLabel(item: N) {
    if (item.notificationType === 'LEAGUE_PUBLISH') return t('types.leaguePublish');
    if (item.notificationType === 'ORG_PUBLISH') return t('types.orgPublish');
    return t('types.reviewResult');
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
      <div className="page-card" style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ margin: 0 }}>{t('title')}</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>
          {t('subtitle', { unread: unreadCount, total: items.length })}
        </p>
      </div>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={load}>
          {tc('refresh')}
        </button>
        <button type="button" onClick={markAll}>
          {t('markAll')}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="page-card">
          <p className="page-subtitle" style={{ margin: 0 }}>{t('empty')}</p>
        </div>
      ) : (
        <ul className="list-clean" style={{ display: 'grid', gap: 10 }}>
          {items.map((n) => (
            <li key={n.id} className="page-card" style={{ opacity: n.read ? 0.68 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <strong>{triField(n, 'title', locale)}</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={typeClass(n)}>{typeLabel(n)}</span>
                  <span className={n.read ? 'badge-green' : 'badge-yellow'}>
                    {n.read ? t('status.read') : t('status.unread')}
                  </span>
                </div>
              </div>

              <div className="topbar-muted" style={{ marginTop: 6 }}>
                {t('publishedAt')}: {formatPublishedAt(String(n.createdAt))} · {t('publisher')}: {publisherLabel(n)}
              </div>

              <div style={{ marginTop: 6 }}>{triField(n, 'body', locale)}</div>

              {!n.read && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => markRead(n.id)}>
                    {t('actions.markRead')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
