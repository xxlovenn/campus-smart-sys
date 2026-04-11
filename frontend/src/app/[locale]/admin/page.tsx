'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { useAuthGuard } from '@/lib/use-auth-guard';

type Me = { role: string };
type PendingProfile = {
  userId: string;
  user: { id: string; name: string; email: string; studentId?: string | null };
  reviewStatus: string;
  rejectReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: { id?: string; name?: string; email?: string } | null;
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
type PendingQueueItem = {
  key: string;
  kind: 'profile' | 'task';
  title: string;
  applicant: string;
  org?: string;
  submittedAt?: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  waitText: string;
  priorityScore: number;
  profileId?: string;
  taskId?: string;
};

function approvalBadgeClass(status?: string) {
  if (status === 'APPROVED') return 'badge badge-green';
  if (status === 'REJECTED') return 'badge badge-red';
  return 'badge badge-yellow';
}

function approvalLabel(
  status: string | undefined,
  labels: { approved: string; rejected: string; pending: string },
) {
  if (status === 'APPROVED') return labels.approved;
  if (status === 'REJECTED') return labels.rejected;
  return labels.pending;
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

function waitingLabel(
  value: string | null | undefined,
  labels: { unknown: string; hours: (v: number) => string; days: (v: number) => string },
) {
  const ts = timeToMs(value);
  if (!ts) return labels.unknown;
  const diff = Math.max(0, Date.now() - ts);
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) return labels.hours(hours);
  const days = Math.floor(hours / 24);
  return labels.days(days);
}

export default function AdminPage() {
  const ta = useTranslations('admin');
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
  const [taskRejectReason, setTaskRejectReason] = useState<Record<string, string>>({});
  const [activeTaskId, setActiveTaskId] = useState<string>('');
  const [reviewView, setReviewView] = useState<'records' | 'timeline'>('records');
  const [err, setErr] = useState<string | null>(null);
  const approvalLabels = useMemo(
    () => ({
      approved: ta('status.approved'),
      rejected: ta('status.rejected'),
      pending: ta('status.pending'),
    }),
    [ta],
  );
  const waitingLabels = useMemo(
    () => ({
      unknown: ta('waiting.unknown'),
      hours: (v: number) => ta('waiting.hours', { count: v }),
      days: (v: number) => ta('waiting.days', { count: v }),
    }),
    [ta],
  );
  const reviewTimeline = useMemo<ReviewTimelineItem[]>(() => {
    const profileRows: ReviewTimelineItem[] = profileRecords.map((row) => {
      const status = row.reviewStatus === 'APPROVED' ? 'APPROVED' : row.reviewStatus === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL';
      return {
        id: `profile-${row.userId}-${row.updatedAt ?? ''}`,
        type: 'profile',
        title: ta('timeline.profileTitle', { name: row.user.name }),
        status,
        note: row.rejectReason || (status === 'APPROVED' ? ta('timeline.profileApproved') : ta('timeline.profileRejected')),
        actor: row.reviewedBy?.name || row.reviewedBy?.email || ta('labels.leagueAdmin'),
        at: row.reviewedAt ?? row.updatedAt,
        ts: row.reviewedAt
          ? new Date(row.reviewedAt).getTime()
          : row.updatedAt
            ? new Date(row.updatedAt).getTime()
            : 0,
      };
    });
    const taskRows: ReviewTimelineItem[] = taskReviewRecords.map((row) => {
      const status = row.approvalStatus === 'APPROVED' ? 'APPROVED' : row.approvalStatus === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL';
      return {
        id: `task-${row.id}-${row.approvedAt ?? row.updatedAt ?? row.createdAt ?? ''}`,
        type: 'task',
        title: ta('timeline.taskTitle', { title: row.titleZh || row.titleEn || row.titleRu || '—' }),
        status,
        note: row.reviewNote || (status === 'APPROVED' ? ta('timeline.taskApproved') : ta('timeline.taskRejected')),
        actor: row.reviewedBy?.name || row.reviewedBy?.email || ta('labels.leagueAdmin'),
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
  }, [profileRecords, ta, taskReviewRecords]);
  const latestPendingProfiles = useMemo(
    () =>
      [...pending]
        .sort((a, b) => {
          const statusA = a.reviewStatus === 'PENDING' ? 0 : 1;
          const statusB = b.reviewStatus === 'PENDING' ? 0 : 1;
          if (statusA !== statusB) return statusA - statusB;
          const at = timeToMs(a.submittedAt ?? a.updatedAt);
          const bt = timeToMs(b.submittedAt ?? b.updatedAt);
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
  const pendingQueue = useMemo<PendingQueueItem[]>(() => {
    const profileItems: PendingQueueItem[] = latestPendingProfiles.map((row) => {
      const submitTs = timeToMs(row.submittedAt ?? row.updatedAt);
      return {
        key: `profile-${row.userId}`,
        kind: 'profile',
        title: ta('queue.profileTitle', { name: row.user.name }),
        applicant: row.user.email,
        submittedAt: row.submittedAt ?? row.updatedAt,
        status: 'PENDING_APPROVAL',
        waitText: waitingLabel(row.submittedAt ?? row.updatedAt, waitingLabels),
        // earlier submit time => higher priority
        priorityScore: submitTs > 0 ? Date.now() - submitTs : 0,
        profileId: row.userId,
      };
    });
    const taskItems: PendingQueueItem[] = latestPendingTasks.map((row) => {
      const submitTs = timeToMs(row.createdAt);
      const title = row.titleZh || row.titleEn || row.titleRu || ta('labels.unnamedTaskRequest');
      return {
        key: `task-${row.id}`,
        kind: 'task',
        title,
        applicant: row.creator?.name || row.creator?.email || ta('labels.unknownApplicant'),
        org: row.primaryOrg?.nameZh || row.primaryOrg?.nameEn || row.primaryOrg?.nameRu || ta('labels.unassignedOrg'),
        submittedAt: row.createdAt,
        status: row.approvalStatus ?? 'PENDING_APPROVAL',
        waitText: waitingLabel(row.createdAt, waitingLabels),
        priorityScore: submitTs > 0 ? Date.now() - submitTs : 0,
        taskId: row.id,
      };
    });
    return [...profileItems, ...taskItems]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5);
  }, [latestPendingProfiles, latestPendingTasks, ta, waitingLabels]);
  const quickReviewRecords = useMemo(
    () => reviewTimeline.slice(0, 8),
    [reviewTimeline],
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
      return ta('focus.both', {
        profile: p.user.name,
        task: t.titleZh || t.titleEn || t.titleRu || ta('labels.unnamed'),
      });
    }
    if (p) return ta('focus.profile', { profile: p.user.name });
    if (t) return ta('focus.task', { task: t.titleZh || t.titleEn || t.titleRu || ta('labels.unnamed') });
    return ta('focus.empty');
  }, [latestPendingProfiles, latestPendingTasks, ta]);
  const totalPendingCount = pending.length + taskRequests.length;

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
        apiFetch<TaskRequest[]>('/tasks/admin/requests?stage=ALL', { token }),
        apiFetch<MetaOptions>('/profile/admin/options', { token }),
        apiFetch<ProfileReviewRecord[]>('/profile/admin/review-records?limit=12', { token }),
        apiFetch<TaskReviewRecord[]>('/tasks/admin/review-records?limit=12&source=ORG_REQUEST', { token }),
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
    if (!token) return;
    const timer = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load, token]);

  useEffect(() => {
    if (!activeTaskId && taskRequests.length > 0) {
      setActiveTaskId(latestPendingTasks[0]?.id ?? taskRequests[0].id);
    }
  }, [activeTaskId, latestPendingTasks, taskRequests]);

  async function review(userId: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? ta('confirm.approveProfile') : ta('confirm.rejectProfile'))) return;
    await apiFetch(`/profile/admin/${userId}/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ approve, reason: approve ? undefined : 'Rejected' }),
    });
    load();
  }

  async function reviewTaskRequest(taskId: string, approve: boolean) {
    if (!token) return;
    if (!confirmAction(approve ? ta('confirm.approveTask') : ta('confirm.rejectTask'))) return;
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
    if (!confirmAction(ta('confirm.addGrade'))) return;
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
    if (!confirmAction(ta('confirm.addMajor'))) return;
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

  const activeTask = taskRequests.find((row) => row.id === activeTaskId) ?? null;

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">{ta('loadingAuth')}</p>
      </div>
    );
  }

  if (me && me.role !== 'LEAGUE_ADMIN') {
    return <p>{ta('leagueOnly', { role: me.role })}</p>;
  }

  return (
    <div className="page-container">
      <div className="page-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>
              {ta('title')}
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              {ta('subtitle')}
            </p>
          </div>
          <button type="button" onClick={load}>
            {tc('refresh')}
          </button>
        </div>
        {err && <div style={{ color: 'crimson' }}>{err}</div>}

        <section className="card-soft admin-reminder-card">
          <div>
            <div className="admin-reminder-title">{ta('reminder.title')}</div>
            <div className="admin-reminder-count">{totalPendingCount}</div>
            <p className="admin-reminder-text">
              {totalPendingCount > 0 ? ta('reminder.hasPending') : ta('reminder.empty')}
            </p>
          </div>
          <div className="admin-reminder-pills">
            <span className="badge badge-yellow">{ta('reminder.pendingProfiles', { count: pending.length })}</span>
            <span className="badge badge-red">{ta('reminder.pendingTasks', { count: taskRequests.length })}</span>
          </div>
        </section>

        <section className="card-soft">
          <h3 style={{ marginBottom: 12 }}>{ta('overview.title')}</h3>
          <div className="dashboard-stats-grid">
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{ta('overview.pendingProfiles')}</div>
              <strong className="dashboard-stat-value">{pending.length}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{ta('overview.pendingTaskRequests')}</div>
              <strong className="dashboard-stat-value">{taskRequests.length}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{ta('overview.todayHandled')}</div>
              <strong className="dashboard-stat-value">{todayHandledCount}</strong>
            </div>
            <div className="dashboard-stat-card">
              <div className="topbar-muted">{ta('overview.recentRejected')}</div>
              <strong className="dashboard-stat-value">{recentRejectedCount}</strong>
            </div>
          </div>
        </section>

        <section className="card-soft">
          <h3 style={{ marginBottom: 8 }}>{ta('focus.title')}</h3>
          <p className="topbar-muted" style={{ marginTop: 0, marginBottom: 10 }}>
            {focusHint}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={latestPendingProfiles.length === 0}
              onClick={() => {
                document.getElementById('pending-review-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {ta('actions.jumpPending')}
            </button>
            <button
              type="button"
              disabled={latestPendingTasks.length === 0}
              onClick={() => latestPendingTasks[0] && setActiveTaskId(latestPendingTasks[0].id)}
            >
              {ta('actions.jumpTaskReview')}
            </button>
          </div>
        </section>

        <section id="pending-review-section" className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{ta('queue.title')}</h3>
          <div className="grid-two">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>{ta('queue.topList')}</strong>
              {pendingQueue.length === 0 ? (
                <p className="topbar-muted" style={{ margin: 0 }}>{ta('queue.empty')}</p>
              ) : (
                <ul className="list-clean">
                  {pendingQueue.map((row, idx) => (
                    <li
                      key={row.key}
                      className={`list-item admin-todo-item ${idx < 2 ? 'admin-todo-item-urgent' : ''}`}
                    >
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{row.title}</strong>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {idx === 0 ? <span className="badge badge-red">{ta('queue.urgent')}</span> : null}
                            <span className={approvalBadgeClass(row.status)}>{approvalLabel(row.status, approvalLabels)}</span>
                          </div>
                        </div>
                        <div className="topbar-muted admin-todo-meta">{ta('queue.applicant')}: {row.applicant}</div>
                        <div className="topbar-muted admin-todo-meta">
                          {ta('queue.target')}：{row.kind === 'profile' ? ta('queue.profileTarget') : ta('queue.taskTarget')}
                        </div>
                        {row.org ? <div className="topbar-muted admin-todo-meta">{ta('queue.org')}: {row.org}</div> : null}
                        <div className="topbar-muted admin-todo-meta">{ta('queue.submittedAt')}: {formatDateTime(row.submittedAt)}</div>
                        <div className="admin-todo-wait">{row.waitText}</div>
                        <div className="admin-todo-actions">
                          {row.kind === 'profile' ? (
                            <>
                              <button type="button" onClick={() => row.profileId && review(row.profileId, true)}>{ta('actions.approve')}</button>
                              <button type="button" className="logout-btn" onClick={() => row.profileId && review(row.profileId, false)}>{ta('actions.reject')}</button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => row.taskId && reviewTaskRequest(row.taskId, true)}>{ta('actions.approve')}</button>
                              <button type="button" className="logout-btn" onClick={() => row.taskId && reviewTaskRequest(row.taskId, false)}>{ta('actions.reject')}</button>
                              <button type="button" onClick={() => row.taskId && setActiveTaskId(row.taskId)}>{ta('actions.detail')}</button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>{ta('records.quickTitle')}</strong>
              {quickReviewRecords.length === 0 ? (
                <p className="topbar-muted" style={{ margin: 0 }}>{ta('records.empty')}</p>
              ) : (
                <ul className="list-clean">
                  {quickReviewRecords.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{row.title}</strong>
                          <span className={approvalBadgeClass(row.status)}>{approvalLabel(row.status, approvalLabels)}</span>
                        </div>
                        <div className="topbar-muted admin-todo-meta">{ta('labels.reviewer')}: {row.actor}</div>
                        <div className="topbar-muted admin-todo-meta">{ta('labels.time')}: {formatDateTime(row.at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{ta('taskReview.title')}</h3>
          <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
            <select value={activeTaskId} onChange={(e) => setActiveTaskId(e.target.value)}>
              <option value="">{ta('taskReview.selectPlaceholder')}</option>
              {taskRequests.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.titleZh || row.titleEn || row.titleRu || '—'}
                </option>
              ))}
            </select>
            <div className="topbar-muted">
              {ta('taskReview.currentApplicant')}：{activeTask ? `${activeTask.creator?.name || activeTask.creator?.email || '—'}` : ta('labels.notSelected')}
            </div>
            {activeTask ? (
              <>
                <div className="topbar-muted">
                  {ta('labels.title')}：{activeTask.titleZh || activeTask.titleEn || activeTask.titleRu || '—'}
                </div>
                <div className="topbar-muted">
                  {ta('labels.org')}：{activeTask.primaryOrg?.nameZh || activeTask.primaryOrg?.nameEn || activeTask.primaryOrg?.nameRu || '—'} ·
                  {ta('labels.submittedAt')}：{formatDateTime(activeTask.createdAt)}
                </div>
              </>
            ) : null}
            <textarea
              placeholder={ta('taskReview.rejectReasonPlaceholder')}
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
                {ta('actions.quickApprove')}
              </button>
              <button
                type="button"
                className="logout-btn"
                disabled={!activeTaskId}
                onClick={() => activeTaskId && reviewTaskRequest(activeTaskId, false)}
              >
                {ta('actions.quickReject')}
              </button>
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
              {ta('records.tab')}
            </button>
            <button
              type="button"
              className={`dashboard-chip ${reviewView === 'timeline' ? 'dashboard-chip-active' : ''}`}
              onClick={() => setReviewView('timeline')}
            >
              {ta('records.timelineTab')}
            </button>
          </div>

          {reviewView === 'records' ? (
            <div className="grid-two">
              <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                <strong>{ta('records.profileTitle')}</strong>
                <ul className="list-clean">
                  {profileRecords.map((row) => (
                    <li key={row.userId} className="list-item">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span>
                            {row.user.name} · {row.user.studentId ?? '—'}
                          </span>
                          <span className={approvalBadgeClass(row.reviewStatus)}>{approvalLabel(row.reviewStatus, approvalLabels)}</span>
                        </div>
                        <div className="topbar-muted">{ta('labels.time')}：{formatDateTime(row.updatedAt)}</div>
                        {row.rejectReason ? <div className="topbar-muted">{ta('labels.note')}：{row.rejectReason}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                <strong>{ta('records.taskTitle')}</strong>
                <ul className="list-clean">
                  {taskReviewRecords.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span>{row.titleZh || row.titleEn || row.titleRu || '—'}</span>
                          <span className={approvalBadgeClass(row.approvalStatus)}>{approvalLabel(row.approvalStatus, approvalLabels)}</span>
                        </div>
                        <div className="topbar-muted">
                          {ta('labels.reviewer')}：{row.reviewedBy?.name || row.reviewedBy?.email || '—'} · {ta('labels.time')}：
                          {formatDateTime(row.approvedAt ?? row.updatedAt ?? row.createdAt)}
                        </div>
                        {row.reviewNote ? <div className="topbar-muted">{ta('labels.note')}：{row.reviewNote}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>{ta('records.timelineTitle')}</strong>
              {reviewTimeline.length === 0 ? (
                <p className="topbar-muted" style={{ margin: 0 }}>
                  {ta('records.timelineEmpty')}
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
                          <span className={approvalBadgeClass(row.status)}>{approvalLabel(row.status, approvalLabels)}</span>
                        </div>
                        <div className="topbar-muted">{ta('labels.reviewer')}：{row.actor}</div>
                        <div className="topbar-muted">{ta('labels.note')}：{row.note}</div>
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
          <h3 style={{ margin: 0 }}>{ta('meta.title')}</h3>
          <div className="grid-two">
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>{ta('meta.grades')}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newGrade} onChange={(e) => setNewGrade(e.target.value)} placeholder={ta('meta.gradePlaceholder')} />
                <button type="button" onClick={addGrade}>{ta('meta.addGrade')}</button>
              </div>
              <div className="topbar-muted">{meta.grades.map((g) => g.name).join('、') || ta('meta.empty')}</div>
            </div>
            <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
              <strong>{ta('meta.majors')}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newMajor} onChange={(e) => setNewMajor(e.target.value)} placeholder={ta('meta.majorPlaceholder')} />
                <button type="button" onClick={addMajor}>{ta('meta.addMajor')}</button>
              </div>
              <div className="topbar-muted">{meta.majors.map((m) => m.name).join('、') || ta('meta.empty')}</div>
            </div>
          </div>
        </section>

        <section className="card-soft" style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>{ta('taskCenter.title')}</h3>
          <p className="topbar-muted" style={{ margin: 0 }}>
            {ta('taskCenter.subtitle')}
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
            {ta('taskCenter.enter')}
          </Link>
        </section>
      </div>

    </div>
  );
}
