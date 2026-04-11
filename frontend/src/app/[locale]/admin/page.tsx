'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';
import { useAuthGuard } from '@/lib/use-auth-guard';

type Me = { role: string };
type PendingProfile = {
  userId: string;
  user: { id: string; name: string; email: string; studentId?: string | null };
  reviewStatus: string;
  rejectReason?: string | null;
  updatedAt?: string;
};
type TaskRequest = {
  id: string;
  titleZh?: string;
  titleEn?: string;
  titleRu?: string;
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  reviewNote?: string;
  updatedAt?: string;
  createdAt?: string;
  approvedAt?: string | null;
  primaryOrg?: { nameZh?: string; nameEn?: string; nameRu?: string } | null;
  creator?: { name?: string; email?: string } | null;
  reviewedBy?: { name?: string; email?: string } | null;
};
type ProfileReviewRecord = PendingProfile;
type TaskReviewRecord = TaskRequest;
type MetaOptions = {
  grades: Array<{ id: string; name: string }>;
  majors: Array<{ id: string; name: string }>;
};
type ReviewTimelineItem = {
  id: string;
  type: 'profile' | 'task';
  title: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING_APPROVAL';
  note: string;
  actor: string;
  at: string | null | undefined;
  ts: number;
};

function approvalBadgeClass(status?: string) {
  if (status === 'APPROVED') return 'badge badge-green';
  if (status === 'REJECTED') return 'badge badge-red';
  return 'badge badge-yellow';
}

