'use client';

import { useLocale } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

type Me = {
  id: string;
  name?: string;
  email?: string;
  role: string;
  studentId?: string;
};

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

type PendingProfile = Profile & {
  user?: {
    id: string;
    name?: string;
    email?: string;
    studentId?: string;
  };
};

export default function ProfilePage() {
  const locale = useLocale();
  const token = getToken();

  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [searchUserId, setSearchUserId] = useState('');
  const [searchedProfile, setSearchedProfile] = useState<Profile | null>(null);
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
      const currentUser = await apiFetch<Me>('/users/me', { token });
      setMe(currentUser);

      if (currentUser.role === 'LEAGUE_ADMIN') {
        const pendingList = await apiFetch<PendingProfile[]>('/profile/admin/pending', { token });
        setPending(Array.isArray(pendingList) ? pendingList : []);
        setProfile(null);
        return;
      }

      const prof = await apiFetch<Profile>('/profile/me', { token });
      setProfile(prof);
      setGithub(prof.githubUrl ?? '');
      setIdentity({
        zh: prof.identityZh ?? '',
        en: prof.identityEn ?? '',
        ru: prof.identityRu ?? '',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    try {
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function addAward(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    try {
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : '新增奖项失败');
    }
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    try {
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : '新增标签失败');
    }
  }

  async function searchStudentProfile() {
    if (!token || !searchUserId.trim()) return;

    try {
      const prof = await apiFetch<Profile>(`/profile/admin/user/${searchUserId.trim()}`, { token });
      setSearchedProfile(prof);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '查询失败');
    }
  }

  async function review(userId: string, approve: boolean) {
    if (!token) return;

    try {
      await apiFetch(`/profile/admin/${userId}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          approve,
          reason: approve ? undefined : '未通过审核',
        }),
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '审核失败');
    }
  }

  if (!token) {
    return (
      <div className="page-card">
        <Link href="/">Login</Link>
      </div>
    );
  }

  if (!me) return null;

  const isStudent = me.role === 'STUDENT';
  const isOrgAdmin = me.role === 'ORG_ADMIN';
  const isLeagueAdmin = me.role === 'LEAGUE_ADMIN';

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">
          {isStudent ? '个人档案' : isOrgAdmin ? '成员信息' : '学生档案管理'}
        </h1>

        <p className="page-subtitle">
          {isStudent
            ? '查看并维护个人档案、奖项与能力标签'
            : isOrgAdmin
            ? '查看组织成员信息与个人档案示例'
            : '查询学生档案并处理待审核资料'}
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

        {(isStudent || isOrgAdmin) && profile && (
          <>
            <div className="page-section">
              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>
                  {isStudent ? '我的档案' : '档案示例'}
                </h3>

                <p className="topbar-muted" style={{ marginBottom: 8 }}>
                  审核状态：<strong>{profile.reviewStatus}</strong>
                  {profile.rejectReason ? ` · ${profile.rejectReason}` : ''}
                </p>

                <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="topbar-muted">GitHub</span>
                    <input value={github} onChange={(e) => setGithub(e.target.value)} />
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="topbar-muted">身份说明（中文）</span>
                    <textarea
                      rows={2}
                      value={identity.zh}
                      onChange={(e) => setIdentity((s) => ({ ...s, zh: e.target.value }))}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="topbar-muted">Identity (EN)</span>
                    <textarea
                      rows={2}
                      value={identity.en}
                      onChange={(e) => setIdentity((s) => ({ ...s, en: e.target.value }))}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="topbar-muted">Идентичность (RU)</span>
                    <textarea
                      rows={2}
                      value={identity.ru}
                      onChange={(e) => setIdentity((s) => ({ ...s, ru: e.target.value }))}
                    />
                  </label>

                  <button type="submit">保存档案</button>
                </form>
              </div>
            </div>

            <div className="grid-two">
              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>奖项信息</h3>

                <form onSubmit={addAward} style={{ display: 'grid', gap: 10 }}>
                  <input
                    placeholder="奖项标题（中文）"
                    value={award.zh}
                    onChange={(e) => setAward((s) => ({ ...s, zh: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Award Title (EN)"
                    value={award.en}
                    onChange={(e) => setAward((s) => ({ ...s, en: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Название награды (RU)"
                    value={award.ru}
                    onChange={(e) => setAward((s) => ({ ...s, ru: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="证明链接（可选）"
                    value={award.proof}
                    onChange={(e) => setAward((s) => ({ ...s, proof: e.target.value }))}
                  />
                  <button type="submit">新增奖项</button>
                </form>

                <ul className="list-clean" style={{ marginTop: 16 }}>
                  {profile.awards.map((a) => (
                    <li key={String(a.id)} className="list-item">
                      {triField(a as Record<string, unknown>, 'title', locale)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>能力标签</h3>

                <form onSubmit={addTag} style={{ display: 'grid', gap: 10 }}>
                  <input
                    placeholder="分类（中文）"
                    value={tag.cz}
                    onChange={(e) => setTag((s) => ({ ...s, cz: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Category (EN)"
                    value={tag.ce}
                    onChange={(e) => setTag((s) => ({ ...s, ce: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Категория (RU)"
                    value={tag.cr}
                    onChange={(e) => setTag((s) => ({ ...s, cr: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="标签名称（中文）"
                    value={tag.nz}
                    onChange={(e) => setTag((s) => ({ ...s, nz: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Tag Name (EN)"
                    value={tag.ne}
                    onChange={(e) => setTag((s) => ({ ...s, ne: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Название тега (RU)"
                    value={tag.nr}
                    onChange={(e) => setTag((s) => ({ ...s, nr: e.target.value }))}
                    required
                  />
                  <button type="submit">新增标签</button>
                </form>

                <ul className="list-clean" style={{ marginTop: 16 }}>
                  {profile.tags.map((x) => {
                    const o = x as Record<string, unknown>;
                    return (
                      <li key={String(o.id)} className="list-item">
                        {triField(o, 'category', locale)} · {triField(o, 'name', locale)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </>
        )}

        {isLeagueAdmin && (
          <>
            <div className="page-section">
              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>查询学生档案</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    placeholder="输入学生 userId"
                    value={searchUserId}
                    onChange={(e) => setSearchUserId(e.target.value)}
                    style={{ minWidth: 320 }}
                  />
                  <button type="button" onClick={searchStudentProfile}>
                    查询
                  </button>
                </div>
              </div>
            </div>

            {searchedProfile && (
              <div className="page-section">
                <div className="card-soft">
                  <h3 style={{ marginBottom: 14 }}>学生档案详情</h3>
                  <p style={{ marginBottom: 8 }}>
                    GitHub：{searchedProfile.githubUrl || '未填写'}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    身份说明：{triField(searchedProfile as unknown as Record<string, unknown>, 'identity', locale) || '未填写'}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    审核状态：{searchedProfile.reviewStatus}
                  </p>

                  <h4 style={{ marginTop: 16, marginBottom: 8 }}>奖项</h4>
                  <ul className="list-clean">
                    {searchedProfile.awards.map((a) => (
                      <li key={String(a.id)} className="list-item">
                        {triField(a as Record<string, unknown>, 'title', locale)}
                      </li>
                    ))}
                  </ul>

                  <h4 style={{ marginTop: 16, marginBottom: 8 }}>标签</h4>
                  <ul className="list-clean">
                    {searchedProfile.tags.map((x) => {
                      const o = x as Record<string, unknown>;
                      return (
                        <li key={String(o.id)} className="list-item">
                          {triField(o, 'category', locale)} · {triField(o, 'name', locale)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            <div className="page-section">
              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>待审核档案</h3>

                {pending.length === 0 ? (
                  <div className="topbar-muted">暂无待审核档案</div>
                ) : (
                  <ul className="list-clean">
                    {pending.map((item) => (
                      <li key={String(item.user?.id)} className="list-item">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 16,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div>
                            <strong>{item.user?.name || '未命名学生'}</strong>
                            <div className="topbar-muted" style={{ marginTop: 6 }}>
                              {item.user?.email || '—'} · {item.user?.studentId || '—'}
                            </div>
                            <div className="topbar-muted" style={{ marginTop: 4 }}>
                              状态：{item.reviewStatus}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10 }}>
                            <button type="button" onClick={() => review(String(item.user?.id), true)}>
                              通过
                            </button>
                            <button
                              type="button"
                              className="logout-btn"
                              onClick={() => review(String(item.user?.id), false)}
                            >
                              拒绝
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}