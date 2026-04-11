'use client';

import { useLocale } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';
import { triField } from '@/lib/tri';

type Me = {
  id: string;
  name?: string;
  email?: string;
  role: string;
  studentId?: string;
  idCardMasked?: string | null;
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

type AdminStudentRow = {
  id: string;
  name: string;
  email: string;
  studentId?: string | null;
  idCardMasked?: string | null;
  phone?: string | null;
  reviewStatus: string;
};

type AdminStudentDetail = {
  user: {
    id: string;
    name?: string;
    email?: string;
    studentId?: string | null;
    idCard?: string | null;
    phone?: string | null;
  };
  profile: Profile;
};

export default function ProfilePage() {
  const locale = useLocale();
  const token = getToken();

  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'studentId' | 'idCard'>('name');
  const [studentDetail, setStudentDetail] = useState<AdminStudentDetail | null>(null);
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
  const [adminEdit, setAdminEdit] = useState({
    name: '',
    studentId: '',
    idCard: '',
    phone: '',
    githubUrl: '',
    identityZh: '',
    identityEn: '',
    identityRu: '',
  });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);

    try {
      const currentUser = await apiFetch<Me>('/users/me', { token });
      setMe(currentUser);

      if (currentUser.role === 'LEAGUE_ADMIN') {
        const list = await apiFetch<AdminStudentRow[]>(
          `/profile/admin/students?keyword=${encodeURIComponent(searchKeyword)}&mode=${searchMode}`,
          { token },
        );
        setStudents(Array.isArray(list) ? list : []);
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
  }, [token, searchKeyword, searchMode]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!confirmAction('确认保存档案修改吗？')) return;

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
    if (!confirmAction('确认新增该奖项吗？')) return;

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
    if (!confirmAction('确认新增该能力标签吗？')) return;

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

  async function openStudentDetail(userId: string) {
    if (!token) return;

    try {
      const detail = await apiFetch<AdminStudentDetail>(`/profile/admin/user/${userId}`, { token });
      setStudentDetail(detail);
      setAdminEdit({
        name: detail.user.name ?? '',
        studentId: detail.user.studentId ?? '',
        idCard: detail.user.idCard ?? '',
        phone: detail.user.phone ?? '',
        githubUrl: detail.profile.githubUrl ?? '',
        identityZh: detail.profile.identityZh ?? '',
        identityEn: detail.profile.identityEn ?? '',
        identityRu: detail.profile.identityRu ?? '',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '查询失败');
    }
  }

  async function saveStudentDetail() {
    if (!token || !studentDetail) return;
    if (!confirmAction('确认保存该学生档案修改吗？')) return;

    try {
      await apiFetch(`/profile/admin/user/${studentDetail.user.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(adminEdit),
      });
      setStudentDetail(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
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
          {isStudent ? '个人档案' : isOrgAdmin ? '组织管理员档案' : '学生档案管理'}
        </h1>

        <p className="page-subtitle">
          {isStudent
            ? '查看并维护个人档案、奖项与能力标签'
            : isOrgAdmin
            ? '维护个人档案并参与本组织任务协同'
            : '拉取学生档案列表并支持检索与修改'}
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
          <div className="page-section">
            <div className="card-soft" style={{ display: 'grid', gap: 12 }}>
              <h3 style={{ marginBottom: 0 }}>学生档案列表</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as 'name' | 'studentId' | 'idCard')}
                  style={{ maxWidth: 180 }}
                >
                  <option value="name">按姓名</option>
                  <option value="studentId">按学号</option>
                  <option value="idCard">按身份证</option>
                </select>
                <input
                  placeholder="输入搜索关键词"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  style={{ minWidth: 280 }}
                />
                <button type="button" onClick={load}>
                  查询
                </button>
              </div>
              <ul className="list-clean">
                {students.map((row) => (
                  <li key={row.id} className="list-item">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{row.name}</strong> · {row.studentId || '—'} · {row.idCardMasked || '—'}
                      </div>
                      <button type="button" onClick={() => openStudentDetail(row.id)}>
                        查看并修改
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!studentDetail}
        title={studentDetail ? `学生档案：${studentDetail.user.name || studentDetail.user.email}` : '学生档案'}
        onClose={() => setStudentDetail(null)}
        width={880}
      >
        {studentDetail ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">姓名</span>
                <input
                  value={adminEdit.name}
                  onChange={(e) => setAdminEdit((s) => ({ ...s, name: e.target.value }))}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">学号</span>
                <input
                  value={adminEdit.studentId}
                  onChange={(e) => setAdminEdit((s) => ({ ...s, studentId: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">身份证号（团委可见）</span>
                <input
                  value={adminEdit.idCard}
                  onChange={(e) => setAdminEdit((s) => ({ ...s, idCard: e.target.value }))}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="topbar-muted">手机号</span>
                <input
                  value={adminEdit.phone}
                  onChange={(e) => setAdminEdit((s) => ({ ...s, phone: e.target.value }))}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">GitHub</span>
              <input
                value={adminEdit.githubUrl}
                onChange={(e) => setAdminEdit((s) => ({ ...s, githubUrl: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">身份说明（中文）</span>
              <textarea
                rows={2}
                value={adminEdit.identityZh}
                onChange={(e) => setAdminEdit((s) => ({ ...s, identityZh: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">Identity (EN)</span>
              <textarea
                rows={2}
                value={adminEdit.identityEn}
                onChange={(e) => setAdminEdit((s) => ({ ...s, identityEn: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">Идентичность (RU)</span>
              <textarea
                rows={2}
                value={adminEdit.identityRu}
                onChange={(e) => setAdminEdit((s) => ({ ...s, identityRu: e.target.value }))}
              />
            </label>

            <div>
              <h4 style={{ marginBottom: 8 }}>奖项</h4>
              <ul className="list-clean">
                {studentDetail.profile.awards.map((a) => (
                  <li key={String(a.id)} className="list-item">
                    {triField(a as Record<string, unknown>, 'title', locale)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>标签</h4>
              <ul className="list-clean">
                {studentDetail.profile.tags.map((x) => {
                  const o = x as Record<string, unknown>;
                  return (
                    <li key={String(o.id)} className="list-item">
                      {triField(o, 'category', locale)} · {triField(o, 'name', locale)}
                    </li>
                  );
                })}
              </ul>
            </div>
            <button type="button" onClick={saveStudentDetail}>
              保存修改并同步
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}