function approvalLabel(status?: string) {
  if (status === 'APPROVED') return '已通过';
  if (status === 'REJECTED') return '已驳回';
  return '待审核';
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeToMs(value?: string | null) {
  if (!value) return 0;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}

function waitingLabel(value?: string | null) {
  const ts = timeToMs(value);
  if (!ts) return '等待时长未知';
  const diff = Math.max(0, Date.now() - ts);
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) return `已等待 ${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `已等待 ${days} 天`;
}

export default function AdminPage() {
  const tc = useTranslations('common');
  const { token, ready } = useAuthGuard();
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [profileRecords, setProfileRecords] = useState<ProfileReviewRecord[]>([]);
  const [taskReviewRecords, setTaskReviewRecords] = useState<TaskReviewRecord[]>([]);
  const [meta, setMeta] = useState<MetaOptions>({ grades: [], majors: [] });
  const [newGrade, setNewGrade] = useState('');
  const [newMajor, setNewMajor] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [taskRejectReason, setTaskRejectReason] = useState<Record<string, string>>({});
  const [reviewTarget, setReviewTarget] = useState<PendingProfile | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [activeTaskId, setActiveTaskId] = useState<string>('');
  const [reviewView, setReviewView] = useState<'records' | 'timeline'>('records');
  const [err, setErr] = useState<string | null>(null);
  const reviewTimeline = useMemo<ReviewTimelineItem[]>(() => {
    const profileRows: ReviewTimelineItem[] = profileRecords.map((row) => {
      const status = row.reviewStatus === 'APPROVED' ? 'APPROVED' : row.reviewStatus === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL';
      return {
        id: `profile-${row.userId}-${row.updatedAt ?? ''}`,
        type: 'profile',
        title: `档案审核 · ${row.user.name}`,
        status,
        note: row.rejectReason || (status === 'APPROVED' ? '档案审核通过' : '档案审核驳回'),
        actor: '团委管理员',
        at: row.updatedAt,
        ts: row.updatedAt ? new Date(row.updatedAt).getTime() : 0,
      };
    });
    const taskRows: ReviewTimelineItem[] = taskReviewRecords.map((row) => {
      const status = row.approvalStatus === 'APPROVED' ? 'APPROVED' : row.approvalStatus === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL';
      return {
        id: `task-${row.id}-${row.approvedAt ?? row.updatedAt ?? row.createdAt ?? ''}`,
        type: 'task',
        title: `任务审核 · ${row.titleZh || row.titleEn || row.titleRu || '—'}`,
        status,
        note: row.reviewNote || (status === 'APPROVED' ? '任务申请审核通过' : '任务申请审核驳回'),
        actor: row.reviewedBy?.name || row.reviewedBy?.email || '团委管理员',
        at: row.approvedAt ?? row.updatedAt ?? row.createdAt,
        ts: row.approvedAt
          ? new Date(row.approvedAt).getTime()
          : row.updatedAt
            ? new Date(row.updatedAt).getTime()
            : row.createdAt
              ? new Date(row.createdAt).getTime()
              : 0,
      };
    });
    return [...taskRows, ...profileRows]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 16);
  }, [profileRecords, taskReviewRecords]);
  const latestPendingProfiles = useMemo(
    () =>
      [...pending]
        .sort((a, b) => {
          const statusA = a.reviewStatus === 'PENDING' ? 0 : 1;
          const statusB = b.reviewStatus === 'PENDING' ? 0 : 1;
          if (statusA !== statusB) return statusA - statusB;
          const at = timeToMs(a.updatedAt);
          const bt = timeToMs(b.updatedAt);
          if (at === 0 || bt === 0) return at - bt;
          return at - bt;
        })
        .slice(0, 5),
    [pending],
  );
  const latestPendingTasks = useMemo(
    () =>
      [...taskRequests]
        .sort((a, b) => {
          const statusA = a.approvalStatus === 'PENDING_APPROVAL' ? 0 : 1;
          const statusB = b.approvalStatus === 'PENDING_APPROVAL' ? 0 : 1;
          if (statusA !== statusB) return statusA - statusB;
          const at = timeToMs(a.createdAt);
          const bt = timeToMs(b.createdAt);
          if (at === 0 || bt === 0) return at - bt;
          return at - bt;
        })
        .slice(0, 5),
    [taskRequests],
  );
  const todayHandledCount = useMemo(() => {
    const isToday = (value?: string | null) => {
      if (!value) return false;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return false;
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    };
    const profileToday = profileRecords.filter((row) => isToday(row.updatedAt)).length;
    const taskToday = taskReviewRecords.filter((row) =>
      isToday(row.approvedAt ?? row.updatedAt ?? row.createdAt),
    ).length;
    return profileToday + taskToday;
  }, [profileRecords, taskReviewRecords]);
  const recentRejectedCount = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const profileRejected = profileRecords.filter((row) => {
      if (row.reviewStatus !== 'REJECTED' || !row.updatedAt) return false;
      const ts = new Date(row.updatedAt).getTime();
      return Number.isFinite(ts) && ts >= sevenDaysAgo;
    }).length;
    const taskRejected = taskReviewRecords.filter((row) => {
      if (row.approvalStatus !== 'REJECTED') return false;
      const raw = row.approvedAt ?? row.updatedAt ?? row.createdAt;
      if (!raw) return false;
      const ts = new Date(raw).getTime();
      return Number.isFinite(ts) && ts >= sevenDaysAgo;
    }).length;
    return profileRejected + taskRejected;
  }, [profileRecords, taskReviewRecords]);
  const focusHint = useMemo(() => {
    const p = latestPendingProfiles[0];
    const t = latestPendingTasks[0];
    if (p && t) {
      return `优先处理：档案「${p.user.name}」与活动「${t.titleZh || t.titleEn || t.titleRu || '未命名'}」`;
    }
    if (p) return `优先处理：档案「${p.user.name}」`;
    if (t) return `优先处理：活动「${t.titleZh || t.titleEn || t.titleRu || '未命名'}」`;
    return '当前没有待审核事项，可查看底部审核记录。';
  }, [latestPendingProfiles, latestPendingTasks]);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);
      if (m.role !== 'LEAGUE_ADMIN') {
        setPending([]);
        setTaskRequests([]);
        setProfileRecords([]);
        setTaskReviewRecords([]);
        return;
      }
      const [pendingList, requests, options, profileReviewed, taskReviewed] = await Promise.all([
        apiFetch<PendingProfile[]>('/profile/admin/pending', { token }),
        apiFetch<TaskRequest[]>('/tasks/admin/requests', { token }),
        apiFetch<MetaOptions>('/profile/admin/options', { token }),
        apiFetch<ProfileReviewRecord[]>('/profile/admin/review-records?limit=12', { token }),
        apiFetch<TaskReviewRecord[]>('/tasks/admin/review-records?limit=12', { token }),
      ]);
      setPending(Array.isArray(pendingList) ? pendingList : []);
      setTaskRequests(Array.isArray(requests) ? requests : []);
      setProfileRecords(Array.isArray(profileReviewed) ? profileReviewed : []);
      setTaskReviewRecords(Array.isArray(taskReviewed) ? taskReviewed : []);
      setMeta({
        grades: Array.isArray(options?.grades) ? options.grades : [],
        majors: Array.isArray(options?.majors) ? options.majors : [],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeProfileId && pending.length > 0) {
      setActiveProfileId(latestPendingProfiles[0]?.userId ?? pending[0].userId);
    }
    if (!activeTaskId && taskRequests.length > 0) {
      setActiveTaskId(latestPendingTasks[0]?.id ?? taskRequests[0].id);
    }
  }, [activeProfileId, activeTaskId, latestPendingProfiles, latestPendingTasks, pending, taskRequests]);

  async function review(userId: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? '确认通过该档案审核吗？' : '确认驳回该档案审核吗？')) return;
    await apiFetch(`/profile/admin/${userId}/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ approve, reason: approve ? undefined : reason[userId] || 'Rejected' }),
    });
    setReviewTarget(null);
    load();
  }

  async function reviewTaskRequest(taskId: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? '确认通过该活动申请吗？' : '确认驳回该活动申请吗？')) return;
    try {
      await apiFetch(`/tasks/admin/requests/${taskId}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          approve,
          reason: approve ? undefined : taskRejectReason[taskId] || undefined,
        }),
      });
      setTaskRejectReason((s) => ({ ...s, [taskId]: '' }));
      await load();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addGrade() {
    if (!token || !newGrade.trim()) return;
    if (!confirmAction('确认新增该年级吗？')) return;
    try {
      await apiFetch('/profile/admin/options/grades', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: newGrade.trim() }),
      });
      setNewGrade('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function addMajor() {
    if (!token || !newMajor.trim()) return;
    if (!confirmAction('确认新增该专业吗？')) return;
    try {
      await apiFetch('/profile/admin/options/majors', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: newMajor.trim() }),
      });
      setNewMajor('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  const activeProfile = pending.find((row) => row.userId === activeProfileId) ?? null;
  const activeTask = taskRequests.find((row) => row.id === activeTaskId) ?? null;

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">正在校验登录状态...</p>
      </div>
    );
  }

  if (me && me.role !== 'LEAGUE_ADMIN') {
    return <p>League admin only. Current role: {me.role}</p>;
  }

  return (
    <div className="page-container">
      <div className="page-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              团委后台
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              集中处理档案审核与活动申请审批。
            </p>
          </div>
          <button type="button" onClick={load}>
            {tc('refresh')}
          </button>
        </div>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}

        <section className="card-soft">
          <h3 style={{ marginBottom: 12 }}>审核总览</h3>
          <div className="dashboard-stats-grid">
            <div className="dashboard-stat-card">
              <div className="topbar-muted">待审核档案数</div>
              <strong className="dashboard-stat-value">{pending.length}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">待审核活动申请数</div>
              <strong className="dashboard-stat-value">{taskRequests.length}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">今日已处理数量</div>
              <strong className="dashboard-stat-value">{todayHandledCount}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">最近驳回数量（7天）</div>
              <strong className="dashboard-stat-value">{recentRejectedCount}</strong>
            </div>
          </div>
        </section>

        <section className="card-soft">
          <h3 style={{ marginBottom: 8 }}>今日优先处理</h3>
          <p className="topbar-muted" style={{ marginTop: 0, marginBottom: 10 }}>
            {focusHint}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={latestPendingProfiles.length === 0}
              onClick={() => latestPendingProfiles[0] && setActiveProfileId(latestPendingProfiles[0].userId)}
            >
              跳到档案审核
            </button>
            <button
              type="button"
              disabled={latestPendingTasks.length === 0}
              onClick={() => latestPendingTasks[0] && setActiveTaskId(latestPendingTasks[0].id)}
            >
              跳到活动审核
            </button>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>待处理事项</h3>
          <div className="grid-two">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>最新待审核档案（最多 5 条）</strong>
              {latestPendingProfiles.length === 0 ? (
                <p className="topbar-muted" style={{ margin: 0 }}>暂无待审核档案</p>
              ) : (
                <ul className="list-clean">
                  {latestPendingProfiles.map((row, idx) => (
                    <li
                      key={row.userId}
                      className={`list-item admin-todo-item ${idx < 2 ? 'admin-todo-item-urgent' : ''}`}
                    >
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{row.user.name}</strong>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {idx === 0 ? <span className="badge badge-red">最紧急</span> : null}
                            <span className={approvalBadgeClass('PENDING_APPROVAL')}>{approvalLabel('PENDING_APPROVAL')}</span>
                          </div>
                        </div>
                        <div className="topbar-muted admin-todo-meta">申请人：{row.user.email}</div>
                        <div className="topbar-muted admin-todo-meta">审核对象：学生档案</div>
                        <div className="topbar-muted admin-todo-meta">提交时间：{formatDateTime(row.updatedAt)}</div>
                        <div className="admin-todo-wait">{waitingLabel(row.updatedAt)}</div>
                        <div className="admin-todo-actions">
                          <button type="button" onClick={() => review(row.userId, true)}>通过</button>
                          <button type="button" className="logout-btn" onClick={() => review(row.userId, false)}>驳回</button>
                          <button type="button" onClick={() => setReviewTarget(row)}>查看详情</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>最新待审核活动申请（最多 5 条）</strong>
              {latestPendingTasks.length === 0 ? (
                <p className="topbar-muted" style={{ margin: 0 }}>暂无待审核活动申请</p>
              ) : (
                <ul className="list-clean">
                  {latestPendingTasks.map((task, idx) => (
                    <li
                      key={task.id}
                      className={`list-item admin-todo-item ${idx < 2 ? 'admin-todo-item-urgent' : ''}`}
                    >
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{task.titleZh || task.titleEn || task.titleRu || '—'}</strong>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {idx === 0 ? <span className="badge badge-red">最紧急</span> : null}
                            <span className={approvalBadgeClass(task.approvalStatus)}>{approvalLabel(task.approvalStatus)}</span>
                          </div>
                        </div>
                        <div className="topbar-muted admin-todo-meta">申请人：{task.creator?.name || task.creator?.email || '—'}</div>
                        <div className="topbar-muted admin-todo-meta">
                          申请组织：{task.primaryOrg?.nameZh || task.primaryOrg?.nameEn || task.primaryOrg?.nameRu || '—'}
                        </div>
                        <div className="topbar-muted admin-todo-meta">审核对象：社团活动申请</div>
                        <div className="topbar-muted admin-todo-meta">提交时间：{formatDateTime(task.createdAt)}</div>
                        <div className="admin-todo-wait">{waitingLabel(task.createdAt)}</div>
                        <div className="admin-todo-actions">
                          <button type="button" onClick={() => reviewTaskRequest(task.id, true)}>通过</button>
                          <button type="button" className="logout-btn" onClick={() => reviewTaskRequest(task.id, false)}>驳回</button>
                          <button type="button" onClick={() => setActiveTaskId(task.id)}>查看详情</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>审核操作区</h3>
          <div className="grid-two">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>档案审核操作</strong>
              <select value={activeProfileId} onChange={(e) => setActiveProfileId(e.target.value)}>
                <option value="">请选择待审核档案</option>
                {pending.map((row) => (
                  <option key={row.userId} value={row.userId}>
                    {row.user.name} · {row.user.studentId ?? '—'}
                  </option>
                ))}
              </select>
              <div className="topbar-muted">
                当前对象：{activeProfile ? `${activeProfile.user.name}（${activeProfile.user.email}）` : '未选择'}
              </div>
              {activeProfile ? (
                <div className="topbar-muted">
                  学号：{activeProfile.user.studentId ?? '—'} · 提交时间：{formatDateTime(activeProfile.updatedAt)}
                </div>
              ) : null}
              <textarea
                placeholder="档案驳回备注（可选）"
                value={activeProfileId ? (reason[activeProfileId] ?? '') : ''}
                onChange={(e) =>
                  activeProfileId
                    ? setReason((s) => ({ ...s, [activeProfileId]: e.target.value }))
                    : undefined
                }
                rows={3}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={!activeProfileId} onClick={() => activeProfileId && review(activeProfileId, true)}>
                  一键通过
                </button>
                <button
                  type="button"
                  className="logout-btn"
                  disabled={!activeProfileId}
                  onClick={() => activeProfileId && review(activeProfileId, false)}
                >
                  一键驳回
                </button>
                <button type="button" disabled={!activeProfile} onClick={() => activeProfile && setReviewTarget(activeProfile)}>
                  查看详情
                </button>
              </div>
            </div>

            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>活动申请审核操作</strong>
              <select value={activeTaskId} onChange={(e) => setActiveTaskId(e.target.value)}>
                <option value="">请选择待审核活动申请</option>
                {taskRequests.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.titleZh || row.titleEn || row.titleRu || '—'}
                  </option>
                ))}
              </select>
              <div className="topbar-muted">
                当前对象：{activeTask ? `${activeTask.creator?.name || activeTask.creator?.email || '—'}` : '未选择'}
              </div>
              {activeTask ? (
                <>
                  <div className="topbar-muted">
                    标题：{activeTask.titleZh || activeTask.titleEn || activeTask.titleRu || '—'}
                  </div>
                  <div className="topbar-muted">
                    组织：{activeTask.primaryOrg?.nameZh || activeTask.primaryOrg?.nameEn || activeTask.primaryOrg?.nameRu || '—'} ·
                    提交时间：{formatDateTime(activeTask.createdAt)}
                  </div>
                </>
              ) : null}
              <textarea
                placeholder="活动申请驳回备注（可选）"
                value={activeTaskId ? (taskRejectReason[activeTaskId] ?? '') : ''}
                onChange={(e) =>
                  activeTaskId
                    ? setTaskRejectReason((s) => ({ ...s, [activeTaskId]: e.target.value }))
                    : undefined
                }
                rows={3}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={!activeTaskId} onClick={() => activeTaskId && reviewTaskRequest(activeTaskId, true)}>
                  一键通过
                </button>
                <button
                  type="button"
                  className="logout-btn"
                  disabled={!activeTaskId}
                  onClick={() => activeTaskId && reviewTaskRequest(activeTaskId, false)}
                >
                  一键驳回
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`dashboard-chip ${reviewView === 'records' ? 'dashboard-chip-active' : ''}`}
              onClick={() => setReviewView('records')}
            >
              审核记录
            </button>
            <button
              type="button"
              className={`dashboard-chip ${reviewView === 'timeline' ? 'dashboard-chip-active' : ''}`}
              onClick={() => setReviewView('timeline')}
            >
              审核时间线
            </button>
          </div>

          {reviewView === 'records' ? (
            <div className="grid-two">
              <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                <strong>档案审核记录</strong>
                <ul className="list-clean">
                  {profileRecords.map((row) => (
                    <li key={row.userId} className="list-item">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span>
                            {row.user.name} · {row.user.studentId ?? '—'}
                          </span>
                          <span className={approvalBadgeClass(row.reviewStatus)}>{approvalLabel(row.reviewStatus)}</span>
                        </div>
                        <div className="topbar-muted">时间：{formatDateTime(row.updatedAt)}</div>
                        {row.rejectReason ? <div className="topbar-muted">备注：{row.rejectReason}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                <strong>任务审核记录</strong>
                <ul className="list-clean">
                  {taskReviewRecords.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span>{row.titleZh || row.titleEn || row.titleRu || '—'}</span>
                          <span className={approvalBadgeClass(row.approvalStatus)}>{approvalLabel(row.approvalStatus)}</span>
                        </div>
                        <div className="topbar-muted">
                          审核人：{row.reviewedBy?.name || row.reviewedBy?.email || '—'} · 时间：
                          {formatDateTime(row.approvedAt ?? row.updatedAt ?? row.createdAt)}
                        </div>
                        {row.reviewNote ? <div className="topbar-muted">备注：{row.reviewNote}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>审核时间线（最新 16 条）</strong>
              {reviewTimeline.length === 0 ? (
                <p className="topbar-muted" style={{ margin: 0 }}>
                  暂无审核时间线数据
                </p>
              ) : (
                <ul className="audit-timeline">
                  {reviewTimeline.map((row) => (
                    <li key={row.id} className="audit-timeline-item">
                      <span
                        className={`audit-timeline-dot ${
                          row.status === 'APPROVED'
                            ? 'audit-timeline-dot-ok'
                            : row.status === 'REJECTED'
                              ? 'audit-timeline-dot-no'
                              : 'audit-timeline-dot-pending'
                        }`}
                      />
                      <div className="audit-timeline-main">
                        <div className="audit-timeline-head">
                          <strong>{row.title}</strong>
                          <span className={approvalBadgeClass(row.status)}>{approvalLabel(row.status)}</span>
                        </div>
                        <div className="topbar-muted">审核人：{row.actor}</div>
                        <div className="topbar-muted">备注：{row.note}</div>
                        <div className="topbar-muted">{formatDateTime(row.at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>年级与专业管理</h3>
          <div className="grid-two">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>年级</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newGrade} onChange={(e) => setNewGrade(e.target.value)} placeholder="新增年级（如 2025）" />
                <button type="button" onClick={addGrade}>添加年级</button>
              </div>
              <div className="topbar-muted">{meta.grades.map((g) => g.name).join('、') || '暂无'}</div>
            </div>
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>专业</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newMajor} onChange={(e) => setNewMajor(e.target.value)} placeholder="新增专业（如 计算机科学）" />
                <button type="button" onClick={addMajor}>添加专业</button>
              </div>
              <div className="topbar-muted">{meta.majors.map((m) => m.name).join('、') || '暂无'}</div>
            </div>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>团委任务模块</h3>
          <p className="topbar-muted" style={{ margin: 0 }}>
            进入任务中心，查看全局任务看板与审批流程。
          </p>
          <Link
            href="/tasks"
            style={{
              display: 'inline-block',
              width: 'fit-content',
              padding: '10px 14px',
              borderRadius: 10,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            进入任务中心
          </Link>
        </section>
      </div>

      <Modal
        open={!!reviewTarget}
        title="档案审核详情"
        onClose={() => setReviewTarget(null)}
        width={720}
      >
        {reviewTarget ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <strong>{reviewTarget.user.name}</strong> · {reviewTarget.user.email} ·{' '}
              {reviewTarget.user.studentId ?? '—'}
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>驳回原因（可选）</span>
              <input
                value={reason[reviewTarget.userId] ?? ''}
                onChange={(e) => setReason((s) => ({ ...s, [reviewTarget.userId]: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => review(reviewTarget.userId, true)}>
                {tc('approve')}
              </button>
              <button type="button" className="logout-btn" onClick={() => review(reviewTarget.userId, false)}>
                {tc('reject')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
