'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { Modal } from '@/components/Modal';
import { triField } from '@/lib/tri';
import { useAuthGuard } from '@/lib/use-auth-guard';

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
  targetType?: 'ORGS' | 'ALL_STUDENTS' | 'GRADE' | 'MAJOR' | 'CLASS';
  targetGrade?: string;
  targetMajor?: string;
  targetClass?: string;
  reviewNote?: string;
  descZh?: string;
  descEn?: string;
  descRu?: string;
  relatedOrgs?: Array<{ organizationId?: string; organization?: Record<string, unknown> }>;
  orgReviews?: Array<{
    organizationId?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    organization?: Record<string, unknown>;
  }>;
  primaryOrg?: Record<string, unknown>;
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
  grade?: string | null;
  major?: string | null;
  className?: string | null;
};

type OrgReviewPayload = { approve: boolean; reason?: string };
type TaskChangeLog = {
  id: string;
  action: string;
  detailZh?: string;
  detailEn?: string;
  detailRu?: string;
  createdAt?: string;
  actor?: { name?: string; email?: string } | null;
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

function formatDateTime(value: unknown, locale = 'default') {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
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

function sourceLabel(task: Task, locale: string, isOrgAdmin: boolean) {
  if (task.source === 'LEAGUE_PUBLISHED') return '团委发布';
  if (isOrgAdmin) return '本社团';
  const orgName = triField((task.primaryOrg as Record<string, unknown>) ?? {}, 'name', locale);
  return orgName ? `${orgName}申请` : '社团申请';
}

function participantLabel(task: Task, locale: string) {
  if (task.targetType === 'ALL_STUDENTS') return '全体学生';
  if (task.targetType === 'GRADE') return `年级：${task.targetGrade || '未设置'}`;
  if (task.targetType === 'MAJOR') return `专业：${task.targetMajor || '未设置'}`;
  if (task.targetType === 'CLASS') return `班级：${task.targetClass || '未设置'}`;
  const names = new Set<string>();
  const primary = triField((task.primaryOrg as Record<string, unknown>) ?? {}, 'name', locale);
  if (primary) names.add(primary);
  for (const rel of task.relatedOrgs ?? []) {
    const name = triField((rel.organization as Record<string, unknown>) ?? {}, 'name', locale);
    if (name) names.add(name);
  }
  if (names.size === 0) return '相关社团';
  return Array.from(names).join('、');
}

export default function TasksPage() {
  const t = useTranslations('tasks');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { token, ready } = useAuthGuard();

  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [orgReviewRequests, setOrgReviewRequests] = useState<Task[]>([]);
  const [orgRejectReason, setOrgRejectReason] = useState<Record<string, string>>({});
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [taskLogs, setTaskLogs] = useState<TaskChangeLog[]>([]);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    desc: '',
    assigneeId: '',
    startAt: '',
    endAt: '',
    relatedOrgIds: [] as string[],
  });
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState(() => {
    const now = new Date();
    const start = toLocalDateTimeValue(now);
    const end = toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000));

    return {
      title: '',
      desc: '',
      primaryOrgId: '',
      assigneeId: '',
      relatedOrgIds: '',
      targetType: 'ORGS' as 'ORGS' | 'ALL_STUDENTS' | 'GRADE' | 'MAJOR' | 'CLASS',
      targetOrgIds: [] as string[],
      targetGrade: '',
      targetMajor: '',
      targetClass: '',
      startAt: start,
      endAt: end,
    };
  });

  const nowMin = useMemo(() => toLocalDateTimeValue(new Date()), []);

  const load = useCallback(async () => {
    if (!token) {
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
        setOrgReviewRequests([]);
      } else if (m.role === 'ORG_ADMIN' || (m.managedOrgIds ?? []).length > 0) {
        const [orgReq, logs] = await Promise.all([
          apiFetch<Task[]>('/tasks/org/requests', { token }),
          apiFetch<TaskChangeLog[]>('/tasks/change-logs?limit=20', { token }),
        ]);
        setOrgReviewRequests(Array.isArray(orgReq) ? orgReq : []);
        setTaskLogs(Array.isArray(logs) ? logs : []);
      } else {
        setOrgReviewRequests([]);
        setTaskLogs([]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : tc('error');
      setErr(msg);
      setTasks([]);
      setOrgs([]);
      setUsers([]);
      setOrgReviewRequests([]);
      setTaskLogs([]);
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

  async function setStatus(id: string, status: string) {
    if (!token) return;
    if (!confirmAction(`确认将任务状态更新为 ${localizedTaskStatus(status)} 吗？`)) return;

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
    if (
      !confirmAction(
        isOrgAdmin
          ? '确认提交删除申请吗？提交后需团委审核，通过后才会真正删除。'
          : '确认删除该活动/任务吗？此操作不可恢复。',
      )
    ) {
      return;
    }

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

  async function reviewOrgRequest(taskId: string, payload: OrgReviewPayload) {
    if (!token) return;
    if (!confirmAction(payload.approve ? '确认同意协办该活动吗？' : '确认拒绝协办该活动吗？')) return;
    try {
      await apiFetch(`/tasks/org/requests/${taskId}/review`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      });
      setOrgRejectReason((s) => ({ ...s, [taskId]: '' }));
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
    if (!form.desc.trim()) {
      setErr('请输入活动简介');
      return;
    }

    if (isOrgAdmin && !form.primaryOrgId.trim()) {
      setErr('请选择主组织');
      return;
    }
    if (isLeagueAdmin && form.targetType === 'ORGS' && form.targetOrgIds.length === 0) {
      setErr('请在参与对象中至少选择一个社团');
      return;
    }
    if (isLeagueAdmin && form.targetType === 'GRADE' && !form.targetGrade.trim()) {
      setErr('请选择目标年级');
      return;
    }
    if (isLeagueAdmin && form.targetType === 'MAJOR' && !form.targetMajor.trim()) {
      setErr('请选择目标专业');
      return;
    }
    if (isLeagueAdmin && form.targetType === 'CLASS' && !form.targetClass.trim()) {
      setErr('请选择目标班级');
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
          descZh: form.desc,
          descEn: form.desc,
          descRu: form.desc,
          primaryOrgId:
            isLeagueAdmin && form.targetType === 'ORGS'
              ? form.targetOrgIds[0]
              : form.primaryOrgId || undefined,
          assigneeId: form.assigneeId || undefined,
          relatedOrgIds:
            isLeagueAdmin && form.targetType === 'ORGS'
              ? form.targetOrgIds.slice(1)
              : related.length
                ? related
                : undefined,
          targetType: isLeagueAdmin ? form.targetType : 'ORGS',
          targetGrade: isLeagueAdmin ? form.targetGrade || undefined : undefined,
          targetMajor: isLeagueAdmin ? form.targetMajor || undefined : undefined,
          targetClass: isLeagueAdmin ? form.targetClass || undefined : undefined,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          dueAt: new Date(form.endAt).toISOString(),
        }),
      });

      const now = new Date();
      setForm({
        title: '',
        desc: '',
        primaryOrgId: '',
        assigneeId: '',
        relatedOrgIds: '',
        targetType: 'ORGS',
        targetOrgIds: [],
        targetGrade: '',
        targetMajor: '',
        targetClass: '',
        startAt: toLocalDateTimeValue(now),
        endAt: toLocalDateTimeValue(new Date(now.getTime() + 60 * 60 * 1000)),
      });
      setErr(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  function openEditTask(task: Task) {
    setEditTarget(task);
    setEditForm({
      title: String(triField(task, 'title', locale) || ''),
      desc: String(triField(task, 'desc', locale) || ''),
      assigneeId: String(task.assigneeId ?? ''),
      startAt: task.startAt ? toLocalDateTimeValue(new Date(String(task.startAt))) : '',
      endAt: task.endAt ? toLocalDateTimeValue(new Date(String(task.endAt))) : '',
      relatedOrgIds: relatedOrgIds(task),
    });
  }

  async function submitEditTask() {
    if (!token || !editTarget) return;
    if (!editForm.title.trim() || !editForm.desc.trim()) {
      setErr('请填写活动标题与简介');
      return;
    }
    if (!editForm.startAt || !editForm.endAt) {
      setErr('请填写开始和结束时间');
      return;
    }
    if (!confirmAction('确认保存活动修改并重新提交审核吗？')) return;
    try {
      await apiFetch(`/tasks/${editTarget.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          titleZh: editForm.title.trim(),
          titleEn: editForm.title.trim(),
          titleRu: editForm.title.trim(),
          descZh: editForm.desc.trim(),
          descEn: editForm.desc.trim(),
          descRu: editForm.desc.trim(),
          assigneeId: editForm.assigneeId || undefined,
          startAt: new Date(editForm.startAt).toISOString(),
          endAt: new Date(editForm.endAt).toISOString(),
          dueAt: new Date(editForm.endAt).toISOString(),
          relatedOrgIds: editForm.relatedOrgIds,
        }),
      });
      setEditTarget(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tc('error'));
    }
  }

  const managedOrgIds = useMemo(() => me?.managedOrgIds ?? [], [me?.managedOrgIds]);
  const isLeagueAdmin = me?.role === 'LEAGUE_ADMIN';
  const isOrgAdmin = !isLeagueAdmin && managedOrgIds.length > 0;
  const canCreate = isLeagueAdmin || isOrgAdmin;
  const localizedTaskStatus = (status?: string) => {
    if (status === 'IN_PROGRESS') return t('statusInProgress');
    if (status === 'DONE') return t('statusDone');
    if (status === 'BLOCKED') return t('statusBlocked');
    return t('statusTodo');
  };
  const studentUsers = useMemo(
    () => users.filter((u) => u.role === 'STUDENT'),
    [users],
  );
  const gradeOptions = useMemo(
    () =>
      Array.from(new Set(studentUsers.map((u) => u.grade).filter((v): v is string => !!v))).sort(),
    [studentUsers],
  );
  const majorOptions = useMemo(() => {
    const rows = studentUsers.filter((u) => !form.targetGrade || u.grade === form.targetGrade);
    return Array.from(new Set(rows.map((u) => u.major).filter((v): v is string => !!v))).sort();
  }, [studentUsers, form.targetGrade]);
  const classOptions = useMemo(() => {
    const rows = studentUsers.filter(
      (u) =>
        (!form.targetGrade || u.grade === form.targetGrade) &&
        (!form.targetMajor || u.major === form.targetMajor),
    );
    return Array.from(new Set(rows.map((u) => u.className).filter((v): v is string => !!v))).sort();
  }, [studentUsers, form.targetGrade, form.targetMajor]);
  const targetSummary = useMemo(() => {
    if (form.targetType === 'ALL_STUDENTS') return '全体学生';
    if (form.targetType === 'GRADE') return form.targetGrade ? `年级：${form.targetGrade}` : '未选择年级';
    if (form.targetType === 'MAJOR') return form.targetMajor ? `专业：${form.targetMajor}` : '未选择专业';
    if (form.targetType === 'CLASS') return form.targetClass ? `班级：${form.targetClass}` : '未选择班级';
    if (form.targetOrgIds.length > 0) {
      const names = form.targetOrgIds
        .map((id) => triField((orgs.find((o) => o.id === id) ?? {}) as Record<string, unknown>, 'name', locale))
        .filter(Boolean);
      return names.length ? names.join('、') : '未选择社团';
    }
    return '未选择社团';
  }, [form.targetType, form.targetGrade, form.targetMajor, form.targetClass, form.targetOrgIds, orgs, locale]);
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
  const orgKanban = useMemo(
    () => ({
      todo: orgArrangedTasks.filter((task) => task.status === 'TODO'),
      inProgress: orgArrangedTasks.filter((task) => task.status === 'IN_PROGRESS'),
      done: orgArrangedTasks.filter((task) => task.status === 'DONE'),
    }),
    [orgArrangedTasks],
  );
  const orgReviewingTasks = useMemo(
    () =>
      orgScopedTasks.filter(
        (task) => task.source === 'ORG_REQUEST' && task.approvalStatus !== 'APPROVED',
      ),
    [orgScopedTasks],
  );

  if (!ready || !token) {
    return (
      <div className="page-card">
        <p className="page-subtitle">正在校验登录状态...</p>
      </div>
    );
  }

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
              const canEdit =
                isOrgAdmin &&
                mutableByOrgAdmin &&
                (task.approvalStatus === 'PENDING_APPROVAL' || task.approvalStatus === 'REJECTED');
              const canDelete = isLeagueAdmin || (isOrgAdmin ? mutableByOrgAdmin : false);
              const deleteButtonText = isOrgAdmin ? '申请删除' : '删除';

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
                        <span className={statusBadgeClass(task.status)}>{localizedTaskStatus(task.status)}</span>
                        <span className={approvalBadgeClass(task.approvalStatus)}>
                          {approvalLabel(task.approvalStatus)}
                        </span>
                        <span className="badge badge-blue">{sourceLabel(task, locale, isOrgAdmin)}</span>
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
                      <div className="topbar-muted" style={{ marginTop: 4 }}>
                        参与对象：{participantLabel(task, locale)}
                      </div>
                      <div className="topbar-muted" style={{ marginTop: 4 }}>
                        活动简介：{triField(task, 'desc', locale) || '—'}
                      </div>
                      {task.approvalStatus === 'REJECTED' ? (
                        <div className="topbar-muted" style={{ marginTop: 4, color: '#b91c1c' }}>
                          驳回原因：{task.reviewNote || '未填写'}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'grid', gap: 10, minWidth: 180 }}>
                      {canEdit ? (
                        <button type="button" onClick={() => openEditTask(task)}>
                          {t('editActivity')}
                        </button>
                      ) : null}
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="topbar-muted">{tc('status')}</span>
                        <select
                          value={task.status}
                          onChange={(e) => setStatus(task.id, e.target.value)}
                          disabled={!canChangeStatus}
                        >
                          {['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].map((s) => (
                            <option key={s} value={s}>
                              {localizedTaskStatus(s)}
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
                          {deleteButtonText}
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

  const renderOrgKanban = () => {
    const columns: Array<{ key: 'todo' | 'inProgress' | 'done'; title: string; list: Task[] }> = [
      { key: 'todo', title: '待处理', list: orgKanban.todo },
      { key: 'inProgress', title: '进行中', list: orgKanban.inProgress },
      { key: 'done', title: '已完成', list: orgKanban.done },
    ];

    return (
      <div className="page-section">
        <div className="card-soft">
          <h2 style={{ marginBottom: 12 }}>已安排（任务流转看板）</h2>
          <p className="topbar-muted" style={{ marginBottom: 14 }}>
            流转路径：待处理 → 进行中 → 已完成
          </p>

          <div className="task-flow-board">
            {columns.map((col) => (
              <div key={col.key} className="task-flow-column">
                <div className="task-flow-column-head">
                  <strong>{col.title}</strong>
                  <span className="topbar-muted">{col.list.length}</span>
                </div>
                <div className="task-flow-list">
                  {col.list.length === 0 ? (
                    <div className="task-flow-empty">暂无任务</div>
                  ) : (
                    col.list.map((task) => {
                      const creator = task.creator as Record<string, unknown> | undefined;
                      const assignee = task.assignee as Record<string, unknown> | undefined;
                      const managed = inManagedScope(task, managedOrgIds);
                      const mutableByOrgAdmin = managed && task.source === 'ORG_REQUEST';
                      const canChangeStatus =
                        task.approvalStatus === 'APPROVED' &&
                        (isLeagueAdmin || (isOrgAdmin ? mutableByOrgAdmin : false));

                      return (
                        <article key={task.id} className="task-flow-card">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong>{triField(task, 'title', locale)}</strong>
                            <span className={statusBadgeClass(task.status)}>{localizedTaskStatus(task.status)}</span>
                          </div>
                          <div className="topbar-muted" style={{ marginTop: 6, fontSize: 13 }}>
                            负责人：{String(assignee?.name ?? assignee?.email ?? creator?.name ?? creator?.email ?? '未指定')}
                          </div>
                          <div className="topbar-muted" style={{ marginTop: 4, fontSize: 13 }}>
                            截止：{formatDateTime(task.endAt ?? task.dueAt)}
                          </div>
                          <div className="topbar-muted" style={{ marginTop: 4, fontSize: 13 }}>
                            当前状态：{localizedTaskStatus(task.status)}
                          </div>

                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {task.status === 'TODO' ? (
                              <button
                                type="button"
                                onClick={() => setStatus(task.id, 'IN_PROGRESS')}
                                disabled={!canChangeStatus}
                              >
                                开始处理
                              </button>
                            ) : null}
                            {task.status === 'IN_PROGRESS' ? (
                              <button
                                type="button"
                                onClick={() => setStatus(task.id, 'DONE')}
                                disabled={!canChangeStatus}
                              >
                                标记完成
                              </button>
                            ) : null}
                            {task.status === 'DONE' ? (
                              <button
                                type="button"
                                onClick={() => setStatus(task.id, 'TODO')}
                                disabled={!canChangeStatus}
                              >
                                重新打开
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className="page-title">{isLeagueAdmin ? '团委任务' : t('orgActivityTitle')}</h1>
            <p className="page-subtitle">
              {isLeagueAdmin
                ? '发布和管理团委任务，统一维护任务进度。'
                : isOrgAdmin
                ? t('orgActivityHint')
                : '查看已发布到你所属组织的活动安排与任务。'}
            </p>
          </div>
          <button type="button" onClick={load}>
            {tc('refresh')}
          </button>
        </div>

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

        {isOrgAdmin ? renderOrgKanban() : null}

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
                <textarea
                  rows={3}
                  placeholder="活动简介"
                  value={form.desc}
                  onChange={(e) => setForm((s) => ({ ...s, desc: e.target.value }))}
                  required
                />

                {isLeagueAdmin ? (
                  <div className="card-soft" style={{ display: 'grid', gap: 8 }}>
                    <div className="topbar-muted">参与对象（由略到详逐级选择）</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span>{targetSummary}</span>
                      <button type="button" onClick={() => setTargetPickerOpen(true)}>
                        选择参与对象
                      </button>
                    </div>
                  </div>
                ) : (
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
                )}

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

                {isOrgAdmin ? (
                  <label>
                    共同活动社团（可选，多选后需协办社团与团委共同审核）：
                    <select
                      multiple
                      value={form.relatedOrgIds.split(',').filter(Boolean)}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                        setForm((s) => ({
                          ...s,
                          relatedOrgIds: selected.join(','),
                        }));
                      }}
                      style={{ height: 120, width: '100%' }}
                    >
                      {orgs
                        .filter((org) => org.id !== form.primaryOrgId)
                        .map((org) => (
                          <option key={org.id} value={org.id}>
                            {triField(org, 'name', locale)}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}

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
                        <span className="badge badge-blue">{sourceLabel(task, locale, isOrgAdmin)}</span>
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

        {isOrgAdmin ? (
          <div className="page-section">
            <div className="card-soft">
              <h3 style={{ marginBottom: 12 }}>{t('changeLogsTitle')}</h3>
              {taskLogs.length === 0 ? (
                <div className="topbar-muted">{t('changeLogsEmpty')}</div>
              ) : (
                <ul className="audit-timeline">
                  {taskLogs.map((row) => (
                    <li key={row.id} className="audit-timeline-item">
                      <span className="audit-timeline-dot audit-timeline-dot-pending" />
                      <div className="audit-timeline-main">
                        <div className="audit-timeline-head">
                          <strong>{triField(row as unknown as Record<string, unknown>, 'detail', locale) || row.action}</strong>
                          <span className="topbar-muted">
                            {row.createdAt ? new Date(row.createdAt).toLocaleString(locale) : '—'}
                          </span>
                        </div>
                        <div className="topbar-muted" style={{ fontSize: 12 }}>
                          {t('operator')}：{row.actor?.name || row.actor?.email || 'System'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {isOrgAdmin && (
          <div className="page-section">
            <div className="card-soft">
              <h3 style={{ marginBottom: 12 }}>共同活动社团审核</h3>
              {orgReviewRequests.length === 0 ? (
                <div className="topbar-muted">暂无需要你协办审核的活动申请</div>
              ) : (
                <ul className="list-clean">
                  {orgReviewRequests.map((row) => (
                    <li key={row.id} className="list-item">
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{triField(row, 'title', locale)}</strong>
                          <span className={approvalBadgeClass(row.approvalStatus)}>
                            {approvalLabel(row.approvalStatus)}
                          </span>
                        </div>
                        <div className="topbar-muted">
                          发起社团：{triField((row.primaryOrg as Record<string, unknown>) ?? {}, 'name', locale) || '—'} ·
                          简介：{triField(row, 'desc', locale) || '—'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            placeholder="拒绝原因（可选）"
                            value={orgRejectReason[row.id] ?? ''}
                            onChange={(e) => setOrgRejectReason((s) => ({ ...s, [row.id]: e.target.value }))}
                            style={{ flex: 1, minWidth: 240 }}
                          />
                          <button type="button" onClick={() => reviewOrgRequest(row.id, { approve: true })}>
                            同意协办
                          </button>
                          <button
                            type="button"
                            className="logout-btn"
                            onClick={() =>
                              reviewOrgRequest(row.id, {
                                approve: false,
                                reason: orgRejectReason[row.id] || undefined,
                              })
                            }
                          >
                            拒绝协办
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

        {isOrgAdmin
          ? renderTaskList('正在审核', orgReviewingTasks, '暂无审核中的活动申请')
          : renderTaskList(isLeagueAdmin ? '团委任务列表' : '活动与任务列表', tasks, '暂无任务')}

      </div>

      <Modal
        open={!!editTarget}
        title={t('editModalTitle')}
        onClose={() => setEditTarget(null)}
        width={760}
      >
        {editTarget ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              placeholder="活动标题"
              value={editForm.title}
              onChange={(e) => setEditForm((s) => ({ ...s, title: e.target.value }))}
            />
            <textarea
              rows={3}
              placeholder="活动简介"
              value={editForm.desc}
              onChange={(e) => setEditForm((s) => ({ ...s, desc: e.target.value }))}
            />
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">执行人</span>
              <select
                value={editForm.assigneeId}
                onChange={(e) => setEditForm((s) => ({ ...s, assigneeId: e.target.value }))}
              >
                <option value="">暂不指定</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email || user.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">共同活动社团（可选）</span>
              <select
                multiple
                value={editForm.relatedOrgIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setEditForm((s) => ({ ...s, relatedOrgIds: selected }));
                }}
                style={{ height: 120, width: '100%' }}
              >
                {orgs
                  .filter((org) => org.id !== String(editTarget.primaryOrgId ?? ''))
                  .map((org) => (
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
                value={editForm.startAt}
                onChange={(e) => setEditForm((s) => ({ ...s, startAt: e.target.value }))}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">结束时间</span>
              <input
                type="datetime-local"
                value={editForm.endAt}
                onChange={(e) => setEditForm((s) => ({ ...s, endAt: e.target.value }))}
              />
            </label>
            <button type="button" onClick={submitEditTask}>
              {t('saveAndResubmit')}
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={targetPickerOpen}
        title="选择参与对象"
        onClose={() => setTargetPickerOpen(false)}
        width={760}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="topbar-muted">第一步：选择范围</span>
            <select
              value={form.targetType}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  targetType: e.target.value as typeof s.targetType,
                  targetGrade: '',
                  targetMajor: '',
                  targetClass: '',
                }))
              }
            >
              <option value="ORGS">指定社团</option>
              <option value="ALL_STUDENTS">全体学生</option>
              <option value="GRADE">指定年级</option>
              <option value="MAJOR">指定专业</option>
              <option value="CLASS">指定班级</option>
            </select>
          </label>

          {form.targetType === 'ORGS' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">第二步：选择社团（多选）</span>
              <select
                multiple
                value={form.targetOrgIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setForm((s) => ({ ...s, targetOrgIds: selected }));
                }}
                style={{ height: 160, width: '100%' }}
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {triField(org, 'name', locale)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {form.targetType === 'GRADE' || form.targetType === 'MAJOR' || form.targetType === 'CLASS' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">第二步：选择年级</span>
              <select
                value={form.targetGrade}
                onChange={(e) =>
                  setForm((s) => ({ ...s, targetGrade: e.target.value, targetMajor: '', targetClass: '' }))
                }
              >
                <option value="">请选择年级</option>
                {gradeOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {form.targetType === 'MAJOR' || form.targetType === 'CLASS' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">第三步：选择专业</span>
              <select
                value={form.targetMajor}
                onChange={(e) => setForm((s) => ({ ...s, targetMajor: e.target.value, targetClass: '' }))}
              >
                <option value="">请选择专业</option>
                {majorOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {form.targetType === 'CLASS' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="topbar-muted">第四步：选择班级</span>
              <select
                value={form.targetClass}
                onChange={(e) => setForm((s) => ({ ...s, targetClass: e.target.value }))}
              >
                <option value="">请选择班级</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="topbar-muted">当前选择：{targetSummary}</div>
          <button type="button" onClick={() => setTargetPickerOpen(false)}>
            确认参与对象
          </button>
        </div>
      </Modal>
    </div>
  );
}