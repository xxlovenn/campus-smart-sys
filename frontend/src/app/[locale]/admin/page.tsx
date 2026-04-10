'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
type Me = { role: string; name: string };
type PendingProfile = {
  userId: string;
  user: { name: string; email: string; studentId?: string | null };
};

export default function AdminPage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const token = getToken();
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      if (m.role !== 'LEAGUE_ADMIN') return;
      const list = await apiFetch<PendingProfile[]>('/profile/admin/pending', { token });
      setPending(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(userId: string, approve: boolean) {
    if (!token) return;
    await apiFetch(`/profile/admin/${userId}/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ approve, reason: approve ? undefined : reason[userId] || 'Rejected' }),
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

  if (me && me.role !== 'LEAGUE_ADMIN') {
    return <p>League admin only. Current role: {me.role}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>{t('pending')}</h1>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <button type="button" onClick={load}>
        {tc('refresh')}
      </button>
      <p>
        Task board: <Link href="/tasks">/tasks</Link> (League sees JSON overview)
      </p>
      <ul style={{ lineHeight: 1.8 }}>
        {pending.map((row) => (
          <li key={row.userId} style={{ marginBottom: 12 }}>
            <div>
              <strong>{row.user.name}</strong> · {row.user.email} · {row.user.studentId ?? '—'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => review(row.userId, true)}>
                {tc('approve')}
              </button>
              <input
                placeholder="reject reason"
                value={reason[row.userId] ?? ''}
                onChange={(e) => setReason((s) => ({ ...s, [row.userId]: e.target.value }))}
                style={{ minWidth: 220 }}
              />
              <button type="button" onClick={() => review(row.userId, false)}>
                {tc('reject')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
