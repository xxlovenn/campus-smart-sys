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
  phone?: string | null;
  grade?: string | null;
  major?: string | null;
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

type ItemRequest = {
  id: string;
  action: 'ADD' | 'DELETE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  createdAt: string;
  titleZh?: string;
  categoryZh?: string;
  nameZh?: string;
  user?: { id: string; name?: string; email?: string; studentId?: string };
};

type AdminStudentRow = {
  id: string;
  name: string;
  email: string;
  studentId?: string | null;
  idCardMasked?: string | null;
  phone?: string | null;
  grade?: string | null;
  major?: string | null;
  className?: string | null;
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
    grade?: string | null;
    major?: string | null;
    className?: string | null;
  };
  profile: Profile;
};

type MetaOptions = {
  grades: Array<{ id: string; name: string }>;
  majors: Array<{ id: string; name: string }>;
};

type GradeMajorRequest = {
  id: string;
  fromGrade?: string | null;
  fromMajor?: string | null;
  toGrade?: string | null;
  toMajor?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  user?: { id: string; name?: string; email?: string; studentId?: string };
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
  const [basic, setBasic] = useState({
    name: '',
    studentId: '',
    phone: '',
    email: '',
    grade: '',
    major: '',
    github: '',
    identity: '',
  });
  const [metaOptions, setMetaOptions] = useState<MetaOptions>({ grades: [], majors: [] });
  const [picker, setPicker] = useState<{ open: boolean; kind: 'grade' | 'major' }>({
    open: false,
    kind: 'grade',
  });
  const [awardInput, setAwardInput] = useState({ title: '', proof: '' });
  const [tagInput, setTagInput] = useState({ category: '', name: '' });
  const [myAwardRequests, setMyAwardRequests] = useState<ItemRequest[]>([]);
  const [myTagRequests, setMyTagRequests] = useState<ItemRequest[]>([]);
  const [pendingAwardRequests, setPendingAwardRequests] = useState<ItemRequest[]>([]);
  const [pendingTagRequests, setPendingTagRequests] = useState<ItemRequest[]>([]);
  const [myGradeMajorRequests, setMyGradeMajorRequests] = useState<GradeMajorRequest[]>([]);
  const [pendingGradeMajorRequests, setPendingGradeMajorRequests] = useState<GradeMajorRequest[]>([]);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});
  const [adminEdit, setAdminEdit] = useState({
    name: '',
    studentId: '',
    idCard: '',
    phone: '',
    grade: '',
    major: '',
    className: '',
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
        const [list, pending, pendingGradeMajor] = await Promise.all([
          apiFetch<AdminStudentRow[]>(
            `/profile/admin/students?keyword=${encodeURIComponent(searchKeyword)}&mode=${searchMode}`,
            { token },
          ),
          apiFetch<{ awardRequests: ItemRequest[]; tagRequests: ItemRequest[] }>(
            '/profile/admin/item-requests/pending',
            { token },
          ),
          apiFetch<GradeMajorRequest[]>('/profile/admin/grade-major-requests/pending', { token }),
        ]);
        setStudents(Array.isArray(list) ? list : []);
        setPendingAwardRequests(Array.isArray(pending.awardRequests) ? pending.awardRequests : []);
        setPendingTagRequests(Array.isArray(pending.tagRequests) ? pending.tagRequests : []);
        setPendingGradeMajorRequests(Array.isArray(pendingGradeMajor) ? pendingGradeMajor : []);
        setMyAwardRequests([]);
        setMyTagRequests([]);
        setMyGradeMajorRequests([]);
        setProfile(null);
        return;
      }

      const [prof, requests, options, gradeMajorRequests] = await Promise.all([
        apiFetch<Profile>('/profile/me', { token }),
        apiFetch<{ awardRequests: ItemRequest[]; tagRequests: ItemRequest[] }>('/profile/me/requests', {
          token,
        }),
        apiFetch<MetaOptions>('/profile/options', { token }),
        apiFetch<GradeMajorRequest[]>('/profile/me/grade-major-requests', { token }),
      ]);
      setProfile(prof);
      setBasic({
        name: currentUser.name ?? '',
        studentId: currentUser.studentId ?? '',
        phone: currentUser.phone ?? '',
        email: currentUser.email ?? '',
        grade: currentUser.grade ?? '',
        major: currentUser.major ?? '',
        github: prof.githubUrl ?? '',
        identity: prof.identityZh ?? prof.identityEn ?? prof.identityRu ?? '',
      });
      setMetaOptions({
        grades: Array.isArray(options.grades) ? options.grades : [],
        majors: Array.isArray(options.majors) ? options.majors : [],
      });
      setMyAwardRequests(Array.isArray(requests.awardRequests) ? requests.awardRequests : []);
      setMyTagRequests(Array.isArray(requests.tagRequests) ? requests.tagRequests : []);
      setMyGradeMajorRequests(Array.isArray(gradeMajorRequests) ? gradeMajorRequests : []);
      setPendingAwardRequests([]);
      setPendingTagRequests([]);
      setPendingGradeMajorRequests([]);
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
    if (!confirmAction('确认保存基础信息吗？')) return;
    try {
      await apiFetch('/profile/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name: basic.name,
          studentId: basic.studentId,
          phone: basic.phone,
          email: basic.email,
          githubUrl: basic.github,
          identityZh: basic.identity,
          identityEn: basic.identity,
          identityRu: basic.identity,
        }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function submitGradeMajorReviewRequest() {
    if (!token) return;
    if (!confirmAction('确认提交年级/专业修改申请吗？提交后需经团委审核通过方可生效。')) return;
    try {
      await apiFetch('/profile/me/grade-major-request', {
        method: 'POST',
        token,
        body: JSON.stringify({
          grade: basic.grade || undefined,
          major: basic.major || undefined,
        }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交申请失败');
    }
  }

  async function addAwardRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!confirmAction('确认提交奖项添加审核申请吗？')) return;
    try {
      await apiFetch('/profile/awards', {
        method: 'POST',
        token,
        body: JSON.stringify({
          titleZh: awardInput.title,
          titleEn: awardInput.title,
          titleRu: awardInput.title,
          proofUrl: awardInput.proof || undefined,
        }),
      });
      setAwardInput({ title: '', proof: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交申请失败');
    }
  }

  async function addTagRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!confirmAction('确认提交标签添加审核申请吗？')) return;
    try {
      await apiFetch('/profile/tags', {
        method: 'POST',
        token,
        body: JSON.stringify({
          categoryZh: tagInput.category,
          categoryEn: tagInput.category,
          categoryRu: tagInput.category,
          nameZh: tagInput.name,
          nameEn: tagInput.name,
          nameRu: tagInput.name,
        }),
      });
      setTagInput({ category: '', name: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交申请失败');
    }
  }

  async function requestDeleteAward(awardId: string) {
    if (!token) return;
    if (!confirmAction('确认申请删除该奖项吗？需团委审核通过后生效。')) return;
    try {
      await apiFetch(`/profile/awards/${awardId}`, { method: 'DELETE', token });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交删除申请失败');
    }
  }

  async function requestDeleteTag(tagId: string) {
    if (!token) return;
    if (!confirmAction('确认申请删除该标签吗？需团委审核通过后生效。')) return;
    try {
      await apiFetch(`/profile/tags/${tagId}`, { method: 'DELETE', token });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交删除申请失败');
    }
  }

  async function reviewItem(kind: 'awards' | 'tags', id: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? '确认通过该申请吗？' : '确认驳回该申请吗？')) return;
    try {
      await apiFetch(`/profile/admin/item-requests/${kind}/${id}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          approve,
          reason: approve ? undefined : reviewReason[id] || undefined,
        }),
      });
      setReviewReason((s) => ({ ...s, [id]: '' }));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '审核失败');
    }
  }

  async function reviewGradeMajorRequest(id: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? '确认通过该年级/专业变更申请吗？' : '确认驳回该年级/专业变更申请吗？')) return;
    try {
      await apiFetch(`/profile/admin/grade-major-requests/${id}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          approve,
          reason: approve ? undefined : reviewReason[id] || undefined,
        }),
      });
      setReviewReason((s) => ({ ...s, [id]: '' }));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '审核失败');
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
        grade: detail.user.grade ?? '',
        major: detail.user.major ?? '',
        className: detail.user.className ?? '',
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
  const isLeagueAdmin = me.role === 'LEAGUE_ADMIN';

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">{isLeagueAdmin ? '学生档案管理' : '个人档案'}</h1>
        <p className="page-subtitle">
          {isLeagueAdmin
            ? '审核学生档案与奖项/标签变更申请'
            : '基础信息直接保存；奖项荣誉与能力标签需提交团委审核后生效'}
        </p>

        {err && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
            {err}
          </div>
        )}

        {!isLeagueAdmin && profile ? (
          <>
            <div className="page-section">
              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>基础信息</h3>
                <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10, maxWidth: 700 }}>
                  <div className="grid-two">
                    <input placeholder="姓名" value={basic.name} onChange={(e) => setBasic((s) => ({ ...s, name: e.target.value }))} />
                    <input placeholder="学号" value={basic.studentId} onChange={(e) => setBasic((s) => ({ ...s, studentId: e.target.value }))} />
                  </div>
                  <div className="grid-two">
                    <input placeholder="手机号" value={basic.phone} onChange={(e) => setBasic((s) => ({ ...s, phone: e.target.value }))} />
                    <input placeholder="邮箱" value={basic.email} onChange={(e) => setBasic((s) => ({ ...s, email: e.target.value }))} />
                  </div>
                  <div className="grid-two">
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="topbar-muted">年级</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={basic.grade ? `${basic.grade}级` : ''}
                          placeholder="请选择年级"
                          readOnly
                        />
                        <button
                          type="button"
                          onClick={() => setPicker({ open: true, kind: 'grade' })}
                        >
                          选择
                        </button>
                      </div>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="topbar-muted">专业</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={basic.major} placeholder="请选择专业" readOnly />
                        <button
                          type="button"
                          onClick={() => setPicker({ open: true, kind: 'major' })}
                        >
                          选择
                        </button>
                      </div>
                    </label>
                  </div>
                  <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                    <div className="topbar-muted">
                      年级/专业修改需二次确认并提交团委审核，通过后生效。
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={submitGradeMajorReviewRequest}>
                        提交年级/专业审核申请
                      </button>
                    </div>
                  </div>
                  <input placeholder="GitHub" value={basic.github} onChange={(e) => setBasic((s) => ({ ...s, github: e.target.value }))} />
                  <textarea rows={2} placeholder="身份信息（单语输入，自动互通多语言）" value={basic.identity} onChange={(e) => setBasic((s) => ({ ...s, identity: e.target.value }))} />
                  <button type="submit">保存基础信息</button>
                </form>
              </div>
            </div>

            <div className="grid-two">
              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>奖项荣誉管理</h3>
                <form onSubmit={addAwardRequest} style={{ display: 'grid', gap: 10 }}>
                  <input placeholder="奖项名称（单语输入，多语言互通）" value={awardInput.title} onChange={(e) => setAwardInput((s) => ({ ...s, title: e.target.value }))} required />
                  <input placeholder="证明链接（可选）" value={awardInput.proof} onChange={(e) => setAwardInput((s) => ({ ...s, proof: e.target.value }))} />
                  <button type="submit">提交新增申请</button>
                </form>
                <ul className="list-clean" style={{ marginTop: 16 }}>
                  {profile.awards.map((a) => (
                    <li key={String(a.id)} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{triField(a as Record<string, unknown>, 'title', locale)}</span>
                      <button type="button" className="logout-btn" onClick={() => requestDeleteAward(String((a as Record<string, unknown>).id || ''))}>申请删除</button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-soft">
                <h3 style={{ marginBottom: 14 }}>能力标签管理</h3>
                <form onSubmit={addTagRequest} style={{ display: 'grid', gap: 10 }}>
                  <input placeholder="标签分类（单语输入，多语言互通）" value={tagInput.category} onChange={(e) => setTagInput((s) => ({ ...s, category: e.target.value }))} required />
                  <input placeholder="标签名称（单语输入，多语言互通）" value={tagInput.name} onChange={(e) => setTagInput((s) => ({ ...s, name: e.target.value }))} required />
                  <button type="submit">提交新增申请</button>
                </form>
                <ul className="list-clean" style={{ marginTop: 16 }}>
                  {profile.tags.map((x) => {
                    const o = x as Record<string, unknown>;
                    return (
                      <li key={String(o.id)} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{triField(o, 'category', locale)} · {triField(o, 'name', locale)}</span>
                        <button type="button" className="logout-btn" onClick={() => requestDeleteTag(String(o.id || ''))}>申请删除</button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="page-section">
              <div className="card-soft">
                <h3 style={{ marginBottom: 12 }}>我的档案变更申请记录</h3>
                <ul className="list-clean">
                  {myGradeMajorRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      年级/专业 · {(r.fromGrade || '未设置') + '级 / ' + (r.fromMajor || '未设置')} → {(r.toGrade || '未设置') + '级 / ' + (r.toMajor || '未设置')} · {r.status}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </li>
                  ))}
                  {myAwardRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      奖项 · {r.action === 'ADD' ? '新增' : '删除'} · {r.titleZh || '—'} · {r.status}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </li>
                  ))}
                  {myTagRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      标签 · {r.action === 'ADD' ? '新增' : '删除'} · {(r.categoryZh || '—') + ' / ' + (r.nameZh || '—')} · {r.status}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </li>
                  ))}
                  {myGradeMajorRequests.length + myAwardRequests.length + myTagRequests.length === 0 ? (
                    <li className="list-item">暂无申请记录</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </>
        ) : null}

        {isLeagueAdmin && (
          <>
            <div className="page-section">
              <div className="card-soft" style={{ display: 'grid', gap: 12 }}>
                <h3 style={{ marginBottom: 0 }}>档案变更审核（年级专业 / 奖项 / 标签）</h3>
                <ul className="list-clean">
                  {pendingGradeMajorRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div>
                          <strong>{r.user?.name || r.user?.email || '学生'}</strong> · 年级/专业变更 ·
                          {(r.fromGrade || '未设置') + '级 / ' + (r.fromMajor || '未设置')} → {(r.toGrade || '未设置') + '级 / ' + (r.toMajor || '未设置')}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder="驳回原因（可选）" value={reviewReason[r.id] ?? ''} onChange={(e) => setReviewReason((s) => ({ ...s, [r.id]: e.target.value }))} style={{ flex: 1 }} />
                          <button type="button" onClick={() => reviewGradeMajorRequest(r.id, true)}>通过</button>
                          <button type="button" className="logout-btn" onClick={() => reviewGradeMajorRequest(r.id, false)}>驳回</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {pendingAwardRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div><strong>{r.user?.name || r.user?.email || '学生'}</strong> · 奖项{r.action === 'ADD' ? '新增' : '删除'} · {r.titleZh || '—'}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder="驳回原因（可选）" value={reviewReason[r.id] ?? ''} onChange={(e) => setReviewReason((s) => ({ ...s, [r.id]: e.target.value }))} style={{ flex: 1 }} />
                          <button type="button" onClick={() => reviewItem('awards', r.id, true)}>通过</button>
                          <button type="button" className="logout-btn" onClick={() => reviewItem('awards', r.id, false)}>驳回</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {pendingTagRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div><strong>{r.user?.name || r.user?.email || '学生'}</strong> · 标签{r.action === 'ADD' ? '新增' : '删除'} · {(r.categoryZh || '—') + ' / ' + (r.nameZh || '—')}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder="驳回原因（可选）" value={reviewReason[r.id] ?? ''} onChange={(e) => setReviewReason((s) => ({ ...s, [r.id]: e.target.value }))} style={{ flex: 1 }} />
                          <button type="button" onClick={() => reviewItem('tags', r.id, true)}>通过</button>
                          <button type="button" className="logout-btn" onClick={() => reviewItem('tags', r.id, false)}>驳回</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {pendingGradeMajorRequests.length + pendingAwardRequests.length + pendingTagRequests.length === 0 ? (
                    <li className="list-item">暂无待审核申请</li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="page-section">
              <div className="card-soft" style={{ display: 'grid', gap: 12 }}>
                <h3 style={{ marginBottom: 0 }}>学生档案列表</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <select value={searchMode} onChange={(e) => setSearchMode(e.target.value as 'name' | 'studentId' | 'idCard')} style={{ maxWidth: 180 }}>
                    <option value="name">按姓名</option>
                    <option value="studentId">按学号</option>
                    <option value="idCard">按身份证</option>
                  </select>
                  <input placeholder="输入搜索关键词" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} style={{ minWidth: 280 }} />
                  <button type="button" onClick={load}>查询</button>
                </div>
                <ul className="list-clean">
                  {students.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div><strong>{row.name}</strong> · {row.studentId || '—'} · {row.idCardMasked || '—'} · {row.grade || '—'}级/{row.major || '—'}/{row.className || '—'}</div>
                        <button type="button" onClick={() => openStudentDetail(row.id)}>查看并修改</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={!!studentDetail} title={studentDetail ? `学生档案：${studentDetail.user.name || studentDetail.user.email}` : '学生档案'} onClose={() => setStudentDetail(null)} width={880}>
        {studentDetail ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">姓名</span><input value={adminEdit.name} onChange={(e) => setAdminEdit((s) => ({ ...s, name: e.target.value }))} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">学号</span><input value={adminEdit.studentId} onChange={(e) => setAdminEdit((s) => ({ ...s, studentId: e.target.value }))} /></label>
            </div>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">身份证号（团委可见）</span><input value={adminEdit.idCard} onChange={(e) => setAdminEdit((s) => ({ ...s, idCard: e.target.value }))} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">手机号</span><input value={adminEdit.phone} onChange={(e) => setAdminEdit((s) => ({ ...s, phone: e.target.value }))} /></label>
            </div>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">年级</span><input value={adminEdit.grade} onChange={(e) => setAdminEdit((s) => ({ ...s, grade: e.target.value }))} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">专业</span><input value={adminEdit.major} onChange={(e) => setAdminEdit((s) => ({ ...s, major: e.target.value }))} /></label>
            </div>
            <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">班级</span><input value={adminEdit.className} onChange={(e) => setAdminEdit((s) => ({ ...s, className: e.target.value }))} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">GitHub</span><input value={adminEdit.githubUrl} onChange={(e) => setAdminEdit((s) => ({ ...s, githubUrl: e.target.value }))} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">身份信息（单语输入）</span><textarea rows={2} value={adminEdit.identityZh} onChange={(e) => setAdminEdit((s) => ({ ...s, identityZh: e.target.value, identityEn: e.target.value, identityRu: e.target.value }))} /></label>

            <div><h4 style={{ marginBottom: 8 }}>奖项</h4><ul className="list-clean">{studentDetail.profile.awards.map((a) => <li key={String(a.id)} className="list-item">{triField(a as Record<string, unknown>, 'title', locale)}</li>)}</ul></div>
            <div><h4 style={{ marginBottom: 8 }}>标签</h4><ul className="list-clean">{studentDetail.profile.tags.map((x) => { const o = x as Record<string, unknown>; return <li key={String(o.id)} className="list-item">{triField(o, 'category', locale)} · {triField(o, 'name', locale)}</li>; })}</ul></div>
            <button type="button" onClick={saveStudentDetail}>保存修改并同步</button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={picker.open}
        title={picker.kind === 'grade' ? '选择年级（单位：级）' : '选择专业'}
        onClose={() => setPicker((s) => ({ ...s, open: false }))}
        width={560}
      >
        <ul className="list-clean">
          {(picker.kind === 'grade' ? metaOptions.grades : metaOptions.majors).map((item) => (
            <li key={item.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{picker.kind === 'grade' ? `${item.name}级` : item.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (picker.kind === 'grade') {
                    setBasic((s) => ({ ...s, grade: item.name }));
                  } else {
                    setBasic((s) => ({ ...s, major: item.name }));
                  }
                  setPicker((s) => ({ ...s, open: false }));
                }}
              >
                选择
              </button>
            </li>
          ))}
          {(picker.kind === 'grade' ? metaOptions.grades.length : metaOptions.majors.length) === 0 ? (
            <li className="list-item">暂无可选项，请联系团委先创建年级/专业标签。</li>
          ) : null}
        </ul>
      </Modal>
    </div>
  );
}