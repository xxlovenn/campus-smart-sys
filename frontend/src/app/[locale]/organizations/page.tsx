'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

type Org = Record<string, unknown>;
type Me = { role: string };

export default function OrgsPage() {
  const t = useTranslations('orgs');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = getToken();
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [form, setForm] = useState({
    nameZh: '',
    nameEn: '',
    nameRu: '',
    typeZh: '',
    typeEn: '',
    typeRu: '',
  });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      const list = await apiFetch<Org[]>('/organizations', { token });
      setOrgs(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiFetch('/organizations', { method: 'POST', token, body: JSON.stringify(form) });
    setForm({ nameZh: '', nameEn: '', nameRu: '', typeZh: '', typeEn: '', typeRu: '' });
    load();
  }

  if (!token) {
    return (
      <p>
        <Link href="/">Login</Link>
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>{t('list')}</h1>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <button type="button" onClick={load}>
        {tc('refresh')}
      </button>

      {me?.role === 'LEAGUE_ADMIN' && (
        <form onSubmit={onCreate} style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <h3>{t('new')}</h3>
          <input
            placeholder={t('nameZh')}
            value={form.nameZh}
            onChange={(e) => setForm((s) => ({ ...s, nameZh: e.target.value }))}
            required
          />
          <input
            placeholder="Name EN"
            value={form.nameEn}
            onChange={(e) => setForm((s) => ({ ...s, nameEn: e.target.value }))}
            required
          />
          <input
            placeholder="Name RU"
            value={form.nameRu}
            onChange={(e) => setForm((s) => ({ ...s, nameRu: e.target.value }))}
            required
          />
          <input
            placeholder={t('typeZh')}
            value={form.typeZh}
            onChange={(e) => setForm((s) => ({ ...s, typeZh: e.target.value }))}
            required
          />
          <input
            placeholder="Type EN"
            value={form.typeEn}
            onChange={(e) => setForm((s) => ({ ...s, typeEn: e.target.value }))}
            required
          />
          <input
            placeholder="Type RU"
            value={form.typeRu}
            onChange={(e) => setForm((s) => ({ ...s, typeRu: e.target.value }))}
            required
          />
          <button type="submit">{tc('create')}</button>
        </form>
      )}

      <ul>
        {orgs.map((o) => (
          <li key={String(o.id)}>
            <strong>{triField(o, 'name', locale)}</strong> · {triField(o, 'type', locale)} ·{' '}
            <code>{String(o.id)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
