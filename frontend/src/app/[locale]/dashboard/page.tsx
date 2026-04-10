'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';

type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  studentId?: string | null;
};

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tn = useTranslations('nav');
  const tc = useTranslations('common');
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch<Me>('/users/me', { token })
      .then(setMe)
      .catch((e) => setErr(e instanceof Error ? e.message : tc('error')));
  }, [tc]);

  if (!getToken()) {
    return (
      <p>
        Please <Link href="/">login</Link>.
      </p>
    );
  }

  return (
    <div>
      <h1>{t('welcome')}</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      {me && (
        <p>
          <strong>{me.name}</strong> · {me.email} · {me.role} · {me.studentId ?? '—'}
        </p>
      )}
      <h2>{t('cards')}</h2>
      <ul style={{ lineHeight: 1.8 }}>
        <li>
          <Link href="/timeline">{tn('timeline')}</Link>
        </li>
        <li>
          <Link href="/tasks">{tn('tasks')}</Link>
        </li>
        <li>
          <Link href="/organizations">{tn('orgs')}</Link>
        </li>
        <li>
          <Link href="/profile">{tn('profile')}</Link>
        </li>
        <li>
          <Link href="/admin">{tn('admin')}</Link>
        </li>
        <li>
          <Link href="/notifications">{tn('notifications')}</Link>
        </li>
      </ul>
    </div>
  );
}
