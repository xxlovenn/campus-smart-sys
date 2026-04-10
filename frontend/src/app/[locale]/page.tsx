'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { setToken } from '@/lib/auth-storage';

export default function LoginPage() {
  const t = useTranslations('auth');
  const ta = useTranslations('app');
  const router = useRouter();
  const [email, setEmail] = useState('student@campus.demo');
  const [password, setPassword] = useState('demo123456');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(data.accessToken);
      router.push('/dashboard');
      router.refresh();
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>{ta('title')}</h1>
      <p style={{ color: '#555' }}>{ta('subtitle')}</p>
      <form
        onSubmit={onSubmit}
        style={{ display: 'grid', gap: 12, maxWidth: 360, marginTop: 24 }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          {t('email')}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          {t('password')}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}
        <button type="submit" disabled={loading}>
          {t('login')}
        </button>
        <small style={{ color: '#666' }}>{t('hint')}</small>
      </form>
    </div>
  );
}
