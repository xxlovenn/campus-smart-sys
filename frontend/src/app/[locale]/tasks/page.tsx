'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/navigation';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/auth-storage';
import { triField } from '@/lib/tri';

type Me = {
  id: string;
  role: string;
  managedOrgIds?: string[];
};

type Task = Record<string, unknown> & {
  id: string;
  status: string;
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
        const ov = await apiFetch<unknown>('/tasks/admin/overview', { token });
        setOverview(ov);
      } else {
        setOverview(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : tc('error');
      setErr(msg);
      setTasks([]);
      setOverview(null);
      setOrgs([]);
      setUsers([]);
    }
  }, [token, tc]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    if (!token) return;

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

  return (
    <div className="page-container">
      <div className="page-card">
        <h1 className="page-title">{t('list')}</h1>
        <p className="page-subtitle">学生只能管理自己的任务，团委可全局查看与管理。</p>

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
              <h3 style={{ marginBottom: 14 }}>{t('new')}</h3>
              <p className="topbar-muted" style={{ marginBottom: 14 }}>
                标题只填写一次。主组织和执行人可直接选择。关联组织暂时保留文本输入。
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

                <button type="submit">{tc('create')}</button>
              </form>
            </div>
          </div>
        )}

        <div className="page-section">
          <div className="card-soft">
            <h2 style={{ marginBottom: 14 }}>{t('list')}</h2>

            {tasks.length === 0 ? (
              <div className="topbar-muted">暂无任务</div>
            ) : (
              <ul className="list-clean">
                {tasks.map((task) => {
                  const creator = task.creator as Record<string, unknown> | undefined;
                  const assignee = task.assignee as Record<string, unknown> | undefined;
                  const isCreator = creator?.id === me?.id;
                  const isAssignee = assignee?.id === me?.id;
                  const managed = inManagedScope(task, managedOrgIds);
                  const canChangeStatus = isLeagueAdmin || (isOrgAdmin ? managed : isCreator || isAssignee);
                  const canDelete = isLeagueAdmin || (isOrgAdmin ? managed : isCreator);

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