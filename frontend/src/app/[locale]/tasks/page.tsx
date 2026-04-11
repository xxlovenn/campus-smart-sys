'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { confirmAction } from '@/lib/confirm';
import { triField } from '@/lib/tri';

type Me = {
  id: string;
  role: string;
  managedOrgIds?: string[];
};

type Task = Record<string, unknown> & {
  id: string;
  status: string;
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  source?: 'ORG_REQUEST' | 'LEAGUE_PUBLISHED';
  reviewNote?: string;
  creator?: { id?: string; name?: string; email?: string };
  assignee?: { id?: string; name?: string; email?: string };
};

function relatedOrgIds(task: Task): string[] {
  const rows = Array.isArray(task.relatedOrgs) ? task.relatedOrgs : [];
  return rows
    .map((row) => {
      const o = row as Record<string, unknown>;
      return typeof o.organizationId === 'string' ? o.organizationId : '';
    })
    .filter(Boolean);
}

function inManagedScope(task: Task, managedOrgIds: string[]) {
  if (managedOrgIds.length === 0) return false;
  const primaryOrgId = typeof task.primaryOrgId === 'string' ? task.primaryOrgId : '';
  if (primaryOrgId && managedOrgIds.includes(primaryOrgId)) return true;
  return relatedOrgIds(task).some((orgId) => managedOrgIds.includes(orgId));
}

type Organization = Record<string, unknown> & {
  id: string;
};

type UserOption = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
};

type RequestReviewPayload = {
  approve: boolean;
  reason?: string;
};

function toLocalDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(
    date.getHours(),
  )}时${pad(date.getMinutes())}分`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'DONE':
      return 'badge badge-green';
    case 'IN_PROGRESS':
      return 'badge badge-blue';
    case 'BLOCKED':
      return 'badge badge-red';
    default:
      return 'badge badge-yellow';
  }
}

function approvalBadgeClass(approval?: string) {
  if (approval === 'APPROVED') return 'badge badge-green';
  if (approval === 'REJECTED') return 'badge badge-red';
  return 'badge badge-yellow';
}

function approvalLabel(approval?: string) {
  if (approval === 'APPROVED') return '已通过';
  if (approval === 'REJECTED') return '已驳回';
  return '待审核';
}

function sourceLabel(source?: string) {
  if (source === 'LEAGUE_PUBLISHED') return '团委发布';
  return '本社申请';
}

export default function TasksPage() {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = getToken();

  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [overview, setOverview] = useState<unknown | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Task[]>([]);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState(() => {
    const now = new Date();
    const start = toLocalDateTimeValue(now);
    const end = toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000));

    return {
      title: '',
      primaryOrgId: '',
      assigneeId: '',
      relatedOrgIds: '',
      startAt: start,
      endAt: end,
    };
  });

  const nowMin = useMemo(() => toLocalDateTimeValue(new Date()), []);

  const load = useCallback(async () => {
    if (!token) {
      setErr('登录已失效，请重新登录');
      setTasks([]);
      setOverview(null);
      setMe(null);
      setOrgs([]);
      setUsers([]);
      return;
    }

    setErr(null);

    try {
      const m = await apiFetch<Me>('/users/me', { token });
      setMe(m);

      const [taskList, orgList, userList] = await Promise.all([
        apiFetch<Task[]>('/tasks', { token }),
        apiFetch<Organization[]>('/organizations', { token }),
        apiFetch<UserOption[]>('/users', { token }),
      ]);

      setTasks(Array.isArray(taskList) ? taskList : []);
      setOrgs(Array.isArray(orgList) ? orgList : []);
      setUsers(Array.isArray(userList) ? userList : []);

      if (m.role === 'LEAGUE_ADMIN') {
        const [ov, req] = await Promise.all([
          apiFetch<unknown>('/tasks/admin/overview', { token }),
          apiFetch<Task[]>('/tasks/admin/requests', { token }),
        ]);
        setOverview(ov);
        setPendingRequests(Array.isArray(req) ? req : []);
      } else {
        setOverview(null);
        setPendingRequests([]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : tc('error');
      setErr(msg);
      setTasks([]);
      setOverview(null);
      setOrgs([]);
      setUsers([]);
      setPendingRequests([]);
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    if (!token) return;
    if (!confirmAction(`确认将任务状态更新为 ${status} 吗？`)) return;

    try {
      await apiFetch(`/tasks/${id}/status`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function deleteTask(id: string) {
    if (!token) return;
    if (!confirmAction('确认删除该活动/任务吗？此操作不可恢复。')) return;

    try {
      await apiFetch(`/tasks/${id}`, {
        method: 'DELETE',
        token,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function reviewRequest(taskId: string, payload: RequestReviewPayload) {
    if (!token) return;
    if (!confirmAction(payload.approve ? '确认通过该活动申请吗？' : '确认驳回该活动申请吗？')) {
      return;
    }
    try {
      await apiFetch(`/tasks/admin/requests/${taskId}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      });
      setRejectReason((s) => ({ ...s, [taskId]: '' }));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    const related = form.relatedOrgIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!form.title.trim()) {
      setErr('请输入任务标题');
      return;
    }

    if (!form.primaryOrgId.trim()) {
      setErr('请选择主组织');
      return;
    }

    if (new Date(form.startAt).getTime() < Date.now() - 60 * 1000) {
      setErr('开始时间不能早于当前时间');
      return;
    }

    if (new Date(form.endAt).getTime() < Date.now() - 60 * 1000) {
      setErr('结束时间不能早于当前时间');
      return;
    }

    if (new Date(form.endAt).getTime() < new Date(form.startAt).getTime()) {
      setErr('结束时间不能早于开始时间');
      return;
    }
    if (!confirmAction(isOrgAdmin ? '确认提交该活动申请吗？' : '确认创建并发布该活动吗？')) return;

    try {
      await apiFetch('/tasks', {
        method: 'POST',
        token,
        body: JSON.stringify({
          titleZh: form.title,
          titleEn: form.title,
          titleRu: form.title,
          primaryOrgId: form.primaryOrgId,
          assigneeId: form.assigneeId || undefined,
          relatedOrgIds: related.length ? related : undefined,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          dueAt: new Date(form.endAt).toISOString(),
        }),
      });

      const now = new Date();
      setForm({
        title: '',
        primaryOrgId: '',
        assigneeId: '',
        relatedOrgIds: '',
        startAt: toLocalDateTimeValue(now),
        endAt: toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000)),
      });
      setErr(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  if (!token) {
    return (
      <div className="page-card">
        <p>登录已失效，请先重新登录。</p>
        <Link href="/">返回登录页</Link>
      </div>
    );
  }

  const managedOrgIds = me?.managedOrgIds ?? [];
  const isLeagueAdmin = me?.role === 'LEAGUE_ADMIN';
  const isOrgAdmin = !isLeagueAdmin && managedOrgIds.length > 0;
  const canCreate = isLeagueAdmin || isOrgAdmin;
  const recentOrgActivities = useMemo(() => {
    if (!isOrgAdmin) return [] as Task[];
    const now = Date.now();
    const horizon = now + 14 * 24 * 60 * 60 * 1000;
    return tasks
      .filter((task) => task.approvalStatus === 'APPROVED' && inManagedScope(task, managedOrgIds))
      .filter((task) => {
        const end = new Date(String(task.endAt ?? task.dueAt ?? '')).getTime();
        return Number.isFinite(end) && end >= now && end <= horizon;
      })
      .sort(
        (a, b) =>
          new Date(String(a.startAt ?? a.dueAt ?? '')).getTime() -
          new Date(String(b.startAt ?? b.dueAt ?? '')).getTime(),
      );
  }, [isOrgAdmin, managedOrgIds, tasks]);
  const orgScopedTasks = useMemo(
    () => (isOrgAdmin ? tasks.filter((task) => inManagedScope(task, managedOrgIds)) : []),
    [isOrgAdmin, managedOrgIds, tasks],
  );
  const orgArrangedTasks = useMemo(
    () => orgScopedTasks.filter((task) => task.approvalStatus === 'APPROVED'),
    [orgScopedTasks],
  );
  const orgReviewingTasks = useMemo(
    () =>
      orgScopedTasks.filter(
        (task) => task.source === 'ORG_REQUEST' && task.approvalStatus !== 'APPROVED',
      ),
    [orgScopedTasks],
  );

  const renderTaskList = (title: string, list: Task[], emptyText: string) => (
    <div className="page-section">
      <div className="card-soft">
        <h2 style={{ marginBottom: 14 }}>{title}</h2>

        {list.length === 0 ? (
          <div className="topbar-muted">{emptyText}</div>
        ) : (
          <ul className="list-clean">
            {list.map((task) => {
              const creator = task.creator as Record<string, unknown> | undefined;
              const managed = inManagedScope(task, managedOrgIds);
              const approved = task.approvalStatus === 'APPROVED';
              const mutableByOrgAdmin = managed && task.source === 'ORG_REQUEST';
              const canChangeStatus =
                approved && (isLeagueAdmin || (isOrgAdmin ? mutableByOrgAdmin : false));
              const canDelete = isLeagueAdmin || (isOrgAdmin ? mutableByOrgAdmin : false);

              return (
                <li key={task.id} className="list-item">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <strong>{triField(task, 'title', locale)}</strong>
                        <span className={statusBadgeClass(task.status)}>{task.status}</span>
                        <span className={approvalBadgeClass(task.approvalStatus)}>
                          {approvalLabel(task.approvalStatus)}
                        </span>
                        <span className="badge badge-blue">{sourceLabel(task.source)}</span>
                      </div>

                      <div className="topbar-muted" style={{ marginTop: 8 }}>
                        开始：{formatDateTime(task.startAt)}
                      </div>

                      <div className="topbar-muted" style={{ marginTop: 4 }}>
                        结束：{formatDateTime(task.endAt ?? task.dueAt)}
                      </div>

                      <div className="topbar-muted" style={{ marginTop: 4 }}>
                        创建者：{String(creator?.name ?? creator?.email ?? '—')}
                      </div>
                      {task.approvalStatus === 'REJECTED' ? (
                        <div className="topbar-muted" style={{ marginTop: 4, color: '#b91c1c' }}>
                          驳回原因：{task.reviewNote || '未填写'}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'grid', gap: 10, minWidth: 180 }}>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="topbar-muted">{tc('status')}</span>
                        <select
                          value={task.status}
                          onChange={(e) => setStatus(task.id, e.target.value)}
                          disabled={!canChangeStatus}
                        >
                          {['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>

                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="logout-btn"
                        >
                          删除
                        </button>
                      ) : (
                        <button type="button" disabled title="当前权限不可删除">
                          不可删除
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">社团活动</h1>
        <p className="page-subtitle">
          {isLeagueAdmin
            ? '审核社团活动申请并发布活动安排。'
            : isOrgAdmin
            ? '社团活动先提交申请，经团委审核通过后生效并同步成员日程。'
            : '查看已发布到你所属组织的活动安排与任务。'}
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

        <div className="page-section">
          <div className="card-soft" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={load}>
              {tc('refresh')}
            </button>
          </div>
        </div>

        {canCreate && (
          <div className="page-section">
            <div className="card-soft">
              <h3 style={{ marginBottom: 14 }}>{isOrgAdmin ? '新活动申请' : t('new')}</h3>
              <p className="topbar-muted" style={{ marginBottom: 14 }}>
                {isOrgAdmin
                  ? '提交后将进入团委审核；通过后自动进入本社与成员活动日程。'
                  : '团委发布后直接生效到组织活动安排。'}
              </p>

              <form onSubmit={createTask} style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
                <input
                  placeholder="任务标题"
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  required
                />

                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="topbar-muted">主组织</span>
                  <select
                    value={form.primaryOrgId}
                    onChange={(e) => setForm((s) => ({ ...s, primaryOrgId: e.target.value }))}
                    required
                  >
                    <option value="">请选择主组织</option>
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {triField(org, 'name', locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="topbar-muted">执行人</span>
                  <select
                    value={form.assigneeId}
                    onChange={(e) => setForm((s) => ({ ...s, assigneeId: e.target.value }))}
                  >
                    <option value="">暂不指定</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email || user.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  关联组织（多选）：
                  <select
                    multiple
                    value={form.relatedOrgIds.split(',').filter(Boolean)}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map(
                        (opt) => opt.value
                      );
                      setForm((s) => ({
                        ...s,
                        relatedOrgIds: selected.join(','),
                      }));
                    }}
                    style={{ height: 120, width: '100%' }}
                  >
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {triField(org, 'name', locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="topbar-muted">开始时间</span>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    min={nowMin}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setForm((s) => {
                        const next = { ...s, startAt: nextStart };
                        if (new Date(next.endAt).getTime() < new Date(nextStart).getTime()) {
                          next.endAt = nextStart;
                        }
                        return next;
                      });
                    }}
                    required
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="topbar-muted">结束时间</span>
                  <input
                    type="datetime-local"
                    value={form.endAt}
                    min={form.startAt || nowMin}
                    onChange={(e) => setForm((s) => ({ ...s, endAt: e.target.value }))}
                    required
                  />
                </label>

                <button type="submit">{isOrgAdmin ? '提交申请' : tc('create')}</button>
              </form>
            </div>
          </div>
        )}

        {isOrgAdmin && (
          <div className="page-section">
            <div className="card-soft">
              <h3 style={{ marginBottom: 12 }}>近期本社活动安排（14天）</h3>
              {recentOrgActivities.length === 0 ? (
                <div className="topbar-muted">暂无近期活动安排</div>
              ) : (
                <ul className="list-clean">
                  {recentOrgActivities.map((task) => (
                    <li key={task.id} className="list-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{triField(task, 'title', locale)}</strong>
                        <span className="badge badge-blue">{sourceLabel(task.source)}</span>
                      </div>
                      <div className="topbar-muted" style={{ marginTop: 6 }}>
                        开始：{formatDateTime(task.startAt)} · 结束：{formatDateTime(task.endAt ?? task.dueAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {isLeagueAdmin && (
          <div className="page-section">
            <div className="card-soft">
              <h3 style={{ marginBottom: 12 }}>社团活动申请审核</h3>
              {pendingRequests.length === 0 ? (
                <div className="topbar-muted">暂无待审核申请</div>
              ) : (
                <ul className="list-clean">
                  {pendingRequests.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{triField(row, 'title', locale)}</strong>
                          <span className={approvalBadgeClass(row.approvalStatus)}>
                            {approvalLabel(row.approvalStatus)}
                          </span>
                        </div>
                        <div className="topbar-muted">
                          申请组织：
                          {triField((row.primaryOrg as Record<string, unknown>) ?? {}, 'name', locale) || '—'} ·
                          申请人：{row.creator?.name || row.creator?.email || '—'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            placeholder="驳回原因（可选）"
                            value={rejectReason[row.id] ?? ''}
                            onChange={(e) => setRejectReason((s) => ({ ...s, [row.id]: e.target.value }))}
                            style={{ flex: 1, minWidth: 260 }}
                          />
                          <button type="button" onClick={() => reviewRequest(row.id, { approve: true })}>
                            通过
                          </button>
                          <button
                            type="button"
                            className="logout-btn"
                            onClick={() =>
                              reviewRequest(row.id, {
                                approve: false,
                                reason: rejectReason[row.id] || undefined,
                              })
                            }
                          >
                            驳回
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {isOrgAdmin ? (
          <>
            {renderTaskList('已安排', orgArrangedTasks, '暂无已安排活动/任务')}
            {renderTaskList('正在审核', orgReviewingTasks, '暂无审核中的活动申请')}
          </>
        ) : (
          renderTaskList('活动与任务列表', tasks, '暂无任务')
        )}

        {me?.role === 'LEAGUE_ADMIN' && overview != null ? (
          <div className="page-section">
            <div className="card-soft">
              <h2 style={{ marginBottom: 14 }}>{t('overview')}</h2>
              <pre className="code-block">
                {JSON.stringify(overview as Record<string, unknown>, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}