'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

type Profile = {
  userId: string;
  githubUrl?: string | null;
  identityZh?: string;
  identityEn?: string;
  identityRu?: string;
  reviewStatus: string;
  rejectReason?: string | null;
  awards: Record<string, unknown>[];
  tags: Record<string, unknown>[];
};

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = getToken();
  const [p, setP] = useState<Profile | null>(null);
  const [identity, setIdentity] = useState({ zh: '', en: '', ru: '' });
  const [github, setGithub] = useState('');
  const [award, setAward] = useState({ zh: '', en: '', ru: '', proof: '' });
  const [tag, setTag] = useState({
    cz: '',
    ce: '',
    cr: '',
    nz: '',
    ne: '',
    nr: '',
  });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const prof = await apiFetch<Profile>('/profile/me', { token });
      setP(prof);
      setGithub(prof.githubUrl ?? '');
      setIdentity({
        zh: prof.identityZh ?? '',
        en: prof.identityEn ?? '',
        ru: prof.identityRu ?? '',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiFetch('/profile/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify({
        githubUrl: github,
        identityZh: identity.zh,
        identityEn: identity.en,
        identityRu: identity.ru,
      }),
    });
    load();
  }

  async function addAward(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiFetch('/profile/awards', {
      method: 'POST',
      token,
      body: JSON.stringify({
        titleZh: award.zh,
        titleEn: award.en,
        titleRu: award.ru,
        proofUrl: award.proof || undefined,
      }),
    });
    setAward({ zh: '', en: '', ru: '', proof: '' });
    load();
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiFetch('/profile/tags', {
      method: 'POST',
      token,
      body: JSON.stringify({
        categoryZh: tag.cz,
        categoryEn: tag.ce,
        categoryRu: tag.cr,
        nameZh: tag.nz,
        nameEn: tag.ne,
        nameRu: tag.nr,
      }),
    });
    setTag({ cz: '', ce: '', cr: '', nz: '', ne: '', nr: '' });
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
    <div style={{ display: 'grid', gap: 20 }}>
      <h1>{t('title')}</h1>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      <button type="button" onClick={load}>
        {tc('refresh')}
      </button>

      {p && (
        <p>
          {t('review')}: <strong>{p.reviewStatus}</strong>
          {p.rejectReason ? ` — ${p.rejectReason}` : ''}
        </p>
      )}

      <form onSubmit={saveProfile} style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
        <h3>{t('github')}</h3>
        <input value={github} onChange={(e) => setGithub(e.target.value)} />
        <h3>{t('identity')}</h3>
        <textarea
          placeholder="ZH"
          value={identity.zh}
          onChange={(e) => setIdentity((s) => ({ ...s, zh: e.target.value }))}
          rows={2}
        />
        <textarea
          placeholder="EN"
          value={identity.en}
          onChange={(e) => setIdentity((s) => ({ ...s, en: e.target.value }))}
          rows={2}
        />
        <textarea
          placeholder="RU"
          value={identity.ru}
          onChange={(e) => setIdentity((s) => ({ ...s, ru: e.target.value }))}
          rows={2}
        />
        <button type="submit">{tc('save')}</button>
      </form>

      <form onSubmit={addAward} style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
        <h3>{t('awards')}</h3>
        <input
          placeholder="ZH"
          value={award.zh}
          onChange={(e) => setAward((s) => ({ ...s, zh: e.target.value }))}
          required
        />
        <input
          placeholder="EN"
          value={award.en}
          onChange={(e) => setAward((s) => ({ ...s, en: e.target.value }))}
          required
        />
        <input
          placeholder="RU"
          value={award.ru}
          onChange={(e) => setAward((s) => ({ ...s, ru: e.target.value }))}
          required
        />
        <input
          placeholder="proof URL"
          value={award.proof}
          onChange={(e) => setAward((s) => ({ ...s, proof: e.target.value }))}
        />
        <button type="submit">{tc('create')}</button>
      </form>

      <ul>
        {p?.awards.map((a) => (
          <li key={String(a.id)}>{triField(a as Record<string, unknown>, 'title', locale)}</li>
        ))}
      </ul>

      <form onSubmit={addTag} style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
        <h3>{t('tags')}</h3>
        <input
          placeholder="cat ZH"
          value={tag.cz}
          onChange={(e) => setTag((s) => ({ ...s, cz: e.target.value }))}
          required
        />
        <input
          placeholder="cat EN"
          value={tag.ce}
          onChange={(e) => setTag((s) => ({ ...s, ce: e.target.value }))}
          required
        />
        <input
          placeholder="cat RU"
          value={tag.cr}
          onChange={(e) => setTag((s) => ({ ...s, cr: e.target.value }))}
          required
        />
        <input
          placeholder="name ZH"
          value={tag.nz}
          onChange={(e) => setTag((s) => ({ ...s, nz: e.target.value }))}
          required
        />
        <input
          placeholder="name EN"
          value={tag.ne}
          onChange={(e) => setTag((s) => ({ ...s, ne: e.target.value }))}
          required
        />
        <input
          placeholder="name RU"
          value={tag.nr}
          onChange={(e) => setTag((s) => ({ ...s, nr: e.target.value }))}
          required
        />
        <button type="submit">{tc('create')}</button>
      </form>

      <ul>
        {p?.tags.map((x) => {
          const o = x as Record<string, unknown>;
          return (
            <li key={String(o.id)}>
              {triField(o, 'category', locale)} · {triField(o, 'name', locale)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
