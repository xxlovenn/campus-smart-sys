'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

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
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { id: string; name?: string; email?: string } | null;
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

function profileStatusBadge(
  status: string | undefined,
  labels: { approved: string; rejected: string; pending: string },
) {
  if (status === 'APPROVED') return { className: 'badge badge-green', label: labels.approved };
  if (status === 'REJECTED') return { className: 'badge badge-red', label: labels.rejected };
  return { className: 'badge badge-yellow', label: labels.pending };
}

export default function ProfilePage() {
  const locale = useLocale();
  const tp = useTranslations('profile');
  const t = useTranslations('profile.center');
  const { token, ready } = useAuthGuard();
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
      setErr(e instanceof Error ? e.message : tp('errors.load'));
    }
  }, [token, searchKeyword, searchMode, tp]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!confirmAction(tp('confirm.saveBasic'))) return;
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
      setErr(e instanceof Error ? e.message : tp('errors.save'));
    }
  }

  async function submitGradeMajorReviewRequest() {
    if (!token) return;
    if (!confirmAction(tp('confirm.submitGradeMajor'))) return;
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
      setErr(e instanceof Error ? e.message : tp('errors.submitRequest'));
    }
  }

  async function submitProfileForReview() {
    if (!token) return;
    if (!confirmAction(tp('confirm.submitProfile'))) return;
    try {
      await apiFetch('/profile/me/submit', {
        method: 'POST',
        token,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tp('errors.submitReview'));
    }
  }

  async function addAwardRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!confirmAction(tp('confirm.submitAward'))) return;
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
      setErr(e instanceof Error ? e.message : tp('errors.submitRequest'));
    }
  }

  async function addTagRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!confirmAction(tp('confirm.submitTag'))) return;
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
      setErr(e instanceof Error ? e.message : tp('errors.submitRequest'));
    }
  }

  async function requestDeleteAward(awardId: string) {
    if (!token) return;
    if (!confirmAction(tp('confirm.deleteAward'))) return;
    try {
      await apiFetch(`/profile/awards/${awardId}`, { method: 'DELETE', token });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tp('errors.deleteRequest'));
    }
  }

  async function requestDeleteTag(tagId: string) {
    if (!token) return;
    if (!confirmAction(tp('confirm.deleteTag'))) return;
    try {
      await apiFetch(`/profile/tags/${tagId}`, { method: 'DELETE', token });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tp('errors.deleteRequest'));
    }
  }

  async function reviewItem(kind: 'awards' | 'tags', id: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? tp('confirm.approveRequest') : tp('confirm.rejectRequest'))) return;
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
      setErr(e instanceof Error ? e.message : tp('errors.review'));
    }
  }

  async function reviewGradeMajorRequest(id: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? tp('confirm.approveGradeMajor') : tp('confirm.rejectGradeMajor'))) return;
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
      setErr(e instanceof Error ? e.message : tp('errors.review'));
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
      setErr(e instanceof Error ? e.message : tp('errors.query'));
    }
  }

  async function saveStudentDetail() {
    if (!token || !studentDetail) return;
    if (!confirmAction(tp('confirm.saveStudent'))) return;
    try {
      await apiFetch(`/profile/admin/user/${studentDetail.user.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(adminEdit),
      });
      setStudentDetail(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tp('errors.save'));
    }
  }

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">{tp('loadingAuth')}</p>
      </div>
    );
  }
  if (!me) return null;
  const isLeagueAdmin = me.role === 'LEAGUE_ADMIN';
  const statusMeta = profileStatusBadge(profile?.reviewStatus, {
    approved: tp('status.approved'),
    rejected: tp('status.rejected'),
    pending: tp('status.pending'),
  });
  const profileCompleteness = (() => {
    const total = 8;
    const checks = [
      !!basic.name.trim(),
      !!basic.studentId.trim(),
      !!basic.phone.trim(),
      !!basic.email.trim(),
      !!basic.grade.trim(),
      !!basic.major.trim(),
      !!basic.github.trim(),
      !!basic.identity.trim(),
    ];
    const done = checks.filter(Boolean).length;
    return { done, total, percent: Math.round((done / total) * 100) };
  })();
  const archiveSuggestions = (() => {
    const tips: string[] = [];
    if (!basic.identity.trim()) tips.push(tp('tips.identity'));
    if (profile?.awards.length === 0) tips.push(tp('tips.awards'));
    if (profile?.tags.length === 0) tips.push(tp('tips.tags'));
    if (!basic.github.trim()) tips.push(tp('tips.github'));
    return tips.slice(0, 3);
  })();
  const latestRequests = (() => {
    const rows = [
      ...myGradeMajorRequests.map((r) => ({
        id: `gm-${r.id}`,
        title: tp('latest.gradeMajor', {
          from: (r.fromGrade || tp('labels.unset')) + tp('labels.gradeSuffix') + ' / ' + (r.fromMajor || tp('labels.unset')),
          to: (r.toGrade || tp('labels.unset')) + tp('labels.gradeSuffix') + ' / ' + (r.toMajor || tp('labels.unset')),
        }),
        status: r.status,
        reason: r.reason,
      })),
      ...myAwardRequests.map((r) => ({
        id: `award-${r.id}`,
        title: tp('latest.award', {
          action: r.action === 'ADD' ? tp('labels.add') : tp('labels.remove'),
          title: r.titleZh || '—',
        }),
        status: r.status,
        reason: r.reason,
      })),
      ...myTagRequests.map((r) => ({
        id: `tag-${r.id}`,
        title: tp('latest.tag', {
          action: r.action === 'ADD' ? tp('labels.add') : tp('labels.remove'),
          category: r.categoryZh || '—',
          name: r.nameZh || '—',
        }),
        status: r.status,
        reason: r.reason,
      })),
    ];
    return rows.slice(0, 10);
  })();

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">{isLeagueAdmin ? tp('admin.title') : tp('user.title')}</h1>
        <p className="page-subtitle">
          {isLeagueAdmin
            ? tp('admin.subtitle')
            : t('subtitle')}
        </p>

        {err && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
            {err}
          </div>
        )}

        {!isLeagueAdmin && profile ? (
          <>
            <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{t('overviewTitle')}</h3>
                  <p className="topbar-muted" style={{ margin: 0 }}>
                    {t('overviewDesc')}
                  </p>
                </div>
                <span className={statusMeta.className}>{statusMeta.label}</span>
              </div>
              <div className="dashboard-stats-grid">
                <div className="dashboard-stat-card">
                  <div className="topbar-muted">{t('stats.completeness')}</div>
                  <strong className="dashboard-stat-value">{profileCompleteness.percent}%</strong>
                  <div className="topbar-muted">{tp('labels.itemsCount', { done: profileCompleteness.done, total: profileCompleteness.total })}</div>
                </div>
                <div className="dashboard-stat-card">
                  <div className="topbar-muted">{t('stats.submittedAt')}</div>
                  <strong className="dashboard-stat-value" style={{ fontSize: 18 }}>{profile.submittedAt ? new Date(profile.submittedAt).toLocaleString() : tp('labels.notSubmitted')}</strong>
                </div>
                <div className="dashboard-stat-card">
                  <div className="topbar-muted">{t('stats.reviewedAt')}</div>
                  <strong className="dashboard-stat-value" style={{ fontSize: 18 }}>{profile.reviewedAt ? new Date(profile.reviewedAt).toLocaleString() : tp('labels.notReviewed')}</strong>
                </div>
                <div className="dashboard-stat-card">
                  <div className="topbar-muted">{t('stats.materials')}</div>
                  <strong className="dashboard-stat-value">{profile.awards.length + profile.tags.length}</strong>
                  <div className="topbar-muted">{t('stats.materialSplit', { awards: profile.awards.length, tags: profile.tags.length })}</div>
                </div>
              </div>
              {archiveSuggestions.length > 0 ? (
                <div className="card-soft" style={{ display: 'grid', gap: 6 }}>
                  <strong>{t('suggestionsTitle')}</strong>
                  <ul className="list-clean">
                    {archiveSuggestions.map((tip) => (
                      <li key={tip} className="list-item">{tip}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={submitProfileForReview}>{t('actions.submitProfile')}</button>
                <button type="button" onClick={submitGradeMajorReviewRequest}>{t('actions.submitGradeMajor')}</button>
              </div>
            </section>

            <div className="grid-two">
              <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
                <h3 style={{ margin: 0 }}>{t('modules.basic')}</h3>
                <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
                  <div className="grid-two">
                    <input placeholder={tp('fields.name')} value={basic.name} onChange={(e) => setBasic((s) => ({ ...s, name: e.target.value }))} />
                    <input placeholder={tp('fields.studentId')} value={basic.studentId} onChange={(e) => setBasic((s) => ({ ...s, studentId: e.target.value }))} />
                  </div>
                  <div className="grid-two">
                    <input placeholder={tp('fields.phone')} value={basic.phone} onChange={(e) => setBasic((s) => ({ ...s, phone: e.target.value }))} />
                    <input placeholder={tp('fields.email')} value={basic.email} onChange={(e) => setBasic((s) => ({ ...s, email: e.target.value }))} />
                  </div>
                  <div className="grid-two">
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="topbar-muted">{tp('fields.grade')}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={basic.grade ? `${basic.grade}${tp('labels.gradeSuffix')}` : ''} placeholder={tp('fields.chooseGrade')} readOnly />
                        <button type="button" onClick={() => setPicker({ open: true, kind: 'grade' })}>{tp('actions.select')}</button>
                      </div>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="topbar-muted">{tp('fields.major')}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={basic.major} placeholder={tp('fields.chooseMajor')} readOnly />
                        <button type="button" onClick={() => setPicker({ open: true, kind: 'major' })}>{tp('actions.select')}</button>
                      </div>
                    </label>
                  </div>
                  <input placeholder="GitHub" value={basic.github} onChange={(e) => setBasic((s) => ({ ...s, github: e.target.value }))} />
                  <button type="submit">{t('actions.saveDraft')}</button>
                </form>
              </section>

              <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
                <h3 style={{ margin: 0 }}>{t('modules.identity')}</h3>
                <textarea
                  rows={4}
                  placeholder={tp('fields.identityPlaceholder')}
                  value={basic.identity}
                  onChange={(e) => setBasic((s) => ({ ...s, identity: e.target.value }))}
                />
                <p className="topbar-muted" style={{ margin: 0 }}>
                  {tp('identityHint')}
                </p>
              </section>
            </div>

            <div className="grid-two">
              <section className="card-soft" style={{ display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{t('modules.practice')}</h3>
                <p className="topbar-muted" style={{ margin: 0 }}>
                  {tp('practiceHint')}
                </p>
                <div className="topbar-muted">{tp('practiceSuggestion')}</div>
              </section>

              <section className="card-soft" style={{ display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{t('modules.tags')}</h3>
                <form onSubmit={addTagRequest} style={{ display: 'grid', gap: 10 }}>
                  <input placeholder={tp('fields.tagCategory')} value={tagInput.category} onChange={(e) => setTagInput((s) => ({ ...s, category: e.target.value }))} required />
                  <input placeholder={tp('fields.tagName')} value={tagInput.name} onChange={(e) => setTagInput((s) => ({ ...s, name: e.target.value }))} required />
                  <button type="submit">{t('actions.submitTag')}</button>
                </form>
                <ul className="list-clean">
                  {profile.tags.map((x) => {
                    const o = x as Record<string, unknown>;
                    return (
                      <li key={String(o.id)} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{triField(o, 'category', locale)} · {triField(o, 'name', locale)}</span>
                        <button type="button" className="logout-btn" onClick={() => requestDeleteTag(String(o.id || ''))}>{tp('actions.requestDelete')}</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <div className="grid-two">
              <section className="card-soft" style={{ display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{t('modules.awards')}</h3>
                <form onSubmit={addAwardRequest} style={{ display: 'grid', gap: 10 }}>
                  <input placeholder={tp('fields.awardTitle')} value={awardInput.title} onChange={(e) => setAwardInput((s) => ({ ...s, title: e.target.value }))} required />
                  <input placeholder={tp('fields.proofUrl')} value={awardInput.proof} onChange={(e) => setAwardInput((s) => ({ ...s, proof: e.target.value }))} />
                  <button type="submit">{t('actions.submitAward')}</button>
                </form>
                <ul className="list-clean">
                  {profile.awards.map((a) => (
                    <li key={String(a.id)} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{triField(a as Record<string, unknown>, 'title', locale)}</span>
                      <button type="button" className="logout-btn" onClick={() => requestDeleteAward(String((a as Record<string, unknown>).id || ''))}>{tp('actions.requestDelete')}</button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card-soft" style={{ display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{t('modules.feedback')}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                  <span className="topbar-muted">
                    {tp('labels.reviewer')}：{profile.reviewedBy?.name || profile.reviewedBy?.email || '—'}
                  </span>
                </div>
                <div className="topbar-muted">
                  {tp('labels.submittedAt')}：{profile.submittedAt ? new Date(profile.submittedAt).toLocaleString() : '—'}
                </div>
                <div className="topbar-muted">
                  {tp('labels.reviewedAt')}：{profile.reviewedAt ? new Date(profile.reviewedAt).toLocaleString() : '—'}
                </div>
                {profile.rejectReason ? (
                  <div className="card-soft" style={{ border: '1px solid #fecaca', color: '#b91c1c' }}>
                    {tp('labels.rejectReason')}：{profile.rejectReason}
                  </div>
                ) : null}
                <strong>{tp('latest.title')}</strong>
                <ul className="list-clean">
                  {latestRequests.length === 0 ? (
                    <li className="list-item">{tp('latest.empty')}</li>
                  ) : (
                    latestRequests.map((row) => (
                      <li key={row.id} className="list-item">
                        {row.title} · {row.status}
                        {row.reason ? ` · ${row.reason}` : ''}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          </>
        ) : null}

        {isLeagueAdmin && (
          <>
            <div className="page-section">
              <div className="card-soft" style={{ display: 'grid', gap: 12 }}>
                <h3 style={{ marginBottom: 0 }}>{tp('admin.reviewSection')}</h3>
                <ul className="list-clean">
                  {pendingGradeMajorRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div>
                          <strong>{r.user?.name || r.user?.email || tp('labels.student')}</strong> · {tp('admin.gradeMajorChange')} ·
                          {(r.fromGrade || tp('labels.unset')) + tp('labels.gradeSuffix') + ' / ' + (r.fromMajor || tp('labels.unset'))} → {(r.toGrade || tp('labels.unset')) + tp('labels.gradeSuffix') + ' / ' + (r.toMajor || tp('labels.unset'))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder={tp('fields.rejectReasonOptional')} value={reviewReason[r.id] ?? ''} onChange={(e) => setReviewReason((s) => ({ ...s, [r.id]: e.target.value }))} style={{ flex: 1 }} />
                          <button type="button" onClick={() => reviewGradeMajorRequest(r.id, true)}>{tp('actions.approve')}</button>
                          <button type="button" className="logout-btn" onClick={() => reviewGradeMajorRequest(r.id, false)}>{tp('actions.reject')}</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {pendingAwardRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div><strong>{r.user?.name || r.user?.email || tp('labels.student')}</strong> · {tp('labels.award')}{r.action === 'ADD' ? tp('labels.add') : tp('labels.remove')} · {r.titleZh || '—'}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder={tp('fields.rejectReasonOptional')} value={reviewReason[r.id] ?? ''} onChange={(e) => setReviewReason((s) => ({ ...s, [r.id]: e.target.value }))} style={{ flex: 1 }} />
                          <button type="button" onClick={() => reviewItem('awards', r.id, true)}>{tp('actions.approve')}</button>
                          <button type="button" className="logout-btn" onClick={() => reviewItem('awards', r.id, false)}>{tp('actions.reject')}</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {pendingTagRequests.map((r) => (
                    <li key={r.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div><strong>{r.user?.name || r.user?.email || tp('labels.student')}</strong> · {tp('labels.tag')}{r.action === 'ADD' ? tp('labels.add') : tp('labels.remove')} · {(r.categoryZh || '—') + ' / ' + (r.nameZh || '—')}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder={tp('fields.rejectReasonOptional')} value={reviewReason[r.id] ?? ''} onChange={(e) => setReviewReason((s) => ({ ...s, [r.id]: e.target.value }))} style={{ flex: 1 }} />
                          <button type="button" onClick={() => reviewItem('tags', r.id, true)}>{tp('actions.approve')}</button>
                          <button type="button" className="logout-btn" onClick={() => reviewItem('tags', r.id, false)}>{tp('actions.reject')}</button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {pendingGradeMajorRequests.length + pendingAwardRequests.length + pendingTagRequests.length === 0 ? (
                    <li className="list-item">{tp('admin.noPending')}</li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="page-section">
              <div className="card-soft" style={{ display: 'grid', gap: 12 }}>
                <h3 style={{ marginBottom: 0 }}>{tp('admin.searchTitle')}</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <select value={searchMode} onChange={(e) => setSearchMode(e.target.value as 'name' | 'studentId' | 'idCard')} style={{ maxWidth: 180 }}>
                    <option value="name">{tp('admin.searchByName')}</option>
                    <option value="studentId">{tp('admin.searchByStudentId')}</option>
                    <option value="idCard">{tp('admin.searchByIdCard')}</option>
                  </select>
                  <input placeholder={tp('admin.searchPlaceholder')} value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} style={{ minWidth: 280 }} />
                  <button type="button" onClick={load}>{tp('actions.search')}</button>
                </div>
                <ul className="list-clean">
                  {students.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div><strong>{row.name}</strong> · {row.studentId || '—'} · {row.idCardMasked || '—'} · {row.grade || '—'}{tp('labels.gradeSuffix')}/{row.major || '—'}/{row.className || '—'}</div>
                        <button type="button" onClick={() => openStudentDetail(row.id)}>{tp('actions.viewAndEdit')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={!!studentDetail}
        title={
          studentDetail
            ? tp('admin.modalTitleWithName', { name: studentDetail.user.name || studentDetail.user.email || '—' })
            : tp('admin.modalTitle')
        }
        onClose={() => setStudentDetail(null)}
        width={880}
      >
        {studentDetail ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.name')}</span><input value={adminEdit.name} onChange={(e) => setAdminEdit((s) => ({ ...s, name: e.target.value }))} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.studentId')}</span><input value={adminEdit.studentId} onChange={(e) => setAdminEdit((s) => ({ ...s, studentId: e.target.value }))} /></label>
            </div>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.idCard')}</span><input value={adminEdit.idCard} onChange={(e) => setAdminEdit((s) => ({ ...s, idCard: e.target.value }))} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.phone')}</span><input value={adminEdit.phone} onChange={(e) => setAdminEdit((s) => ({ ...s, phone: e.target.value }))} /></label>
            </div>
            <div className="grid-two">
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.grade')}</span><input value={adminEdit.grade} onChange={(e) => setAdminEdit((s) => ({ ...s, grade: e.target.value }))} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.major')}</span><input value={adminEdit.major} onChange={(e) => setAdminEdit((s) => ({ ...s, major: e.target.value }))} /></label>
            </div>
            <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.className')}</span><input value={adminEdit.className} onChange={(e) => setAdminEdit((s) => ({ ...s, className: e.target.value }))} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">GitHub</span><input value={adminEdit.githubUrl} onChange={(e) => setAdminEdit((s) => ({ ...s, githubUrl: e.target.value }))} /></label>
            <label style={{ display: 'grid', gap: 6 }}><span className="topbar-muted">{tp('fields.identitySingle')}</span><textarea rows={2} value={adminEdit.identityZh} onChange={(e) => setAdminEdit((s) => ({ ...s, identityZh: e.target.value, identityEn: e.target.value, identityRu: e.target.value }))} /></label>

            <div><h4 style={{ marginBottom: 8 }}>{tp('labels.award')}</h4><ul className="list-clean">{studentDetail.profile.awards.map((a) => <li key={String(a.id)} className="list-item">{triField(a as Record<string, unknown>, 'title', locale)}</li>)}</ul></div>
            <div><h4 style={{ marginBottom: 8 }}>{tp('labels.tag')}</h4><ul className="list-clean">{studentDetail.profile.tags.map((x) => { const o = x as Record<string, unknown>; return <li key={String(o.id)} className="list-item">{triField(o, 'category', locale)} · {triField(o, 'name', locale)}</li>; })}</ul></div>
            <button type="button" onClick={saveStudentDetail}>{tp('actions.saveAndSync')}</button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={picker.open}
        title={picker.kind === 'grade' ? tp('picker.gradeTitle') : tp('picker.majorTitle')}
        onClose={() => setPicker((s) => ({ ...s, open: false }))}
        width={560}
      >
        <ul className="list-clean">
          {(picker.kind === 'grade' ? metaOptions.grades : metaOptions.majors).map((item) => (
            <li key={item.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{picker.kind === 'grade' ? `${item.name}${tp('labels.gradeSuffix')}` : item.name}</span>
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
                {tp('actions.select')}
              </button>
            </li>
          ))}
          {(picker.kind === 'grade' ? metaOptions.grades.length : metaOptions.majors.length) === 0 ? (
            <li className="list-item">{tp('picker.empty')}</li>
          ) : null}
        </ul>
      </Modal>
    </div>
  );
}